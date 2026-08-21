/**
 * @geovanny/shared — contratos y núcleo de dinero compartidos por cliente y servidor.
 *
 * Es la única fuente de verdad de los tipos: lo que valida el navegador y lo que
 * valida la API salen del mismo sitio, así que no pueden desincronizarse.
 */

export * from './money/decimal.js';
export * from './money/currency.js';
export * from './money/money.js';
export * from './money/rates.js';
export * from './money/importe.js';
export * from './money/format.js';
export * from './constants/enums.js';
export * from './texto.js';
