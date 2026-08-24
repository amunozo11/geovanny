import { env } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { UserModel } from '../models/User.js';
import { CatalogoModel } from '../models/catalogos.js';
import { createUser } from '../services/auth.service.js';
import { actualizarDesdeApi, hayTasa, registrarTasa } from '../services/tasas.service.js';
import { CajaModel } from '../models/caja.js';
import { OperacionModel } from '../models/operacion.js';
import { PagoModel } from '../models/pago.js';
import { GastoModel } from '../models/gasto.js';
import { CargoModel } from '../models/cargo.js';
import { sincronizarContador } from '../models/contador.js';

/**
 * Deja el sistema listo para usarse: administrador, catálogos, productos y una
 * tasa inicial.
 *
 * Es idempotente: se puede ejecutar las veces que haga falta y nunca pisa nada
 * que ya exista. Nunca sobrescribe una contraseña.
 */

const UNIDADES = ['BULTO', 'CAJA', 'SACO', 'KILO', 'UNIDAD'];

const CATEGORIAS_GASTO = [
  ['TRANSPORTE', 'VARIABLE'],
  ['CARGUE', 'VARIABLE'],
  ['COMBUSTIBLE', 'VARIABLE'],
  ['ALIMENTACION', 'VARIABLE'],
  ['COMISIONES', 'VARIABLE'],
  ['ARRIENDO', 'FIJO'],
  ['SERVICIOS', 'FIJO'],
  ['NOMINA', 'FIJO'],
  ['OTROS', 'VARIABLE'],
] as const;

const METODOS_PAGO = ['EFECTIVO', 'TRANSFERENCIA', 'PAGO MOVIL', 'BANCO', 'OTRO'];

/**
 * Los productos NO se siembran.
 *
 * Cada negocio maneja lo suyo, y arrancar con una lista de ejemplo obliga a
 * borrar cosas que nunca se pidieron —naranjas que no se venden— antes de poder
 * usar el sistema. El catálogo se crea desde la pantalla de Inventario, vacío y
 * desde cero.
 */

async function sembrarCatalogos(): Promise<void> {
  const entradas = [
    ...UNIDADES.map((codigo, orden) => ({
      tipo: 'UNIDAD' as const,
      codigo,
      nombre: codigo,
      orden,
    })),
    ...CATEGORIAS_GASTO.map(([codigo, tipo], orden) => ({
      tipo: 'CATEGORIA_GASTO' as const,
      codigo,
      nombre: `${codigo} (${tipo.toLowerCase()})`,
      orden,
    })),
    ...METODOS_PAGO.map((codigo, orden) => ({
      tipo: 'METODO_PAGO' as const,
      codigo,
      nombre: codigo,
      orden,
    })),
  ];

  for (const entrada of entradas) {
    await CatalogoModel.updateOne(
      { tipo: entrada.tipo, codigo: entrada.codigo },
      { $setOnInsert: entrada },
      { upsert: true },
    );
  }
  logger.info({ cantidad: entradas.length }, 'Catálogos listos');
}

/**
 * Una caja por moneda para empezar. Se pueden crear más (banco, pago móvil)
 * desde la pantalla de Cajas.
 */
const CAJAS = [
  { nombre: 'Efectivo pesos', moneda: 'COP' as const, tipo: 'EFECTIVO' as const, orden: 1 },
  { nombre: 'Efectivo dólares', moneda: 'USD' as const, tipo: 'EFECTIVO' as const, orden: 2 },
  { nombre: 'Efectivo bolívares', moneda: 'VES' as const, tipo: 'EFECTIVO' as const, orden: 3 },
];

async function sembrarCajas(): Promise<void> {
  for (const caja of CAJAS) {
    await CajaModel.updateOne({ nombre: caja.nombre }, { $setOnInsert: caja }, { upsert: true });
  }
  logger.info({ cantidad: CAJAS.length }, 'Cajas listas');
}

async function sembrarTasa(): Promise<void> {
  if (await hayTasa()) {
    logger.info('Ya hay tasa registrada');
    return;
  }

  try {
    const tasa = await actualizarDesdeApi();
    logger.info({ usdCop: tasa.usdCop, usdVes: tasa.usdVes }, 'Tasa inicial tomada de internet');
  } catch {
    // Sin internet no se inventa una tasa: se deja el sistema pidiéndola.
    // Preferimos que la primera pantalla diga "registra la tasa" a que arranque
    // con un número falso contaminando todas las cifras (RC-05).
    logger.warn(
      'No se pudo consultar la tasa en internet. ' +
        'Regístrala a mano en la pantalla de Tasas antes de operar.',
    );
    void registrarTasa;
  }
}

/**
 * Rellena `pagadoInicial` en operaciones creadas antes de que ese campo
 * existiera. Sin esto, el cierre de esos días mostraría como fiado lo que se
 * cobró de contado.
 *
 * De una venta PARCIAL antigua no se puede saber cuánto entró en el acto y
 * cuánto fue abono posterior: se toma lo pagado como mejor aproximación y se
 * avisa, en vez de fingir precisión que no existe.
 */
