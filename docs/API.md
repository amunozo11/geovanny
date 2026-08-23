# API.md — Los endpoints que existen

REST sobre `/api`. Todo en JSON, fechas en UTC.

> **Nota (20/08/2026):** este documento se reescribió para describir la API que
> está construida. La versión anterior describía el diseño original —con
> entidades separadas para ventas y compras, clientes y proveedores, cuentas por
> cobrar y por pagar— que se unificó al implementarlo.

**Los importes viajan siempre como texto**, nunca como número de JSON: un
`number` de JavaScript no puede representar `906814.802000000001` sin perder
precisión.

```
Authorization: Bearer <token>
```

Respuestas:

```jsonc
{ "data": { ... } }                                     // éxito
{ "error": { "code": "SIN_STOCK", "message": "Solo quedan 80 bultos de PAPA.",
             "rule": "RP-14", "details": { ... } } }    // error
```

`code` es estable y el cliente lo traduce; `rule` apunta a la regla de
`BUSINESS_RULES.md` que se está haciendo cumplir, para poder rastrear cualquier
rechazo hasta su justificación de negocio.

Códigos: 200, 201, 400 datos inválidos, 401 sin sesión, 403 sin permiso,
404 no existe, 422 lo impide una regla de negocio, 429 demasiadas peticiones,
500, 502 falló un proveedor externo.

---

## `/api/auth`

| Método | Ruta | Qué hace |
|---|---|---|
| POST | `/login` | `{email, password}` → token de acceso + cookie httpOnly de refresco |
| POST | `/refresh` | Renueva el token. Es de un solo uso y rota; reutilizarlo cierra la sesión |
| POST | `/logout` | Invalida la sesión |
| GET | `/me` | Usuario y sus permisos |
| POST | `/change-password` | |

---

## `/api/tasas`

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/` | Tasa vigente, su antigüedad en horas y el historial |
| POST | `/` | Registrar a mano: `{usdCop, usdVes, mercado?, nota?}` |
| POST | `/actualizar` | Consultar internet y guardar. Si falla, lo dice y no inventa nada |

Dos números: cuánto vale el dólar en pesos y en bolívares. El cruce COP↔VES se
deduce de ahí.

---

## `/api/productos`

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/` | `?q=` para buscar por nombre |
| POST | `/` | `{nombre, unidad, precioVenta?, monedaVenta?, stockMinimo?, cantidadInicial?, costoUnitario?, monedaCosto?}` |
| PATCH | `/:id` | **No** toca el stock (RC-10) |
| DELETE | `/:id` | Lo borra si nunca se movió; si tiene historial, lo oculta |
| POST | `/:id/ajuste` | `{cantidad \| nuevaCantidad, tipo, motivo}` — el motivo es obligatorio |
| GET | `/:id/movimientos` | Historial de por qué el stock es el que es |
| GET | `/verificar-stock` | Recalcula desde los movimientos y avisa si algo no cuadra |

`tipo` del ajuste: `MERMA` · `AJUSTE` · `DEVOLUCION`.

**El catálogo empieza vacío**: no se siembra ningún producto de ejemplo, porque
cada negocio maneja lo suyo.

`cantidadInicial` no escribe el stock a mano: crea un movimiento de `AJUSTE` con
el motivo "existencia inicial", así que la regla RC-10 se mantiene. El
`costoUnitario` se declara en la moneda que diga `monedaCosto` y se guarda
convertido a COP, la moneda funcional (RP-01); sin él, el sistema creería que la
mercancía salió gratis y la utilidad saldría inflada.

`nuevaCantidad` es la alternativa a `cantidad` en el ajuste: se dice cuánto hay
de verdad tras contar y el servidor calcula la diferencia. Evita la resta mental,
que es donde se cometen los errores.

Un `DELETE` sobre un producto sin movimientos y con stock cero lo borra de
verdad y libera su nombre; si ya se vendió o se compró alguna vez, solo se
desactiva, porque borrarlo dejaría sin nombre las operaciones donde aparece.
Volver a crearlo con el mismo nombre lo reactiva con su historial.

---

## `/api/personas`

