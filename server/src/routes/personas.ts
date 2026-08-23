import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { D, MONEDAS, conUnidad } from '@geovanny/shared';
import { PersonaModel, TIPOS_PERSONA } from '../models/persona.js';
import { OperacionModel } from '../models/operacion.js';
import { PagoModel } from '../models/pago.js';
import { CargoModel } from '../models/cargo.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { NotFoundError } from '../lib/errors.js';

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

personasRouter.post('/', requirePermission('customer:write'), async (req, res) => {
  const entrada = personaSchema.parse(req.body);
  const persona = await PersonaModel.create(entrada);
  res.status(201).json({ data: persona });
});

personasRouter.patch('/:id', requirePermission('customer:write'), async (req, res) => {
  const entrada = personaSchema.partial().parse(req.body);
  const persona = await PersonaModel.findByIdAndUpdate(String(req.params.id), entrada, { new: true });
  if (!persona) throw new NotFoundError('No se encontró la persona.');
  res.json({ data: persona });
});

/**
 * Quién debe y cuánto, en una sola tabla lista para imprimir.
 *
 * Es la hoja con la que se sale a cobrar: un renglón por persona, sin abrir
 * nada. Por eso va **resumido y no detallado** — el nombre, desde cuándo, qué
 * mercancía tiene pendiente y el total por moneda. El detalle venta a venta ya
 * está en su cuenta, y en una hoja de cobro solo estorba.
 */
personasRouter.get('/deudas', async (req, res) => {
  const tipo = String(req.query.tipo ?? 'CLIENTE');

  const personas = await PersonaModel.find({ tipo, activo: true }).sort({ nombre: 1 });
  const conDeuda = personas.filter((p) => MONEDAS.some((m) => D(p.saldos[m] ?? '0').greaterThan(0)));
  if (conDeuda.length === 0) return res.json({ data: { generado: new Date(), filas: [] } });

  const ids = conDeuda.map((p) => p._id);
  const [operaciones, cargos] = await Promise.all([
    // Solo lo que sigue sin pagarse: la hoja de cobro no lleva lo ya saldado.
    OperacionModel.find({
      personaId: { $in: ids },
      estado: 'ACTIVA',
      saldo: { $ne: '0' },
    }).sort({ fecha: 1 }),
    CargoModel.find({ personaId: { $in: ids }, estado: 'ACTIVO', saldo: { $ne: '0' } }).sort({
      fecha: 1,
    }),
  ]);

  const filas = conDeuda.map((persona) => {
    const id = persona._id.toString();
    const suyas = operaciones.filter((o) => o.personaId?.toString() === id);
    const suyos = cargos.filter((c) => c.personaId.toString() === id);

    // Qué se llevó, sumado por producto: "12 bultos papa · 3 cajas ajo".
    const porProducto = new Map<string, { nombre: string; unidad: string; cantidad: string }>();
    for (const operacion of suyas) {
      for (const item of operacion.items) {
        const clave = item.nombre;
        const previo = porProducto.get(clave);
        porProducto.set(clave, {
          nombre: item.nombre,
          unidad: item.unidad,
          cantidad: D(previo?.cantidad ?? '0').plus(D(item.cantidad)).toString(),
        });
      }
    }

    const debe = [
      ...[...porProducto.values()].map(
        (p) => `${conUnidad(p.cantidad, p.unidad)} de ${p.nombre.toLowerCase()}`,
      ),
      ...suyos.map((c) => c.concepto),
    ];

    const fechas = [...suyas.map((o) => o.fecha), ...suyos.map((c) => c.fecha)].sort(
      (a, b) => a.getTime() - b.getTime(),
    );

    return {
      id,
      nombre: persona.nombre,
      telefono: persona.telefono,
      /** El movimiento pendiente más antiguo: cuánto lleva esperando el cobro. */
      desde: fechas[0] ?? null,
      documentos: suyas.length + suyos.length,
      debe,
      saldos: Object.fromEntries(
        MONEDAS.filter((m) => !D(persona.saldos[m] ?? '0').isZero()).map((m) => [
          m,
          persona.saldos[m]!,
        ]),
      ),
    };
  });

  const total = Object.fromEntries(
    MONEDAS.map((m) => [
      m,
      conDeuda.reduce((acc, p) => acc.plus(D(p.saldos[m] ?? '0')), D(0)).toString(),
    ]),
  );

  res.json({ data: { generado: new Date(), filas, total } });
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
