# TESTING.md (§51)

---

## 1. Filosofía

No se busca cobertura alta por sí misma. Se busca que **sea imposible perder plata en
silencio**. La pirámide está deliberadamente cargada abajo, en el dominio financiero:

```
        ╱ e2e (pocos)          → los 3 flujos que el negocio hace a diario
      ╱ integración (medio)    → API + Mongo real, transacciones, idempotencia
    ╱ unitarios (muchos)       → dominio de dinero, tasas, costeo, cartera
```

Herramientas: **Vitest** (front y back), **Supertest** (HTTP),
**mongodb-memory-server** con replica set (las transacciones lo exigen),
**Testing Library** (componentes), **Playwright** (e2e, fase 16).

---

## 2. Escenarios obligatorios del §51

Cada uno es un test con nombre explícito. Si alguno falla, no se despliega.

| #    | Escenario                     | Verifica                                                                     |
| ---- | ----------------------------- | ---------------------------------------------------------------------------- |
| T-01 | Venta de contado              | Ingreso registrado, stock bajado, **sin** cuenta por cobrar                  |
| T-02 | Venta fiada                   | Cuenta por cobrar creada por el total; saldo del cliente incrementado        |
| T-03 | Venta con múltiples productos | Suma exacta de subtotales (`INV-4`); un movimiento de inventario por ítem    |
| T-04 | Venta en USD                  | Snapshot con equivalentes COP y VES congelados                               |
| T-05 | Venta en COP                  | Redondeo a 0 decimales según `Currency.decimals`                             |
| T-06 | Venta en VES                  | Precisión de 2 decimales con tasas de 6+ dígitos                             |
| T-07 | Venta con tasa histórica      | Registrada con fecha pasada usa la tasa vigente en esa fecha, no la de hoy   |
| T-08 | Pago parcial                  | Saldo = original − abono; deuda queda `PARCIAL`                              |
| T-09 | Pago completo                 | Deuda `PAGADA`, saldo exactamente 0 (sin residuo de redondeo)                |
| T-10 | Pago en otra moneda           | Conversión correcta, `rateMode` guardado, `fxDifference` calculada (`RP-05`) |
| T-11 | Cambio de moneda              | Comisión y gastos aplicados; resultado vs tasa de referencia                 |
| T-12 | Compra                        | Stock incrementado; costo promedio recalculado (`RP-02`)                     |
| T-13 | Actualización de inventario   | `stock` == suma de movimientos (`INV-1`)                                     |
| T-14 | Anulación                     | Estado del sistema idéntico al previo (`INV-5`)                              |
| T-15 | Cálculo de utilidad           | Bruta, operativa y cambiaria separadas (`RP-04`)                             |
| T-16 | Conversión de monedas         | Ida y vuelta dentro de tolerancia (`INV-8`); triangulación COP↔VES           |
| T-17 | Cambio de tasa                | Cambiar la tasa actual **no altera** ningún documento histórico (`INV-7`)    |
| T-18 | Stock negativo                | Bloqueado si `allowNegativeStock: false`; advertido si `true` (`RP-14`)      |

---

## 3. Escenarios adicionales que el §51 no pide pero rompen sistemas reales

| #    | Escenario                                                                                                               |
| ---- | ----------------------------------------------------------------------------------------------------------------------- |
| T-20 | **Doble envío**: el mismo `Idempotency-Key` dos veces crea **un** documento (`INV-6`)                                   |
| T-21 | **Concurrencia**: dos ventas simultáneas del último bulto — una gana, la otra recibe 409, el stock nunca queda negativo |
| T-22 | **Sobrepago**: aplicar 150 a una deuda de 100 se rechaza o deja 50 sin aplicar, nunca saldo negativo (`INV-3`)          |
| T-23 | **Un pago a varias deudas**: el reparto FIFO suma exactamente el monto recibido                                         |
| T-24 | **Sin tasa disponible**: el sistema **falla explícito**, jamás asume 1:1                                                |
| T-25 | **Proveedor de tasas caído**: cascada de fallback hasta la última tasa conocida, marcada `STALE`, con alerta            |
| T-26 | **Precisión**: 1/3 repartido en 3 ítems no pierde ni gana un centavo al sumar                                           |
| T-27 | **Landed cost**: los costos adicionales repartidos suman exactamente el total de la compra                              |
| T-28 | **Fallo a mitad de transacción**: si el paso 7 falla, no queda ni venta ni movimiento de inventario                     |
| T-29 | **Permisos**: un VENDEDOR no puede anular una venta (403)                                                               |
| T-30 | **Auditoría**: toda mutación financiera deja su `audit_log` con antes y después                                         |
| T-31 | **Renovación de sesión concurrente**: N llamadas simultáneas producen UNA sola petición de refresco. Regresión de un fallo real (19/08/2026): dos refrescos en paralelo hacían que el segundo llegara con la cookie ya rotada, el servidor lo tomaba por robo de token —correctamente— y la sesión se cerraba en cada recarga |