Clientes y proveedores comparten endpoint: son la misma entidad.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/` | `?tipo=CLIENTE` (o `PROVEEDOR`, `TRANSPORTE`) y `?q=` |
| POST | `/` | `{nombre, tipo}` — solo el nombre es obligatorio (CN-3) |
| PATCH | `/:id` | |
| GET | `/deudas` | `?tipo=CLIENTE` — **hoja de cobro**: un renglón por persona con saldo |
| GET | `/:id/cuenta` | **Estado de cuenta**: la persona, sus operaciones y sus abonos |

`saldos` trae una deuda por moneda. Negativo significa saldo a favor.

`GET /deudas` devuelve `{generado, filas, total}`. Cada fila trae `nombre`,
`desde` (el movimiento pendiente más antiguo: cuánto lleva esperando el cobro),
`debe` (la mercancía pendiente sumada por producto, más los conceptos de los
préstamos) y `saldos` por moneda. Va **resumido y no detallado** a propósito: es
la hoja con la que se sale a la calle, y ahí el detalle venta a venta estorba.
Solo entra lo que sigue sin pagarse.

---

## `/api/operaciones`

Ventas y compras (viajes).

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/` | `?tipo=&canal=&personaId=&desde=&hasta=&pendientes=true&limite=` |
| GET | `/:id` | |
| POST | `/` | Crear. `?forzar=true` permite vender sin existencias |
| PATCH | `/:id` | Corregir: `{items?, moneda?, fecha?, cargue?, nota?, motivo?}`. `?forzar=true` |
| POST | `/:id/anular` | `{motivo}` — revierte inventario y deuda. No hay DELETE |

### `POST /api/operaciones`

```jsonc
{
  "tipo": "VENTA",                    // VENTA | COMPRA
  "canal": "CLIENTE",                 // CLIENTE | DIRECTA (mostrador, sin persona)
  "personaId": "…",                   // nulo solo si canal es DIRECTA
  "moneda": "VES",                    // en qué se pacta la operación
  "items": [
    { "productoId": "…", "cantidad": "20", "precio": "35000" }
  ],
  "cargue": [                         // solo compras (CN-15)
    { "concepto": "Cargue y transporte", "monto": "1000000" }
  ],
  "formaPago": "FIADO",               // CONTADO | FIADO | PARCIAL
  "pagado": "0",                      // si es PARCIAL
  "nota": null
}
```

Todo ocurre en **una transacción**: la operación, un movimiento de inventario
por producto, el stock de cada producto y el saldo de la persona. O se guarda
entero o no se guarda nada.

En las compras, el cargue se reparte entre los productos según su valor y de ahí
sale el costo real por unidad. En las ventas se congelan el costo y la utilidad.

Errores propios: `SIN_STOCK` (422), `SIN_TASA` (422 — hay que registrar la tasa
antes de operar), `PAGO_MAYOR`, `CANTIDAD_INVALIDA`, `SIN_ITEMS`, `SIN_PERSONA`,
`DIRECTA_NO_FIADA`.

---

## `/api/ventas-totales`

Las ventas de mostrador: se despacha, se cobra en el acto y no hay cliente al que
cargarle nada.

