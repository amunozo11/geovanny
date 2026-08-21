import { Router } from 'express';
import { healthRouter } from './health.js';
import { authRouter } from './auth.js';
import { currenciesRouter } from './currencies.js';
import { tasasRouter } from './tasas.js';
import { productosRouter } from './productos.js';
import { personasRouter } from './personas.js';
import { operacionesRouter } from './operaciones.js';
import { pagosRouter } from './pagos.js';
import { gastosRouter } from './gastos.js';
import { cajasRouter } from './cajas.js';
import { diasRouter } from './dias.js';
import { resumenRouter } from './resumen.js';

/** Router raíz de la API. */
export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/currencies', currenciesRouter);

apiRouter.use('/tasas', tasasRouter);
apiRouter.use('/productos', productosRouter);
apiRouter.use('/personas', personasRouter);
apiRouter.use('/operaciones', operacionesRouter);
apiRouter.use('/pagos', pagosRouter);
apiRouter.use('/gastos', gastosRouter);
apiRouter.use('/cajas', cajasRouter);
apiRouter.use('/dias', diasRouter);
apiRouter.use('/resumen', resumenRouter);
