# BUSINESS_RULES.md (§48)

Reglas clasificadas en **CONFIRMADAS** (se derivan literalmente del brief), **PROPUESTAS**
(decisión de diseño tomada por mí, razonada, reversible) y **PENDIENTES** (requieren tu
respuesta; el sistema queda configurable para no bloquear el avance).

Cada regla tiene ID estable para poder citarla en el código y en los tests.

---

## A. CONFIRMADAS

### Dinero y monedas

| ID      | Regla                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `RC-01` | El sistema opera como mínimo con COP, USD y VES. Las monedas son datos, no código: se pueden agregar más sin desplegar                     |
| `RC-02` | Ningún valor monetario se calcula con punto flotante. Almacenamiento `Decimal128`, cálculo con `decimal.js`                                |
| `RC-03` | Toda operación financiera guarda un **snapshot inmutable** de la tasa usada. Cambiar la tasa de hoy nunca modifica una operación pasada    |
| `RC-04` | Toda tasa registra: valor, par, mercado, fuente (`API` / `MANUAL` / `ADMINISTRATIVA`), proveedor, fecha de consulta y fecha de vigencia    |
| `RC-05` | El sistema nunca depende exclusivamente de internet para tasas: siempre existe entrada manual                                              |
| `RC-06` | Cada operación guarda su valor original en su moneda original. Las conversiones son adicionales, jamás reemplazan el original              |
| `RC-07` | El dashboard permite cambiar la moneda de visualización sin alterar ningún dato almacenado                                                 |
| `RC-08` | Los totales se muestran discriminados por moneda **y además** convertidos, indicando siempre valor original, valor convertido y tasa usada |

### Inventario

| ID      | Regla                                                                                                                                     |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `RC-10` | El stock nunca se edita directamente. Todo cambio genera un `InventoryMovement`                                                           |
| `RC-11` | Tipos de movimiento: `COMPRA`, `VENTA`, `DEVOLUCION`, `AJUSTE_POSITIVO`, `AJUSTE_NEGATIVO`, `PERDIDA`, `DANIO`, `CORRECCION`, `ANULACION` |
| `RC-12` | Una compra incrementa stock; una venta lo disminuye                                                                                       |
| `RC-13` | Las unidades de medida son configurables (bulto, kilo, unidad, caja, saco, otras). No se asume el bulto                                   |

### Ventas y cartera

