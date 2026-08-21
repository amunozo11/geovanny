import { Router } from 'express';
import { MONEDAS, type Moneda } from '@geovanny/shared';
import { requireAuth } from '../middleware/auth.js';
import { ValidationError } from '../lib/errors.js';
import { diaDeHoy } from '../lib/dias.js';
import { detalleDelDia, listaDeDias } from '../services/dias.service.js';

export const diasRouter = Router();

diasRouter.use(requireAuth);

function monedaPedida(valor: unknown): Moneda {
  const pedida = String(valor ?? 'COP').toUpperCase();
  return (MONEDAS as readonly string[]).includes(pedida) ? (pedida as Moneda) : 'COP';
}

/** Resumen de los últimos días: la vista de conjunto. */
diasRouter.get('/', async (req, res) => {
  const cantidad = Number(req.query.cantidad ?? 14);
  res.json({
    data: await listaDeDias(Number.isFinite(cantidad) ? cantidad : 14, monedaPedida(req.query.moneda)),
  });
});

/** Todo lo que se registró un día concreto. */
diasRouter.get('/:dia', async (req, res) => {
  const dia = String(req.params.dia);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
    throw new ValidationError('La fecha debe tener el formato 2026-08-20.');
  }
  if (dia > diaDeHoy()) {
    throw new ValidationError('Todavía no ha llegado ese día.');
  }

  res.json({ data: await detalleDelDia(dia, monedaPedida(req.query.moneda)) });
});
