import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { D, MONEDAS } from '@geovanny/shared';
import { PersonaModel, TIPOS_PERSONA } from '../models/persona.js';
import { OperacionModel } from '../models/operacion.js';
import { PagoModel } from '../models/pago.js';
import { CargoModel } from '../models/cargo.js';
import { requireAuth } from '../middleware/auth.js';
import { can } from '../config/permissions.js';
import { ForbiddenError, NotFoundError } from '../lib/errors.js';

export const personasRouter = Router();

personasRouter.use(requireAuth);

const personaSchema = z.object({
  // Solo el nombre es obligatorio: en el negocio los clientes son apodos, sin
  // documento ni dirección (CN-3). Pedir más datos frenaría la venta.
  nombre: z.string().min(1, 'El nombre es obligatorio').max(80),
  tipo: z.enum(TIPOS_PERSONA),
  telefono: z.string().max(40).nullish(),
  notas: z.string().max(300).nullish(),
});

personasRouter.get('/', async (req, res) => {
  const consulta: Record<string, unknown> = { activo: true };
  if (req.query.tipo) consulta.tipo = req.query.tipo;

  const busqueda = String(req.query.q ?? '').trim();
  if (busqueda) consulta.nombre = { $regex: busqueda, $options: 'i' };

  const personas = await PersonaModel.find(consulta).sort({ nombre: 1 }).limit(300);
  res.json({ data: personas });
});

/** Crear un cliente y crear un proveedor son permisos distintos (§42). */
function permisoDe(tipo: string): 'customer:write' | 'supplier:write' {
  return tipo === 'CLIENTE' ? 'customer:write' : 'supplier:write';
}

personasRouter.post('/', async (req, res) => {
  const entrada = personaSchema.parse(req.body);
  if (!can(req.user!.role, permisoDe(entrada.tipo))) {
    throw new ForbiddenError(`Tu rol (${req.user!.role}) no puede crear esto.`);
  }

  const persona = await PersonaModel.create(entrada);
  res.status(201).json({ data: persona });
});

personasRouter.patch('/:id', async (req, res) => {
  const entrada = personaSchema.partial().parse(req.body);

  // Se comprueba el permiso ANTES de escribir: autorizar sobre un documento ya
  // modificado no autoriza nada.
  const actual = await PersonaModel.findById(String(req.params.id));
  if (!actual) throw new NotFoundError('No se encontró la persona.');
  if (!can(req.user!.role, permisoDe(entrada.tipo ?? actual.tipo))) {
    throw new ForbiddenError(`Tu rol (${req.user!.role}) no puede cambiar esto.`);
  }

  const persona = await PersonaModel.findByIdAndUpdate(actual._id, entrada, { new: true });
  res.json({ data: persona });
});

/**
 * Quién debe y cuánto, listo para imprimir.
 *
 * Un renglón por persona y nada más: el nombre y lo que debe en cada moneda.
 * Es la hoja con la que se sale a cobrar —o con la que se va a pagarle a un
 * proveedor—, y ahí el detalle venta a venta solo estorba. Ese detalle ya está
 * en la cuenta de cada quien, a un toque.
 *
 * Sirve para las dos direcciones según `tipo`: lo que te deben los clientes y
 * lo que le debes a los proveedores. Es la misma pregunta vista al revés.
 */
personasRouter.get('/deudas', async (req, res) => {
  const tipo = TIPOS_PERSONA.includes(req.query.tipo as never)
    ? (req.query.tipo as (typeof TIPOS_PERSONA)[number])
    : 'CLIENTE';

  const consulta =
    tipo === 'CLIENTE'
      ? { tipo: 'CLIENTE', activo: true }
      : { tipo: { $in: ['PROVEEDOR', 'TRANSPORTE'] }, activo: true };

  const personas = await PersonaModel.find(consulta).sort({ nombre: 1 });
  const conSaldo = personas.filter((p) => MONEDAS.some((m) => !D(p.saldos[m] ?? '0').isZero()));

  /**
   * Desde cuándo se debe, **por moneda**.
   *
   * El documento pendiente más antiguo de cada moneda. Es lo que convierte una
   * lista de nombres en una hoja de cobro: no es lo mismo deber cien dólares
   * desde el martes que deberlos desde hace tres meses, y ese dato es el que
   * decide a quién se llama primero.
   */
  const ids = conSaldo.map((p) => p._id);
  const [operaciones, cargos] = await Promise.all([
    OperacionModel.find(
      { personaId: { $in: ids }, estado: 'ACTIVA', saldo: { $ne: '0' } },
      { personaId: 1, moneda: 1, fecha: 1 },
    ),
    CargoModel.find(
      { personaId: { $in: ids }, estado: 'ACTIVO', saldo: { $ne: '0' } },
      { personaId: 1, moneda: 1, fecha: 1 },
    ),
  ]);

  const masAntiguo = new Map<string, Date>();
  for (const doc of [...operaciones, ...cargos]) {
    if (!doc.personaId) continue;
    const clave = `${doc.personaId.toString()}|${doc.moneda}`;
    const previo = masAntiguo.get(clave);
    if (!previo || doc.fecha < previo) masAntiguo.set(clave, doc.fecha);
  }

  const filas = conSaldo.map((persona) => {
    const id = persona._id.toString();
    const suyas = MONEDAS.filter((m) => !D(persona.saldos[m] ?? '0').isZero());

    return {
      id,
      nombre: persona.nombre,
      telefono: persona.telefono,
      saldos: Object.fromEntries(suyas.map((m) => [m, persona.saldos[m]!])),
      /** Fecha del documento pendiente más viejo de cada moneda. */
      desde: Object.fromEntries(
        suyas.map((m) => [m, masAntiguo.get(`${id}|${m}`) ?? null]),
      ),
    };
  });

  // Un total por moneda. NO se suman entre ellas: los dólares y los bolívares
  // son cuentas separadas, como en su cuaderno (CN-2).
  const total = Object.fromEntries(
    MONEDAS.map((m) => [
      m,
      filas.reduce((acc, f) => acc.plus(D(f.saldos[m] ?? '0')), D(0)).toString(),
    ]),
  );

  res.json({ data: { generado: new Date(), tipo, filas, total } });
});

/**
 * Estado de cuenta (§6): sus operaciones y sus abonos, en una sola llamada.
 * Es la pantalla que reemplaza la matriz cliente × fecha de su Excel.
 */
personasRouter.get('/:id/cuenta', async (req, res) => {
  const persona = await PersonaModel.findById(String(req.params.id));
  if (!persona) throw new NotFoundError('No se encontró la persona.');

  const personaId = new Types.ObjectId(String(req.params.id));
  const [operaciones, pagos, cargos] = await Promise.all([
    OperacionModel.find({ personaId, estado: 'ACTIVA' }).sort({ fecha: -1 }).limit(100),
    PagoModel.find({ personaId, estado: 'ACTIVO' }).sort({ fecha: -1 }).limit(100),
    // Préstamos y deudas sueltas: para quien debe son un movimiento más de su
    // cuenta, así que viajan en la misma respuesta.
    CargoModel.find({ personaId, estado: 'ACTIVO' }).sort({ fecha: -1 }).limit(100),
  ]);

  res.json({ data: { persona, operaciones, pagos, cargos } });
});