| ID       | Regla                                                                                                                                                                                                                                                                                                                                                           |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RC-20`  | Una venta admite múltiples productos, cada uno con su cantidad y su precio                                                                                                                                                                                                                                                                                      |
| `RC-21`  | Una venta es `CONTADO`, `CREDITO` (fiado) o `PARCIAL`                                                                                                                                                                                                                                                                                                           |
| `RC-22`  | Toda venta con saldo pendiente genera automáticamente una cuenta por cobrar                                                                                                                                                                                                                                                                                     |
| `RC-23`  | Un cliente puede tener N deudas simultáneas e independientes. Cada venta es su propia deuda                                                                                                                                                                                                                                                                     |
| `RC-24`  | Un mismo producto puede venderse a distinto precio a cada cliente. Se guarda el precio usado en cada venta                                                                                                                                                                                                                                                      |
| `RC-25`  | Se admiten múltiples abonos parciales sobre una misma deuda                                                                                                                                                                                                                                                                                                     |
| `RC-26`  | Cada abono registra: fecha, hora, monto, moneda, tasa usada, método de pago, observación y usuario                                                                                                                                                                                                                                                              |
| `RC-27`  | Una deuda puede pagarse en una moneda distinta a la de origen, dejando registro de la conversión                                                                                                                                                                                                                                                                |
| `RC-28`  | El estado de cuenta del cliente muestra por operación: fecha, operación, productos, total, abonado y saldo; más totales de deuda, pagado y saldo pendiente                                                                                                                                                                                                      |
| `RC-29`  | **Cobro de deuda antigua (§21, confirmada 19/08/2026):** la pantalla de abono muestra _siempre_ las tres opciones —tasa original, tasa actual y tasa acordada— con sus equivalentes y la diferencia. **El usuario elige en cada cobro**; no hay modo automático. La opción elegida se guarda en `Payment.rateMode` y la diferencia resultante en `fxDifference` |
| `RC-31` | **Las deudas no vencen (confirmada 20/08/2026).** No hay plazo, ni recargo por mora, ni alerta por antigüedad. Una deuda vive hasta que se abona; el sistema no presiona ni marca a nadie como moroso |
| `RC-32` | **Control de caja (confirmada 20/08/2026).** El dinero vive en cajas, cada una de UNA moneda. El saldo nunca se edita a mano: se anota un movimiento y el saldo es la consecuencia, igual que el inventario. Se activa solo cuando existe al menos una caja, así que nadie queda bloqueado por no haberla configurado |
| `RC-33` | **Mover dinero entre cajas de distinta moneda ES un cambio de divisa (§16).** Sale una cantidad de una moneda, entra otra en la otra, y la tasa real de ese cambio queda registrada — puede ser distinta a la del día |
| `RC-34` | **El día es el del negocio, no el del servidor.** Una venta de las 8 p. m. en Colombia ocurre a la 1 a. m. UTC del día siguiente; contarla en el día equivocado descuadraría el cierre. La zona se configura con `TZ_NEGOCIO` |
| `RC-35` | **El cierre de un día no se mueve nunca.** Lo que entró ese día se calcula con `pagadoInicial`, congelado al registrar la operación. Si mañana alguien abona una venta fiada de hoy, ese abono cuenta en el día del abono, no en el de la venta |
| `RC-36` | **Toda operación se puede registrar con la fecha en que ocurrió**, no solo con la de hoy: en el cuaderno también se anota al día siguiente lo de ayer |
| `RC-37` | **Acceso sin contraseña (decidido el 20/08/2026).** La aplicación se publica con `ACCESO_ABIERTO=true`: no pide credenciales y todo el que llegue a la dirección entra como administrador. Se advirtió expresamente que eso expone las deudas, teléfonos y dinero del negocio a cualquiera que conozca la dirección, y aun así es la decisión tomada. La variable permite cerrarlo en cualquier momento sin perder datos |
| `RC-30b` | **Mercado por defecto para VES (confirmada 19/08/2026): `PARALELO`.** Es la tasa con la que el negocio valora sus operaciones en bolívares. La tasa oficial BCV se sigue consultando y almacenando, pero solo como referencia comparativa, nunca para valorar                                                                                                   |

### Compras y costos

| ID      | Regla                                                                                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `RC-30` | El precio de compra **no** es el costo real. Los gastos asociados (transporte, carga, descarga, cambio de moneda, otros) se distribuyen entre los productos de la compra |
| `RC-31` | El costo real unitario resultante es el que se usa para calcular utilidad                                                                                                |

### Auditoría y seguridad

| ID      | Regla                                                                                                            |
| ------- | ---------------------------------------------------------------------------------------------------------------- |
| `RC-40` | Las operaciones financieras no se eliminan físicamente: se **anulan**                                            |
| `RC-41` | Toda operación importante registra fecha, hora, usuario, acción, registro afectado, valor anterior y valor nuevo |
| `RC-42` | Contraseñas siempre con hash seguro. Ningún secreto vive en el frontend                                          |
| `RC-43` | Roles previstos: Administrador, Vendedor, Cajero, Consulta                                                       |

---

## B. PROPUESTAS (decisión mía — dime si cambias alguna)

### `RP-01` — Moneda funcional del negocio: **COP** ✅ CONFIRMADA (19/08/2026)

Para calcular utilidad, costo promedio e inventario valorizado hace falta **una** moneda de
referencia interna; si no, sumar pesos con bolívares no significa nada.

**Decisión del negocio: COP.** `BusinessSettings.functionalCurrency = "COP"`.

Coincide con lo que su propio archivo ya hace (`CN-24`: `GRAN TOTAL` y `TOTAL AL CAMBIO EN
PESOS COLOMBIANO`) y con dónde está realmente el costo: la mercancía se compra y se paga en
pesos, así que el costo promedio no necesita ninguna conversión para ser fiel.

> Decisión previa registrada: el 19/08/2026 se eligió primero VES y se cambió a COP el mismo
> día, al aparecer la evidencia del archivo real.

> Esto **no** cambia nada de lo que el usuario ve: él sigue vendiendo y viendo en la moneda que
> quiera. Es solo la unidad interna de medición del resultado.

**Consecuencia y mitigación.** El costo queda medido sin conversiones (se compra en COP), pero
los ingresos sí se convierten, porque se vende en USD y Bs: la utilidad de cada venta depende
de la tasa del día. Por eso el resultado cambiario va **separado** del operativo (`RP-04`).
Para que la decisión siga siendo reversible sin pérdida de datos:

1. Todo `RateSnapshot` guarda los equivalentes en **COP, USD y VES** (`DATABASE.md §0`), no
   solo en la funcional.
2. `Purchase` conserva precio, moneda y tasa originales, de modo que el costo promedio puede
   recalcularse en cualquier otra moneda desde el histórico.
3. Cambiar a USD o VES más adelante = cambiar un campo de configuración + ejecutar
   `POST /api/admin/recompute-costs`. No hay migración destructiva ni pérdida de historia.
4. Los reportes de utilidad muestran siempre, junto a la cifra en COP, su equivalente en USD
   del período, para que la comparación entre meses no dependa de la devaluación.

### `RP-02` — Método de costeo: promedio ponderado móvil (WAC)

```
costoPromedioNuevo = (stockActual × costoPromedioActual + cantidadComprada × costoUnitarioReal)
                     ────────────────────────────────────────────────────────────────────────
                                        stockActual + cantidadComprada
