import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import * as tasas from '../services/tasas.service.js';

export const tasasRouter = Router();

tasasRouter.use(requireAuth);

const numeroTexto = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Escribe un número, por ejemplo 3099.31');

/** Tasa vigente + historial, en una sola llamada para la pantalla de tasas. */
tasasRouter.get('/', async (_req, res) => {
  const hay = await tasas.hayTasa();
  res.json({
    data: {
      vigente: hay ? await tasas.tasaVigente() : null,
      antiguedadHoras: await tasas.antiguedadHoras(),
      historial: await tasas.historial(20),
    },
  });
});

const registrarSchema = z.object({
  usdCop: numeroTexto,
  usdVes: numeroTexto,
  mercado: z.enum(['OFICIAL', 'PARALELO', 'ACORDADA']).optional(),
  nota: z.string().max(200).nullish(),
});

/** Registro manual: siempre disponible, aunque no haya internet (RC-05). */
tasasRouter.post('/', requirePermission('rate:write'), async (req, res) => {
  const entrada = registrarSchema.parse(req.body);
  const tasa = await tasas.registrarTasa({
    ...entrada,
    fuente: 'MANUAL',
    creadoPor: req.user!.id,
  });
  res.status(201).json({ data: tasa });
});

/** Consulta las tasas en internet y las guarda. Si falla, lo dice claro. */
tasasRouter.post('/actualizar', requirePermission('rate:write'), async (req, res) => {
  const tasa = await tasas.actualizarDesdeApi(req.user!.id);
  res.json({ data: tasa });
});