---

## 4. Test de referencia (el que representa todo el sistema)

```ts
describe('Venta fiada en USD cobrada en VES a tasa actual', () => {
  it('registra la deuda en USD y el cobro en VES sin tocar el histórico', async () => {
    // dado: tasa del día 18
    await givenRate({
      base: 'USD',
      quote: 'VES',
      rate: '890',
      market: 'PARALELO',
      at: '2026-08-18',
    });

    // cuando: venta fiada de 100 USD
    const sale = await api
      .post('/api/sales', {
        customerId,
        currency: 'USD',
        paymentType: 'CREDITO',
        items: [{ productId: papa, quantity: '10', unitPrice: '10' }],
      })
      .set('Idempotency-Key', uuid());

    expect(sale.body.data.rateSnapshot.equivalents.VES).toBe('89000.00');

    // y: al día siguiente cambia la tasa
    await givenRate({ base: 'USD', quote: 'VES', rate: '906.8148', at: '2026-08-19' });

    // entonces: la venta NO cambia            ← INV-7
    const reloaded = await api.get(`/api/sales/${sale.body.data.id}`);
    expect(reloaded.body.data.rateSnapshot.equivalents.VES).toBe('89000.00');

    // y: el cobro en VES a tasa actual salda la deuda y registra la diferencia
    const payment = await api
      .post('/api/payments', {
        customerId,
        currency: 'VES',
        amount: '90681.48',
        rateMode: 'ACTUAL',
      })
      .set('Idempotency-Key', uuid());

    const alloc = payment.body.data.allocations[0];
    expect(alloc.amountApplied).toBe('100.00'); // deuda saldada en USD
    expect(alloc.rateUsed).toBe('906.8148');
    expect(alloc.fxDifference).not.toBe('0'); // RP-05: visible, no oculta

    const receivable = await api.get(`/api/receivables/${sale.body.data.receivableId}`);
    expect(receivable.body.data.balance).toBe('0.00');
    expect(receivable.body.data.status).toBe('PAGADA');
  });
});
```

---

## 5. Front

| Qué              | Cómo                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| `MoneyInput`     | Nunca produce un `number`; respeta los decimales de la moneda                                                     |
| `DataList`       | Renderiza tabla ≥ md y cards < md desde la misma definición                                                       |
| Nueva Venta      | Agregar/quitar ítems, total en vivo, envío optimista y reversión ante error                                       |
| Formateo         | COP sin decimales, VES con 2, separadores en español (`1.080.000,50`)                                             |
| e2e (Playwright) | (1) login → venta fiada → verificar en cuentas por cobrar; (2) abono en otra moneda; (3) compra → inventario sube |

---

## 6. Datos de prueba

Factories deterministas (`makeSale`, `makeCustomer`, `makeRate`) — nunca datos aleatorios en
tests financieros: un test que falla una vez de cada diez es peor que no tener test.

Semilla de desarrollo: 3 productos (papa, cebolla blanca, cebolla roja), 5 clientes, 1 compra
de 300 bultos, 10 ventas mezclando contado/fiado y COP/USD/VES, tasas de los últimos 30 días.

---

## 7. Umbrales

| Área                                                    | Cobertura mínima |
| ------------------------------------------------------- | ---------------- |
| `server/src/domain/**` (dinero, tasas, costeo, cartera) | **95%**          |
| `server/src/services/**`                                | 85%              |
| Controladores y rutas                                   | 70%              |
| Front — componentes de dinero                           | 80%              |
| Resto                                                   | sin umbral       |

CI falla por debajo del umbral en `domain/`. En el resto, informa.