```

Alternativas descartadas: FIFO (exige capas de lote; más complejo de lo que el negocio
necesita hoy) y último costo (distorsiona con inflación VES). WAC es el equilibrio correcto.

### `RP-03` — Distribución de costos adicionales (landed cost): **por valor**

Ejemplo del §12:

```
Compra:      $20.000.000
Transporte:  $ 1.000.000
Carga:       $   300.000
Cambio:      $   200.000
Otros:       $   100.000
─────────────────────────
Costo real:  $21.600.000     factor = 21.600.000 / 20.000.000 = 1,08

costoRealUnitario(producto) = precioCompraUnitario × 1,08
```

Configurable a **por cantidad** o **por peso** (`BusinessSettings.landedCostMethod`), porque
si en un mismo viaje traes papa barata y algo caro, el transporte realmente se reparte por
peso, no por valor. Por defecto: por valor.

### `RP-04` — Utilidad: dos niveles separados (§56, §57)

```
  Ingresos por ventas (a valor de venta, en moneda funcional a la tasa de la venta)
− Costo de mercancía vendida (Σ cantidad × costoUnitarioSnapshot)
─────────────────────────────────────────────────────────────────
= UTILIDAD BRUTA
− Gastos operativos del período (fijos + variables)
─────────────────────────────────────────────────────────────────
= RESULTADO OPERATIVO          ← mide si el negocio comercial funciona
± Resultado cambiario realizado    (cambios de divisa + cobros a tasa distinta)
± Resultado cambiario no realizado (revaluación de cartera pendiente)
─────────────────────────────────────────────────────────────────
= RESULTADO NETO
```

Nunca se mezclan en una sola cifra. El dashboard muestra los dos.

### `RP-05` — Diferencia cambiaria en un cobro

Deuda de 100 USD, cobrada en VES:

```
diferenciaCambiaria = (montoRecibido / tasaDelCobro) − montoAplicadoALaDeuda(en USD)
```

Positiva = ganancia cambiaria; negativa = pérdida. Se registra en el `Payment` y alimenta el
resultado cambiario **realizado**. No toca la utilidad operativa.

### `RP-06` — Anulación en vez de edición

Anular una venta genera: movimientos de inventario compensatorios, cancelación de la cuenta
por cobrar, reversa de pagos aplicados (que vuelven a quedar disponibles o se reembolsan) y un
`AuditLog` con motivo obligatorio. La venta original permanece visible con estado `ANULADA`.

### `RP-07` — Numeración de operaciones

Correlativo por tipo y por año, sin huecos: `V-2026-00001`, `C-2026-00042`, `P-2026-00318`.
Generado con un contador atómico (`findOneAndUpdate` + `$inc`), nunca contando documentos.

### `RP-08` — Precio sugerido por cliente

Al elegir cliente y producto, el sistema propone en este orden:

1. precio especial vigente para ese cliente,
2. último precio que ese cliente pagó por ese producto,
3. precio de venta por defecto del producto.

Siempre editable. Se muestra de dónde salió el precio (_"último precio a Juan: 45.000"_), que
es exactamente lo que hoy el comerciante recuerda de memoria.

### `RP-09` — Idempotencia

Todo `POST` que mueva dinero o stock exige cabecera `Idempotency-Key` (UUID del cliente).
Repetir la misma clave devuelve el resultado original en vez de duplicar la operación.

---

## C. PENDIENTES DE CONFIRMACIÓN (§47)

> Cada una tiene un **valor por defecto configurable** para no bloquear el desarrollo.
> Ninguna decisión aquí es irreversible.

| ID          | Pregunta                                                                                                                                         | Por defecto mientras tanto                                                                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~`RP-10`~~ | **RESUELTA (20/08/2026): las deudas NO vencen.** Sin fecha de vencimiento, sin intereses y sin avisos por antigüedad. Ver `RC-31` | — |
| `RP-11`     | **¿Qué tasa USD/COP usa realmente?** ¿La del mercado o la de la casa de cambio de la frontera?                                                   | Tasa de mercado, editable manualmente en cada operación                                                                                                                                             |
| ~~`RP-12`~~ | **RESUELTA** → ver `RC-29`                                                                                                                       | —                                                                                                                                                                                                   |
| ~~`RP-13`~~ | **RESUELTA (20/08/2026): sí se lleva control de caja.** Ver `RC-32` | — |
| `RP-14`     | **¿Se permite vender sin stock suficiente?**                                                                                                     | Configurable. Por defecto: se **advierte** pero se permite (así funciona el cuaderno hoy)                                                                                                           |
| `RP-15`     | **¿Los gastos de cambio de moneda son porcentaje o valor fijo?**                                                                                 | Se admiten ambos: comisión `%` y/o monto fijo, por operación                                                                                                                                        |
| `RP-16`     | **¿Se puede cambiar el precio después de vender?**                                                                                               | No. Se anula y se rehace (`RP-06`)                                                                                                                                                                  |
| ~~`RP-17`~~ | **DESCARTADA (20/08/2026): no hay límite de crédito por cliente.** Se fía según la confianza, no según un tope que el sistema imponga | — |
| `RP-18`     | **¿Se manejan devoluciones de mercancía?** ¿Afectan la deuda?                                                                                    | Sí, tipo de movimiento `DEVOLUCION` que genera nota de crédito contra la deuda. Fase posterior al MVP                                                                                               |
| ~~`RP-19`~~ | **RESUELTA por el cuaderno** → el abono va contra el **saldo corriente por moneda**, no contra una venta. Ver `CN-1` y `D-2`                     | —                                                                                                                                                                                                   |
| `RP-20`     | **¿Cuántas personas usarán el sistema y con qué rol?**                                                                                           | Se construye para 1 administrador, con el modelo de roles listo                                                                                                                                     |
| ~~`RP-21`~~ | **RESUELTA por el cuaderno**: precio por unidad del producto (bulto/caja/saco) y **cantidades con decimales** (0,5 · 1,5 · 2,5). Ver `CN-9`      | —                                                                                                                                                                                                   |
| ~~`RP-22`~~ | **RESUELTA por el cuaderno: SÍ, y es crítico.** 4 de las 9 hojas son cuentas de proveedor con abonos numerados. Pasa al MVP. Ver `CN-13` y `D-1` | —                                                                                                                                                                                                   |

---

## D. CONFIRMADAS POR EL CUADERNO REAL

Extraídas de `CUENTAS 12 AGOSTO 2026.xlsx` el 19/08/2026. Detalle y evidencia por celda en
[ANALISIS_CUADERNO.md](ANALISIS_CUADERNO.md).

| ID      | Regla                                                                                                                                                                                                                                                    |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CN-1`  | El cliente tiene **un saldo corriente por moneda**. Los abonos bajan ese saldo global; no se aplican a una venta concreta. Internamente el sistema los reparte FIFO sobre las ventas para conservar trazabilidad, pero la pantalla muestra un solo saldo |
| `CN-2`  | Un mismo cliente puede deber **en USD y en Bs simultáneamente, como cuentas independientes**                                                                                                                                                             |
| `CN-3`  | Los clientes se identifican **por apodo**. Nombre obligatorio; documento y teléfono opcionales y casi siempre vacíos                                                                                                                                     |
| `CN-4`  | Los períodos se cierran arrastrando saldo ("Viene del 25/07/26"), tanto de clientes como de proveedores                                                                                                                                                  |
| `CN-7`  | **`VENTA DIA` = contado · `CLIENTES` = fiado.** Es su vocabulario para el §15                                                                                                                                                                            |
| `CN-8`  | Cada línea de venta se cobra en **una sola moneda**                                                                                                                                                                                                      |
| `CN-9`  | Las cantidades admiten decimales (medio bulto)                                                                                                                                                                                                           |
| `CN-10` | La **merma** sale del inventario sin generar ingreso y se registra como tal                                                                                                                                                                              |
| `CN-11` | El precio del mismo producto varía en cada venta y por cliente                                                                                                                                                                                           |
| `CN-13` | **Compra a proveedores a crédito y les abona.** Cuentas por pagar = funcionalidad crítica                                                                                                                                                                |
| `CN-14` | La compra se llama **viaje** (camionada)                                                                                                                                                                                                                 |
| `CN-15` | El **cargue** es un costo adicional que se suma al viaje                                                                                                                                                                                                 |
| `CN-16` | Cada abono se registra con fecha, **hora** y marca de confirmación **`Ok`**                                                                                                                                                                              |
| `CN-17` | Existe **saldo a favor** cuando el abono supera la deuda, tanto con clientes como con proveedores                                                                                                                                                        |
| `CN-19` | Hay **mercancía en tránsito** ("en la raya") que aún no está en almacén                                                                                                                                                                                  |
| `CN-20` | El **transporte** se lleva en USD como cuenta corriente por viaje y conductor                                                                                                                                                                            |
| `CN-21` | Existe el **adelanto al conductor**, proporcional al valor del viaje                                                                                                                                                                                     |
| `CN-22` | Un abono puede hacerse **en especie** (p. ej. gasoil)                                                                                                                                                                                                    |
| `CN-23` | La pregunta diaria del negocio es **"¿cuánto debo contra cuánto me deben?"**                                                                                                                                                                             |
| `CN-24` | Todo se consolida en **COP** (ver contradicción con `RP-01` en `ANALISIS_CUADERNO.md §9`)                                                                                                                                                                |
| `CN-25` | La conversión Bs→COP se hace **triangulando por USD**, igual que el diseño                                                                                                                                                                               |