async function migrarPagadoInicial(): Promise<void> {
  const pendientes = await OperacionModel.find({ pagadoInicial: { $in: [null, '0'] } });
  if (pendientes.length === 0) return;

  let dudosas = 0;
  for (const operacion of pendientes) {
    const valor =
      operacion.formaPago === 'CONTADO'
        ? operacion.total.monto
        : operacion.formaPago === 'FIADO'
          ? '0'
          : operacion.pagado;
    if (operacion.formaPago === 'PARCIAL' && operacion.pagado !== '0') dudosas += 1;

    await OperacionModel.updateOne({ _id: operacion._id }, { $set: { pagadoInicial: valor } });
  }

  logger.info({ revisadas: pendientes.length }, 'Operaciones antiguas actualizadas');
  if (dudosas > 0) {
    logger.warn(
      { cantidad: dudosas },
      'En ventas parciales antiguas no se puede distinguir lo pagado en el acto de los abonos posteriores: se tomó el total pagado',
    );
  }
}

/**
 * Deja cada contador por encima del número más alto que ya exista.
 *
 * Corre en cada arranque porque el contador vive aparte de lo que numera y
 * puede quedarse atrás: una importación hecha por fuera, una restauración de
 * copia, alguien que borra la colección. Cuando eso pasa, el sistema reparte
 * números que ya existen y **cada venta, cada abono y cada gasto falla** con un
 * choque de clave duplicada que quien está vendiendo no puede resolver.
 *
 * Es barato (una lectura por prefijo) y con `$max` no puede hacer daño: solo
 * sube el contador, nunca lo baja.
 */
async function sincronizarNumeracion(): Promise<void> {
  const numeros = async (
    documentos: Promise<{ numero: string }[]>,
  ): Promise<string[]> => (await documentos).map((d) => d.numero);

  const fuentes: [string, Promise<string[]>][] = [
    ['V', numeros(OperacionModel.find({ tipo: 'VENTA' }, { numero: 1 }).lean())],
    ['C', numeros(OperacionModel.find({ tipo: 'COMPRA' }, { numero: 1 }).lean())],
    ['P', numeros(PagoModel.find({ direccion: 'ENTRA' }, { numero: 1 }).lean())],
    ['A', numeros(PagoModel.find({ direccion: 'SALE' }, { numero: 1 }).lean())],
    ['G', numeros(GastoModel.find({}, { numero: 1 }).lean())],
    ['D', numeros(CargoModel.find({}, { numero: 1 }).lean())],
  ];

  const ajustados: Record<string, number> = {};
  for (const [prefijo, pendiente] of fuentes) {
    const mayor = await sincronizarContador(prefijo, await pendiente);
    if (mayor > 0) ajustados[prefijo] = mayor;
  }

  logger.info(ajustados, 'Numeración sincronizada');
}

async function sembrarAdmin(): Promise<void> {
  if ((await UserModel.estimatedDocumentCount()) > 0) {
    logger.info('Ya existen usuarios: no se crea el administrador');
    return;
  }

  if (!env.SEED_ADMIN_EMAIL || !env.SEED_ADMIN_PASSWORD) {
    if (env.ACCESO_ABIERTO) {
      logger.info('Acceso abierto: no se crea administrador porque no hace falta');
    } else {
      logger.error(
        'Faltan SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD. ' +
          'Complétalas y vuelve a ejecutar `npm run seed`.',
      );
      process.exitCode = 1;
    }
    return;
  }

  const admin = await createUser({
    name: env.SEED_ADMIN_NAME ?? 'Administrador',
    email: env.SEED_ADMIN_EMAIL,
    password: env.SEED_ADMIN_PASSWORD,
    role: 'ADMIN',
    mustChangePassword: true,
  });

  logger.info({ email: admin.email }, 'Administrador creado. Cambia la contraseña al entrar.');
}

/**
 * Deja la base lista. Es idempotente: no pisa nada de lo que ya exista, así que
 * puede correr en cada arranque sin riesgo.
 */
export async function sembrar(): Promise<void> {
  await sembrarAdmin();
  await sembrarCatalogos();
  await sembrarCajas();
  await sembrarTasa();
  await sincronizarNumeracion();
  await migrarPagadoInicial();
}

/** Punto de entrada de `npm run seed`. */
async function comoScript(): Promise<void> {
  await connectDatabase();
  await sembrar();
  logger.info('Listo. Arranca con `npm run dev`.');
}

// Solo se ejecuta cuando este archivo se invoca directamente, no al importarlo.
if (process.argv[1]?.includes('seed')) {
  comoScript()
    .catch((error) => {
      logger.fatal({ err: error }, 'Falló la siembra');
      process.exitCode = 1;
    })
    .finally(() => disconnectDatabase());
}
