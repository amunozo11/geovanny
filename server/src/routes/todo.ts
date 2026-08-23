import { Router } from 'express';
import { z } from 'zod';
import { MONEDAS } from '@geovanny/shared';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { diaDeHoy } from '../lib/dias.js';
import * as todo from '../services/todo.service.js';

/**
 * TODO: el informe y el cierre de un día, moneda por moneda.
 *
 * Los gastos de este informe son los gastos de siempre (`/api/gastos`): la
 * pantalla los añade por ahí y aquí solo se leen. Un segundo sitio donde
 * guardar gastos habría partido en dos el reporte del mes.
 */
export const todoRouter = Router();

todoRouter.use(requireAuth);

const numeroTexto = z.string().regex(/^\d+(\.\d+)?$/, 'Escribe un número');

todoRouter.get('/', async (req, res) => {
  const dia = String(req.query.dia ?? '') || diaDeHoy();
  res.json({ data: await todo.informeDelDia(dia) });
});

const cierreSchema = z.object({
  dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Falta el día'),
  sobrante: z.record(z.enum(MONEDAS), numeroTexto).default({}),
  observacion: z.string().max(1000).default(''),
});

todoRouter.post('/cierre', requirePermission('report:read'), async (req, res) => {
  const entrada = cierreSchema.parse(req.body);
  const informe = await todo.guardarCierre({ ...entrada, cerradoPor: req.user!.id });
  res.json({ data: informe });
});