### Reglas que el cuaderno NO responde (siguen pendientes)

`RP-13` caja · `RP-15` comisión de cambio · `RP-17` límite de crédito · `RP-18` devoluciones ·
`RP-20` usuarios. Además, el archivo **no registra gastos operativos** (arriendo, nómina,
servicios) ni **operaciones de cambio de divisa** aunque el §17 y el §16 los piden: son
funcionalidad nueva, no digitalización de algo existente.

---

## E. Invariantes que los tests deben proteger (§51)

| ID      | Invariante                                                                            |
| ------- | ------------------------------------------------------------------------------------- |
| `INV-1` | `stock(producto) === Σ qtyDelta` de todos sus movimientos de inventario               |
| `INV-2` | `receivable.balance === receivable.originalAmount − Σ pagos aplicados`                |
| `INV-3` | Un pago nunca puede aplicar más de lo que la deuda debe                               |
| `INV-4` | La suma de subtotales de ítems === total de la venta, sin desviación de redondeo      |
| `INV-5` | Una operación anulada deja el stock y la cartera exactamente como estaban antes       |
| `INV-6` | Reprocesar una `Idempotency-Key` no crea un segundo documento                         |
| `INV-7` | Cambiar la tasa actual no modifica ningún valor histórico almacenado                  |
| `INV-8` | `convertir(convertir(x, A→B), B→A) ≈ x` dentro de la tolerancia de redondeo declarada |
