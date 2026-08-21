# DATABASE.md — Cómo se guardan los datos

MongoDB. Diez colecciones, no dieciocho: el diseño se simplificó a propósito
para que quepa en la cabeza de quien lo mantenga.

> **Nota (20/08/2026):** este documento describe lo que está construido y
> funcionando. El diseño original planteaba entidades separadas para clientes y
> proveedores, para ventas y compras, y para cuentas por cobrar y por pagar. Al
> implementarlo quedó claro que eran la misma cosa vista al derecho y al revés,
> y unificarlas eliminó la mitad del código sin perder ninguna capacidad.

---

## La idea que sostiene todo: `Importe`

No es una colección, es la forma en que se guarda cualquier cantidad de dinero.

```ts
{
  monto:  "700000",        // lo que se pactó realmente
  moneda: "VES",
  eq: {                    // el mismo valor, congelado, en las tres monedas
    COP: "2420729",
    USD: "781.05",
    VES: "700000"
  },
  tasa: {                  // con qué tasa se calcularon esos equivalentes
    usdCop: "3099.309008",
    usdVes: "896.224496",
    mercado: "PARALELO",
    fuente: "API",
    at: "2026-08-20T08:06:09.000Z"
  }
}
```

Va embebido en cada venta, compra, abono y gasto. De aquí salen dos propiedades
que valen todo el diseño:

1. **Ver el negocio en otra moneda es leer otro campo**, no recalcular nada. Por
   eso el selector de moneda es instantáneo.
2. **El pasado no se mueve.** Cambiar la tasa de hoy no puede alterar una
   operación de ayer, porque nadie la vuelve a calcular (RC-03, §35).

Los importes se guardan como **texto**, no como número: un `number` de
JavaScript no puede representar `906814.802000000001` sin perderlo. Los cálculos
se hacen con precisión decimal exacta y solo se redondea al final, según los
decimales de cada moneda (COP sin centavos, USD y VES con dos).

---

## Las colecciones

### `personas` — clientes y proveedores juntos

```ts
{
  nombre: "MEMIN",
  tipo: "CLIENTE" | "PROVEEDOR" | "TRANSPORTE",
  telefono, notas, activo,
  saldos: { COP: "200000", USD: "0", VES: "431132.65" }
}
```

Un cliente y un proveedor llevan los mismos datos y la misma cuenta corriente;
solo cambia el signo de la relación. Separarlos habría duplicado el modelo, el
servicio y la pantalla.

`saldos` guarda **una deuda por moneda**, porque un mismo cliente puede deber en
dólares y en bolívares a la vez y son cuentas independientes (CN-2). Un saldo
negativo significa que tiene **saldo a favor** (CN-17).

Solo el nombre es obligatorio: sus clientes son apodos —CHIVO, MEMIN, GUARAPO— y
aparecen por primera vez en mitad de una venta (CN-3).

### `operaciones` — ventas y compras juntas

```ts
{
  numero: "V-0001",              // V- ventas · C- compras (viajes)
  tipo: "VENTA" | "COMPRA",
  personaId, personaNombre,
  fecha,
  items: [{ nombre, unidad, cantidad, precio, subtotal, costoUnitario }],
  cargue: [{ concepto: "Cargue y transporte", monto: "1000000" }],
  moneda: "VES",
  total: Importe,
  pagado,                        // crece con cada abono posterior
  pagadoInicial,                 // lo pagado EN EL ACTO; no cambia nunca
  saldo,
  formaPago: "CONTADO" | "FIADO" | "PARCIAL",
  costoTotal, utilidad,          // congelados al vender, en COP
  estado: "ACTIVA" | "ANULADA"
}
```

Son simétricas: en una sale mercancía y nace deuda del cliente; en la otra entra
mercancía y nace deuda con el proveedor. Mismo modelo, mismo servicio, misma
pantalla.

`costoUnitario` se congela en el momento de vender, para que la utilidad de una
venta pasada no cambie cuando suba el costo de reposición (C-3).

En las compras, el **cargue** se reparte entre los productos en proporción a su
valor, y de ahí sale el costo real por bulto (RP-03, §12).

`pagadoInicial` existe para que **el cierre de un día no se mueva**: si se usara
`pagado`, cobrar hoy una venta fiada del martes haría que el martes pasara a
mostrar más "contado" del que hubo (`RC-35`).

### `pagos` — abonos, en las dos direcciones

```ts
{
  numero: "P-0001",              // P- cobros · A- pagos a proveedor
  direccion: "ENTRA" | "SALE",
  personaId, personaNombre,
  importe: Importe,              // lo que efectivamente se recibió
  aplicaA: "VES",                // moneda de la deuda que salda
  montoAplicado: "268867.35",    // cuánto bajó la deuda
  metodo: "EFECTIVO",
  asignaciones: [{ operacionId, numero, monto }],
  aFavor: "0",
  confirmado: true               // la marca "Ok" que él ya usa a mano (CN-16)
}
```

`importe` y `aplicaA` resuelven el caso del §8: recibir 300 dólares y aplicarlos
a una deuda en bolívares. Queda escrito qué entró, a qué se aplicó y con qué
tasa.

Las `asignaciones` reparten el abono sobre las operaciones pendientes, de la más
antigua a la más nueva. El usuario ve **un solo saldo**, como en su cuaderno
(CN-1), pero por dentro se sabe a qué venta fue cada peso.

