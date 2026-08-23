import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
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