Por dentro **son operaciones normales** con `canal: "DIRECTA"`, así que descuentan
inventario, entran en caja y cuentan en el inicio y en el cierre del día igual que
cualquier venta. Tienen su propio endpoint porque se registran y se leen distinto:
producto por producto, y con un corte del día en las tres monedas.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/` | `?dia=YYYY-MM-DD` (por defecto hoy) — corte del día |
| POST | `/` | Un registro: `{productoId, cantidad, precio, moneda, cajaId?, fecha?, forzar?}` |
| POST | `/lote` | `{lineas: [...]}` — hasta 50 de una vez |
| POST | `/:id/anular` | `{motivo?}` — devuelve la mercancía y saca la plata de la caja |

`POST /lote` guarda **cada línea por separado**, con su propia transacción, y
responde `{guardadas: [{indice, id, numero}], fallidas: [{indice, codigo, mensaje}]}`.
Si la tercera falla por falta de existencias, las dos primeras siguen guardadas:
deshacerlas todas obligaría a volver a teclearlas, que es justo lo que este
módulo viene a evitar.

**La moneda es de cada línea, no de la tanda.** En el mostrador una venta se
cobra en bolívares y la siguiente en dólares; `POST /lote` acepta líneas con
monedas distintas y cada una cae en la caja de la suya.

`forzar: true` registra aunque no haya existencias, igual que `?forzar=true` en
las ventas normales (RP-14).

`GET /` devuelve los totales del día, el desglose por producto y la lista
registro por registro. Los totales traen **dos cifras que no son lo mismo** y por
eso viajan separadas:

- `cobrado`: la plata que entró de verdad en cada moneda. Si vendió 20 USD y
  4.000 Bs, tiene 20 dólares en un bolsillo y 4.000 bolívares en el otro.
- `porMoneda`: ese mismo dinero visto en cada moneda, para tener un total único.

Enseñar solo `porMoneda` es lo que confunde: `US$ 40` y `Bs. 8.000` parecen dos
ventas distintas y son la misma, convertida. `porProducto` trae las dos igual,
más `registros` y `cantidad`.

Los equivalentes usan la tasa **congelada** de cada venta, así que el corte de un
día pasado no se mueve aunque hoy la tasa sea otra (RC-03).

### Corregir: la misma regla en los tres

`PATCH` sobre una operación, un abono o un cargo sigue siempre el mismo criterio:

- Si solo cambian los campos que **no mueven dinero** —la nota en una operación;
  el método y la nota en un abono; el concepto, el tipo y la nota en un cargo—
  se edita en el sitio. Crear dos documentos por arreglar una errata solo
  ensucia el historial.
- Si cambia el dinero o la mercancía **no se edita**: se anula el original y
  nace uno nuevo, y la respuesta es el nuevo. Una venta no es una fila con un
  total: es un movimiento de inventario por producto, el stock de cada uno, el
  costo promedio, la deuda de la persona, el dinero en la caja y la utilidad
  congelada. Cambiar "12" por "10" a mano dejaría las otras seis cosas cuadradas
  contra un número que ya no existe. Los dos documentos quedan en la cuenta,
  enlazados por la nota.

**La corrección conserva la tasa congelada del original** (`tasaOriginal` por
dentro). Sin eso, arreglar una cantidad de una venta de la semana pasada la
revaluaría con la tasa de hoy y movería el cierre de aquel día (RC-03).

Nada que ya haya recibido abonos se puede corregir ni anular (`TIENE_ABONOS`,
RP-06): primero hay que deshacer los abonos.

`asignacionesCargo` reparte lo que sobre sobre los préstamos y deudas sueltas de
la persona, después de las ventas. Sin eso, abonar un préstamo dejaría el abono
entero marcado como "a favor".

---

## `/api/cargos`

Deudas que **no** vienen de una venta: un préstamo en efectivo, una deuda vieja
que se pasa al sistema, un saldo mal registrado que hay que corregir.

Existen porque el saldo de una persona no se toca a mano. Igual que el stock se
mueve con movimientos y no escribiendo el número (RC-10), la deuda se mueve con
documentos: siempre se puede responder de dónde salió cada peso que alguien debe.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/` | `?personaId=&pendientes=true` |
| POST | `/` | `{personaId, tipo, concepto, monto, moneda, salioDeCaja?, cajaId?, fecha?, nota?}` |
| PATCH | `/:id` | Corregir. Los mismos campos, todos opcionales, más `motivo` |
| POST | `/:id/anular` | `{motivo}` — devuelve el saldo y la plata a la caja |

`tipo`: `PRESTAMO` (sale plata de la caja) · `DEUDA` (ya se debía, no mueve
dinero) · `AJUSTE` (corrige un saldo). `salioDeCaja` decide de verdad si se
descuenta de la caja; por defecto es `true` solo para `PRESTAMO`, porque el
sistema no puede adivinar si el billete salió del cajón.

El `concepto` es obligatorio: una deuda sin explicación es el problema que este
sistema viene a resolver. Numeración propia `D-0001`.

Se saldan con los mismos abonos de `/api/pagos` y aparecen en
`GET /api/personas/:id/cuenta`. Un cargo con abonos no se puede anular
(`TIENE_ABONOS`, RP-06): hay que anular antes los abonos.

Permisos: `charge:create` y `charge:void`, solo ADMIN.

---

## `/api/todo`

El día entero, **moneda por moneda**. Es el cierre de caja.

La regla que manda aquí es que **nada se convierte**. En el resto de la API todo
se puede leer llevado a una sola moneda, que sirve para comparar; para cerrar la
caja no sirve, porque los bolívares y los dólares están en bolsillos distintos y
se cuentan por separado. Cada cifra viene en la moneda en que se pactó o se pagó.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/` | `?dia=YYYY-MM-DD` (por defecto hoy) — el informe completo |
| POST | `/cierre` | `{dia, sobrante:{COP,USD,VES}, observacion}` — guarda lo contado |

`GET /` devuelve:

- `vieneDeAntes` — el sobrante del **último cierre anterior** a ese día. No el de
  ayer exacto: si el domingo no se abrió, el lunes arranca con lo del sábado.
- `ventas` — `vendido`, `contado`, `fiado` y el desglose `porProducto`. El
  contado sale de `pagadoInicial`, que no cambia, así que el cierre de un día
  pasado no se mueve cuando alguien abona una venta vieja.
- `entradas` — `contado` + `cobrado` (abonos de clientes) = `recogido`.
- `salidas` — `gastado` + `aProveedores` + `prestado`, con la lista de cada uno.
- `queda` = recogido − salidas · `deberiaQuedar` = `vieneDeAntes` + `queda`.
- `cierre` — lo contado, la observación y la `diferencia` contra lo calculado.

Los gastos son los de siempre (`POST /api/gastos` con la `fecha` de ese día):
no hay un segundo sitio donde guardarlos, porque partiría en dos el reporte del
mes.

`POST /cierre` es idempotente por día (upsert) y **no valida** lo contado contra
lo calculado a propósito: si contó 20 mil de menos, eso es un dato, no un error
que haya que impedir. Se guarda tal cual y la diferencia queda a la vista.

---

## `/api/pagos`

Abonos, en las dos direcciones.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/` | `?personaId=&direccion=&limite=` |
| POST | `/` | Registrar abono |
| PATCH | `/:id` | Corregir. Los mismos campos, todos opcionales, más `motivo` |
| POST | `/:id/anular` | `{motivo}` — devuelve el saldo a las operaciones |