### `productos`

```ts
{
  nombre: "PAPA",
  unidad: "BULTO",
  stock: "80",                   // proyección; la verdad son los movimientos
  stockMinimo: "0",
  costoPromedio: "114000",       // promedio ponderado, en COP
  precioVenta, monedaVenta,
  activo
}
```

Las cantidades admiten decimales: medio bulto es una venta normal (CN-9).

### `movimientos` — el libro mayor del inventario

```ts
{
  productoId, productoNombre,
  tipo: "COMPRA" | "VENTA" | "MERMA" | "AJUSTE" | "DEVOLUCION" | "ANULACION",
  cantidad: "-20",               // firmada: positiva entra, negativa sale
  stockAntes, stockDespues,
  costoUnitario,
  refTipo, refId, refNumero,     // de qué operación viene
  motivo,                        // obligatorio en ajustes y mermas
  fecha
}
```

El stock del producto **nunca se edita a mano**. Se anota un movimiento y el
stock es la consecuencia (RC-10). Así siempre se puede responder por qué una
existencia es la que es, y recalcularla entera si hiciera falta.

### `tasas`

```ts
{ usdCop, usdVes, mercado, fuente, proveedor, nota, at }
```

Dos números: cuánto vale el dólar en pesos y en bolívares. Todo lo demás
(COP↔VES) se deduce de ahí. Cada cambio crea un registro nuevo, nunca se edita
el anterior, así que queda el histórico completo. La vigente es la más reciente.

Un modelo genérico de pares de divisas sería más correcto en abstracto y mucho
peor de entender y de mantener para este negocio.

### `cajas` y `movimientos_caja` — dónde está el dinero

```ts
// cajas
{ nombre: "Efectivo bolívares", moneda: "VES",
  tipo: "EFECTIVO" | "BANCO" | "MOVIL" | "OTRO",
  saldo: "10377.55", activa: true, orden: 3 }

// movimientos_caja
{ cajaId, cajaNombre, moneda,
  tipo: "INGRESO" | "EGRESO" | "TRASLADO" | "AJUSTE",
  monto: "-89622.45",          // firmado: positivo entra, negativo sale
  saldoAntes, saldoDespues,
  concepto: "Venta V-0003 · MEMIN",
  refTipo, refId, refNumero,   // de qué venta, abono o gasto viene
  trasladoId,                  // une las dos patas de un traslado
  tasaTraslado,                // tasa real si el traslado cruzó de moneda (§16)
  motivo, fecha }
```

Cada caja tiene **una** moneda: los bolívares del bolsillo y los pesos del banco
no son la misma plata aunque sumen.

El saldo es una proyección, igual que el stock: **nunca se edita a mano**. Para
cuadrar se cuenta lo que hay de verdad y el sistema anota la diferencia como un
movimiento con su motivo, así el libro siempre explica el saldo.

Mover dinero entre dos cajas de distinta moneda **es** un cambio de divisa: sale
una cantidad de una y entra otra en la otra, con la tasa real de ese cambio
guardada (`RC-33`). Se puede escribir cuánto se recibió realmente, que es como
se hace en la calle, y el sistema deduce la tasa.

El control de caja **se activa solo cuando existe al menos una caja**. Sin
ninguna, vender y cobrar funciona igual y no se registra nada de dinero: nadie
queda bloqueado por no haber configurado algo (`RC-32`).

### `gastos`

```ts
{ numero: "G-0001", categoria, tipo: "FIJO" | "VARIABLE", descripcion,
  importe: Importe, fecha, estado }
```

### `users`, `catalogos`, `contadores`

Usuarios con su rol; catálogos configurables (unidades, categorías de gasto,
métodos de pago); y contadores para numerar sin huecos con `$inc` atómico, para
que dos ventas simultáneas no puedan recibir el mismo número (RP-07).

---

## Lo que se guarda de una sola vez

Registrar una venta toca cuatro sitios: la operación, un movimiento de
inventario por producto, el stock de cada producto y el saldo del cliente.
**Todo ocurre dentro de una transacción**: o se guarda entero, o no se guarda
nada.

Sin eso, un fallo a media escritura dejaría mercancía descontada por una venta
que no existe, o una deuda sin su venta. Es la clase de error que nadie
descubre hasta que toca cuadrar.

Por eso la base corre en **replica set**, que es lo que MongoDB exige para
soportar transacciones. `npm run dev` la levanta así automáticamente.

---

## Índices

| Consulta | Índice |
|---|---|
| Ventas del día y del mes | `operaciones { tipo, fecha }` |
| Cuenta de una persona | `operaciones { personaId, fecha }` · `pagos { personaId, fecha }` |
| Deudas pendientes | `operaciones { tipo, estado, saldo }` |
| Historial de un producto | `movimientos { productoId, fecha }` |
| Tasa vigente | `tasas { at: -1 }` |
| Buscar cliente o producto | `personas { tipo, nombre }` · `productos { activo, nombre }` |

---

## Lo que aún no está

Control de caja, auditoría consultable y las cuentas de transporte por conductor.
Están diseñadas en el análisis y pendientes de que confirmes si las necesitas —
ver `BUSINESS_RULES.md`.