### `POST /api/pagos`

```jsonc
{
  "personaId": "…",
  "direccion": "ENTRA",               // ENTRA cobras · SALE le pagas al proveedor
  "monto": "300",
  "moneda": "USD",                    // en qué te paga
  "aplicaA": "VES",                   // a qué deuda se aplica (§8)
  "metodo": "EFECTIVO",
  "tasaAcordada": null                // { usdCop, usdVes } si se pacta otra (§21)
}
```

La respuesta trae `montoAplicado` (cuánto bajó la deuda, en su moneda),
`asignaciones` (a qué operaciones fue, de la más antigua a la más nueva) y
`aFavor` (lo que sobró y queda a favor de la persona).

---

## `/api/gastos`

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/` | `?desde=` |
| POST | `/` | `{categoria, tipo, descripcion, monto, moneda}` |
| POST | `/:id/anular` | |

---

## `/api/cajas`

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/` | `?moneda=` añade el equivalente de cada saldo a la tasa de hoy |
| GET | `/movimientos` | `?cajaId=` — de dónde salió cada peso |
| POST | `/` | `{nombre, moneda, tipo, saldoInicial?}` |
| POST | `/:id/ajuste` | `{saldoReal, motivo}` — se dice cuánto hay, no la diferencia |
| POST | `/traslado` | `{origenId, destinoId, monto, montoDestino?}` |
| GET | `/verificar` | Recalcula los saldos desde los movimientos y avisa si algo no cuadra |

El traslado entre cajas de distinta moneda es un **cambio de divisa** (§16):
`montoDestino` es lo que realmente recibiste, y de ahí sale la tasa. Si se omite,
se usa la tasa del día.

El dinero de las ventas, abonos y gastos entra y sale de las cajas
automáticamente; `cajaId` es opcional en esas operaciones y por defecto se usa la
caja de esa moneda.

---

## `/api/dias`

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/` | `?cantidad=14&moneda=` — resumen de los últimos días, uno por línea |
| GET | `/:dia` | `2026-08-20` — **todo lo que se registró ese día**, con sus totales |

El detalle trae los movimientos en orden cronológico —ventas, abonos, viajes,
gastos y mermas— y los totales del día: vendido, de contado, fiado, cobrado,
comprado, gastado y "entró menos salió".

El día es el del negocio (`TZ_NEGOCIO`, por defecto `America/Bogota`), no el del
servidor: una venta de las 8 p. m. pertenece a ese día aunque en UTC ya sea el
siguiente.

Ventas, viajes, abonos y gastos aceptan `fecha`, para registrar hoy algo que
ocurrió ayer.

---

## `/api/resumen`

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/` | `?moneda=COP` (o `USD`, `VES`) — **todo el inicio en una sola llamada** |

Una petición y no doce: en el celular, cada petición extra se nota.

Devuelve `meDeben` y `debo` (con el detalle por moneda y el consolidado), ventas
de hoy y del mes, compras, gastos, ganancia, inventario, quién te debe, últimas
ventas, **el dinero que hay en cada caja** y la tasa usada. Si todavía no hay tasa registrada, devuelve
`{ sinTasa: true }` en vez de inventarse cifras.

---

## `/api/health`

Estado de la API y de la base de datos. No pide sesión.

---

## Permisos por rol

| Acción | ADMIN | VENDEDOR | CAJERO | CONSULTA |
|---|:--:|:--:|:--:|:--:|
| Vender | ✅ | ✅ | ✅ | — |
| Anular | ✅ | — | — | — |
| Registrar abonos | ✅ | ✅ | ✅ | — |
| Comprar (viajes) | ✅ | — | — | — |
| Ajustar inventario | ✅ | — | — | — |
| Productos | ✅ | ver | ver | ver |
| Clientes | ✅ | crear | ver | ver |
| Gastos | ✅ | — | ✅ | ver |
| Tasas | ✅ | ver | ✅ | ver |
| Usuarios y configuración | ✅ | — | — | — |

---

## Lo que no existe, a propósito

No hay descarga de informes en PDF, Excel ni CSV: la información se consulta en
pantalla (decidido el 20/08/2026). Tampoco hay nada relacionado con vencimientos
ni mora, porque **las deudas no vencen** (`RC-31`).
