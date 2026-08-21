# Análisis del sistema actual — `CUENTAS 12 AGOSTO 2026.xlsx` (§46, §76)

Análisis celda por celda del archivo real. **No se inventó ningún dato**: todo lo que aparece
aquí sale de una celda concreta, y lo ilegible o ausente se marca como tal.

Fecha del archivo: **12 de agosto de 2026**. Período cubierto: **25/07/2026 – 12/08/2026**.

---

## 1. Estructura real: 9 hojas

| Hoja             | Qué es                                                                          | Filas |
| ---------------- | ------------------------------------------------------------------------------- | ----- |
| `DEUDAS`         | **Tablero consolidado**: lo que él debe vs. lo que le deben, todo llevado a COP | 16    |
| `PROV-JULITO`    | Cuenta corriente del proveedor Julio — ajo (cajas)                              | 57    |
| `PROV-SEBASTIAN` | Cuenta corriente del proveedor Sebastián                                        | 57    |
| `PROV-HIJINIO`   | Cuenta corriente de Hijinio (Yeimi Alexandra) — papa gruesa                     | 69    |
| `JOSE QUEMAO`    | **Bitácora de camiones entrantes** — transporte, en USD                         | 33    |
| `CLIENTES No. 1` | **Matriz cliente × fecha** de deudas y abonos, en USD y en Bs                   | 129   |
| `WILMER`         | Vista de solo lectura: "información para cobro"                                 | 65    |
| `STOCK`          | Ventas por producto con precio y marca contado/fiado                            | 38    |
| `Hoja1`          | Borrador (`3754 − 3533 = 221`)                                                  | 4     |

---

## 2. El flujo real del negocio (deducido de los datos)

```
   COLOMBIA                    LA RAYA                   VENEZUELA
   ─────────                   ───────                   ─────────
   Compra a proveedores        Camión                    Venta al detal
   EN PESOS (COP)         ───▶ (José Quemao)  ───▶       EN USD o EN Bs
   a crédito, con abonos       cobra en USD              contado o fiado
                               por viaje
```

**Compra en pesos, vende en dólares y bolívares.** El COP **no aparece nunca** como moneda de
venta en la hoja `STOCK`: solo USD y Bs. Y el USD/Bs no aparece nunca como moneda de compra a
proveedores de mercancía: esos se pagan en COP. El único puente entre los dos mundos son las
conversiones manuales de la hoja `DEUDAS`.

---

## 3. Hoja `CLIENTES No. 1` — el corazón del sistema

### Forma

Es una **matriz de doble entrada**, duplicada para cada moneda:

```
            B          C       D       E       F       G      ...  O        P
         "Viene    28/07   30/07   01/08   04/08   07/08       TOTAL   A DEBER
          del
          25/07"
ALEX PULGA  111       0       0       0       0       0         111      71
BRANYER    1350    1200       0       0    3200       0        5750    4250
COLLA      2620       0    1990     200     400     200        5410     800
...
                    ▲ cada columna es un DÍA DE VENTA (cada 2–3 días)

            R          S       T       U       V      ...  AD
         28/07      30/07   01/08   04/08   07/08          TOTAL ABONOS
ALEX PULGA   0        40       0       0       0              40
```

- Filas 7–33: **27 clientes que deben en USD** → total a deber **12.990 US$**
- Filas 47–75: **29 clientes que deben en Bs** → total a deber **8.217.000 Bs**
- `O` = suma de cargos · `AD` = suma de abonos · `P = O − AD` = saldo

### Reglas de negocio que esto revela

| ID       | Regla descubierta                                                                                                                                                                                                     |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CN-1** | Un cliente tiene **un saldo corriente por moneda**, no una deuda por cada venta. Los abonos bajan el saldo global, no se aplican a una venta concreta                                                                 |
| **CN-2** | Un mismo cliente puede deber **en USD y en Bs a la vez, y son cuentas separadas** (MARWIN debe 222 US$ y 77.000 Bs; JHIM 55 US$ y 730.000 Bs; JOSE RICHARD 305 US$ y 50.000 Bs)                                       |
| **CN-3** | Los clientes se identifican **por apodo**, no por nombre legal ni documento: `CHIVO`, `MOSQUITO`, `COLLA`, `MEMIN`, `GUARAPO`, `PIRRY`, `KATIRE`, `CHISPAS`, `OJOTO`, `VIEJO (VIEJITO)`, `LUIS CEBOLLA`, `LUIS YUMBO` |
| **CN-4** | El período se cierra y arranca con un **saldo de arrastre**: `"Viene del 25/07/26"`                                                                                                                                   |
| **CN-5** | Las ventas se agrupan **por día de venta**, no por factura. Los días son ~cada 2–3 días (28/07, 30/07, 01/08, 04/08, 07/08)                                                                                           |
| **CN-6** | **No hay detalle de productos por cliente.** El cuaderno sabe _cuánto_ debe cada quien, pero no _qué_ compró                                                                                                          |

> **CN-6 es la carencia más grave del sistema actual** y la que más valor aporta digitalizar:
> hoy es imposible responder "¿qué compró MEMIN?" o "¿cuánto gano vendiéndole a CHISPAS?".

---

## 4. Hoja `STOCK` — inventario y ventas por producto

Cinco productos en bloques paralelos, cada uno con su stock inicial y sus líneas de venta:

| Producto       | Unidad |    Stock inicial | Vendido | **Stock final** |
| -------------- | ------ | ---------------: | ------: | --------------: |
| PAPA           | bultos | 508 (`=274+234`) |     123 |         **385** |
| AJO            | cajas  |              225 |      76 |         **149** |
| CEBOLLA ROJA   | bultos |               31 |      31 |           **0** |
| CEBOLLA BLANCA | cajas  |               25 |      24 |           **1** |
| NARANJA        | cajas  |                0 |       0 |           **0** |

Cada línea de venta tiene: **cantidad · precio en US$ · precio en Bs · total · etiqueta**.

| ID        | Regla descubierta                                                                                                      |
| --------- | ---------------------------------------------------------------------------------------------------------------------- |
| **CN-7**  | 🔑 **La etiqueta `CLIENTES` vs `VENTA DIA` es exactamente fiado vs contado.** Es su vocabulario para el §15            |
| **CN-8**  | Cada línea se cobra **en una sola moneda**: o se llena la columna US$ o la de Bs, la otra queda en 0                   |
| **CN-9**  | Las cantidades admiten **decimales**: 0,5 · 1,5 · 2,5 bultos. La unidad no es indivisible                              |
| **CN-10** | La **`MERMA`** se anota escribiendo la palabra en la columna de precio: sale del inventario sin generar ingreso        |
| **CN-11** | El precio del mismo producto cambia en cada venta: papa entre 32.000 y 38.000 Bs, y entre 39 y 41 US$. Confirma el §14 |
| **CN-12** | El stock se calcula por resta: `inicial − vendido`. No hay trazabilidad de por qué cambió                              |

---

## 5. Hojas de proveedores — compras a crédito

Tres hojas con la **misma plantilla** (`PROV-JULITO`, `PROV-SEBASTIAN`, `PROV-HIJINIO`):

```
BULTOS o CAJAS                              CARGUE            VALOR TOTAL
FECHA    CANTIDAD   PRECIO   VALOR TOTAL    PRODUCTO PRECIO   (Viajes)
27/07      661      104.000   68.744.000     PAPA      0        68.744.000
30/07      260      106.000   27.560.000     PAPA      0        27.560.000
05/08      228      100.000   22.800.000     PAPA      0        22.800.000
                                             TOTAL VIAJES      ...
                                             TOTAL DEUDA       ...
SALDOS PENDIENTES              ABONOS AL PROVEEDOR
VALOR No.1  No.2  No.3         ABONO No. 1   10.000.000  27/07  Ok  2:34 p.m.
                               ABONO No. 2   10.000.000  27/07  Ok  4:20 p.m.
                               ... hasta ABONO No. 20
                               TOTAL ABONOS
                    (A deber) DEUDA TOTALIZADA = TOTAL DEUDA − TOTAL ABONOS
                    TOTAL A FAVOR DE GIOVANNIS = IF(deuda<0, deuda, "")
```

| ID        | Regla descubierta                                                                                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CN-13** | 🔑 **Le compra a crédito a los proveedores y les abona igual que sus clientes le abonan a él.** La cuenta por pagar es la mitad del negocio: 4 de 9 hojas               |
| **CN-14** | La unidad de compra es el **VIAJE** (camionada), no "la compra". `TOTAL VIAJES`                                                                                         |
| **CN-15** | El **`CARGUE`** es un costo aparte que se suma al viaje: es el costo adicional del §12, y ya existe en su plantilla                                                     |
| **CN-16** | Cada abono se registra con **fecha, hora y una marca `Ok`** de confirmación. Ya practica auditoría (§22) a mano                                                         |
| **CN-17** | Contempla **saldo a favor**: si la deuda queda negativa, "TOTAL A FAVOR DE GIOVANNIS"                                                                                   |
| **CN-18** | Arrastra saldo anterior también con proveedores: `"Viene de 25/07/2026" = 38.918.492`                                                                                   |
| **CN-19** | Hay **stock en tránsito**: `"TENEMOS 40 SACOS DE PAPA EN LA RAYA"` escrito en la celda de fecha. La mercancía en la frontera no está ni comprada del todo ni en almacén |

### `JOSE QUEMAO` — el transportista, plantilla distinta

```
BITACORA DE CAMIONES ENTRANTES
FECHA     CONDUCTOR  VALOR DEL  GASTOS      VALOR      SALDO A FAVOR  TOTAL DEUDA
ENTRADA              VIAJE      ADELANTOS   PENDIENTE  Y ABONOS       A JOSE
27/07     OMAR       1.470       500          970          0            970
28/07     OMAR         950       300          650          0            650
30/07     ABONOS       -          -            -         1.000           -
07/08     ABONOS     GASOY        -            -            54        (abono gasoy)
                                            TOTAL DEBES A JOSE QUEMAO:  3.300 US$
```

| ID        | Regla descubierta                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **CN-20** | El **transporte se lleva en USD** y como cuenta corriente por conductor y por viaje, no como un gasto suelto                                                 |
| **CN-21** | Existe el **adelanto al conductor** (`GASTOS ADELANTOS`), automatizado con `=IF(C10=1470,500,"")`: si el viaje vale 1.470 se adelantan 500; si vale 950, 300 |
| **CN-22** | Un abono puede hacerse **en especie**: `GASOY` (gasoil) por valor de 54                                                                                      |

---

## 6. Hoja `DEUDAS` — el tablero que mira todos los días

```
PROVEEDOR      PESOS         DÓLAR              CONVERSIÓN A DÓLAR   A PESOS
JULITO        3.080.000                DÓLAR   12.990 US$   3.138   40.762.620
SEBASTIAN    19.341.000                tasa US          3.138
HIJINIO      57.552.492                BOLIVARES 8.217.000  →9.444,8 US$ →29.637.869
JOSE QUEMAO                 3.300      tasa Bls          870
                                                TOTAL              70.400.489  ← LO QUE DEBEN
                            3.138,84 DÓLAR HOY
TOTAL        79.973.492    10.358.172
GRAN TOTAL                 90.331.664
```

| ID        | Regla descubierta                                                                                                                                                                 |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CN-23** | 🔑 **La pregunta diaria del negocio es una sola:** _"¿cuánto debo (90.331.664 COP) contra cuánto me deben (70.400.489 COP)?"_. Ese es el dashboard que necesita                   |
| **CN-24** | 🔑 **Consolida todo en COP.** Cada conversión termina en pesos: `TOTAL AL CAMBIO EN PESOS COLOMBIANO`, `GRAN TOTAL`                                                               |
| **CN-25** | La conversión de Bs a COP se hace **triangulando por USD**: `8.217.000 Bs ÷ 870 = 9.444,8 US$ × 3.138 = 29.637.869 COP`. Exactamente el método diseñado en `EXCHANGE_RATES.md §5` |

---

## 7. 🔴 Errores encontrados en el archivo (§72)

Todos verificables abriendo el archivo. No son críticas al usuario: son **el argumento de por
qué el sistema debe existir**.

### E-1 · La misma tasa vale distinto en cada hoja, el mismo día

| Tasa    | Celda                    |        Valor |
| ------- | ------------------------ | -----------: |
| USD→COP | `DEUDAS!G6`              |        3.138 |
| USD→COP | `DEUDAS!C10` "DÓLAR HOY" |     3.138,84 |
| USD→COP | `CLIENTES!P38`           | **3.175,23** |
| USD→COP | `CLIENTES!O38`           |    **3.700** |
| USD→COP | `CLIENTES!C92` (Neider)  | **3.694,22** |
| USD→Bs  | `DEUDAS!G8`              |          870 |
| USD→Bs  | `CLIENTES!P80`           |   **939,84** |

Consecuencia real: los 12.990 US$ que le deben valen **40.762.620 COP** según la hoja `DEUDAS`
y **41.246.238 COP** según la hoja `CLIENTES`. Diferencia de **483.618 COP** por elegir una
pestaña u otra. Con el bolívar, la diferencia entre 870 y 939,84 es del **8%** sobre 8,2
millones de Bs.

> En el sistema esto no puede pasar: hay **una** tasa vigente por par y por mercado, con
> fuente y hora, y toda operación guarda la que usó (`RC-03`).

### E-2 · Fórmula equivocada en la conversión de bolívares

`CLIENTES!O82 = O78/O80` → `18.157.000 / 0,06621 = 274.233.499 COP`

La cadena correcta (la que él mismo usa dos filas más abajo, en `P82`/`P84`) es dividir entre
la tasa Bs/US$ y multiplicar por la tasa US$/COP:

```
18.157.000 Bs ÷ 939,84 = 19.319,25 US$ × 3.175,23 = 61.343.049 COP
```

La celda dice **274.233.499 COP**: sobreestima **4,47 veces**. Está en la fila rotulada
"TOTAL AL CAMBIO EN PESOS COLOMBIANO", justo debajo de "LO QUE TE ADEUDAN".

### E-3 · Errores de fórmula visibles

- `CLIENTES!AH42` → `#REF!` (referencia rota por filas borradas)
- `JOSE QUEMAO!E23:G27` → `#VALUE!` (restan contra celdas con `""`)

### E-4 · Los nombres no están normalizados

`FERNADO` / `FERNANDO` / `FERNANDO FABIAN` · `JHOAN` (WILMER) / `JOHAN ` (CLIENTES) ·
`JHIM ` / `JHIM` · `LEO ` / `LEO` · `BITICO ` / `BITICO` · `CHISPAS ` / `CHISPAS` ·
`COLLA ` / `COLLA` (espacios finales incluidos).

Las hojas se enlazan **por número de fila**, no por identidad. Insertar o borrar una fila en
`CLIENTES No. 1` descuadra silenciosamente las hojas `WILMER` y `DEUDAS`.

### E-5 · Referencias latentes mal apuntadas en `WILMER`

En el bloque de deudores en dólares, la columna Bs apunta a filas vacías (`P83:P110`) y varias
se repiten (`C10` y `C11` → ambas `P88`; `C17` y `C18` → ambas `P94`). Hoy todas dan 0, así que
el error **no se nota**; el día que esas filas se llenen, los totales de cobro serán falsos.

### E-6 · El límite físico de la hoja

Solo hay 13 columnas de fecha (`B`…`N`). Cuando se acaban, hay que crear un archivo nuevo y
teclear a mano el saldo de arrastre de cada cliente. El nombre del archivo
(`CUENTAS 12 AGOSTO 2026`) lo confirma: **el sistema actual se reinicia cada período.**

---

## 8. Vocabulario del negocio → la app debe hablar así (§46 "conservar la lógica mental")

| Él dice                    | El sistema NO debe decir        | El sistema debe decir      |
| -------------------------- | ------------------------------- | -------------------------- |
| **VIAJE**                  | "Orden de compra"               | **Viaje**                  |
| **CARGUE**                 | "Costos indirectos"             | **Cargue**                 |
| **ABONO No. 3**            | "Pago parcial #3"               | **Abono N.º 3**            |
| **A DEBER**                | "Saldo de cartera"              | **A deber**                |
| **VENTA DIA**              | "Venta de contado"              | **Venta día**              |
| **CLIENTES** (en STOCK)    | "Venta a crédito"               | **Fiado / Cliente**        |
| **MERMA**                  | "Ajuste negativo por deterioro" | **Merma**                  |
| **VIENE DEL 25/07**        | "Saldo inicial del período"     | **Viene del…**             |
| **EN LA RAYA**             | "Mercancía en tránsito"         | **En la raya**             |
| **A FAVOR DE GIOVANNIS**   | "Saldo acreedor"                | **A favor**                |
| **BULTOS / CAJAS / SACOS** | "Unidades de medida"            | **Bultos / Cajas / Sacos** |
| **Ok** (junto al abono)    | "Conciliado"                    | **Ok** ✓                   |

---

## 9. Impacto sobre el diseño previo

### ✅ Confirmado por los datos

| Diseño                                                     | Evidencia en el archivo                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Saldo por cliente **y por moneda** (`Customer.balances[]`) | CN-2: mismo cliente debe en USD y en Bs por separado                                  |
| Triangulación Bs→USD→COP                                   | CN-25: es literalmente su fórmula                                                     |
| Tasa **paralela**, no oficial                              | Usa 870 y 939,84 Bs/US$ el 12/08; la oficial del BCV ronda 775. **Confirma `RC-30b`** |
| Costos adicionales sobre la compra                         | CN-15: la columna `CARGUE` ya existe                                                  |
| Unidades con decimales                                     | CN-9: 0,5 y 1,5 bultos                                                                |
| Precio distinto por cliente y por venta                    | CN-11                                                                                 |
| Auditoría con fecha, hora y confirmación                   | CN-16: ya la hace a mano                                                              |
| Rol de cobrador                                            | La hoja `WILMER` es exactamente un rol de consulta para cobro                         |

### 🔄 Cambios obligados al diseño

| #        | Qué cambia                                                                                               | Por qué                                                                                                                                |
| -------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **D-1**  | **Cuentas por pagar a proveedores pasan a CRÍTICO / MVP** (estaba como `RP-22`, "futuro")                | CN-13: son 4 de las 9 hojas. Sin esto, el sistema no reemplaza el cuaderno                                                             |
| **D-2**  | Los abonos de cliente se aplican **al saldo corriente por moneda**, no a una venta concreta              | CN-1. Internamente se reparten FIFO para trazabilidad, pero la pantalla muestra un solo saldo, como él lo piensa. **Resuelve `RP-19`** |
| **D-3**  | Nueva entidad **`Payable`** (cuenta por pagar) y **`SupplierPayment`**, espejo de `Receivable`/`Payment` | CN-13                                                                                                                                  |
| **D-4**  | `Supplier.type`: `MERCANCIA` \| `TRANSPORTE`. El transportista lleva cuenta en USD por viaje y conductor | CN-20, CN-21                                                                                                                           |
| **D-5**  | Nuevo estado de inventario: **`EN_TRANSITO` ("en la raya")** además de en almacén                        | CN-19                                                                                                                                  |
| **D-6**  | La compra se llama **Viaje** y lleva conductor, placa opcional y adelanto                                | CN-14, CN-21                                                                                                                           |
| **D-7**  | Tipo de movimiento **`MERMA`** de primera clase, con su propio reporte                                   | CN-10                                                                                                                                  |
| **D-8**  | Los abonos admiten **pago en especie** (gasoil), no solo dinero                                          | CN-22                                                                                                                                  |
| **D-9**  | El dashboard principal es **"Debo vs Me deben"**, no "ventas del día"                                    | CN-23: es la pregunta que se hace cada día                                                                                             |
| **D-10** | Moneda de venta por defecto: **USD o Bs**. COP queda como moneda de **compra y consolidación**           | §2: nunca vende en COP                                                                                                                 |
| **D-11** | Saldo **a favor** del cliente y del proveedor debe existir explícitamente                                | CN-17                                                                                                                                  |
| **D-12** | Cierre de período con **arrastre de saldos** ("Viene del…"), pero automático                             | CN-4, CN-18, E-6                                                                                                                       |

### ✅ Contradicción resuelta: la moneda funcional

Elegiste **VES** como moneda de medición interna (`RP-01`). El archivo dice otra cosa: **todas
las consolidaciones terminan en pesos colombianos** —`GRAN TOTAL` 90.331.664 COP, `TOTAL AL
CAMBIO EN PESOS COLOMBIANO`, `TOTAL` 70.400.489 COP—, y además compra en COP, que es donde
está su costo.

Medir el costo en VES cuando la mercancía se paga en COP obliga a convertir dos veces y mete
la devaluación del bolívar dentro del costo de la papa.

**Resuelto el 19/08/2026: moneda funcional = COP.** Se eligió VES primero y se corrigió el
mismo día al aparecer esta evidencia. Ver `RP-01` en `BUSINESS_RULES.md`.

---

## 10. Lo que NO se pudo determinar (§47 — no se inventa)

| Pendiente                                             | Por qué no se sabe                                                                                                      |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Costo real y utilidad**                             | Nada en el archivo conecta el precio de compra con el de venta. La hoja `STOCK` no dice a qué costo entró cada producto |
| Qué proveedor surtió cada producto vendido            | No hay enlace entre las hojas de proveedor y `STOCK`                                                                    |
| Qué compró cada cliente                               | CN-6                                                                                                                    |
| Gastos operativos (arriendo, nómina, servicios)       | **No existen en el archivo.** El §17 los pide, pero hoy no se registran                                                 |
| Cambio de moneda como operación (§16)                 | No hay hoja de compraventa de divisas; solo conversiones de cálculo                                                     |
| Quién es `Neider` (`CLIENTES!B89`, 7.150.000 COP)     | Aparece suelto, sin contexto: ¿cliente, proveedor, préstamo?                                                            |
| Qué significan `PROV-SEBASTIAN` sin producto rotulado | La celda `B1` de esa hoja quedó sin nombre de producto                                                                  |
| El `4534` inicial de José Quemao                      | Rotulado `Con (4534)` — parece deuda de arrastre en USD, sin detalle                                                    |
| Si `PAPA` y `PAPA GRUESA` son el mismo producto       | `STOCK` dice "PAPA"; `PROV-HIJINIO` dice "PAPA GRUESA"                                                                  |

---

## 11. Cómo se digitaliza sin romper su forma de trabajar

El cambio de fondo: **hoy registra el mismo hecho en dos lugares distintos y desconectados**
—el monto en `CLIENTES No. 1` y los bultos en `STOCK`—. La app une los dos en **un solo gesto**:

```
        HOY (dos anotaciones, sin relación)          CON LA APP (una sola)
   ┌──────────────────────┐  ┌──────────────┐      ┌─────────────────────────┐
   │ STOCK                │  │ CLIENTES     │      │ NUEVA VENTA             │
   │ 20 bultos papa       │  │ MEMIN        │      │ MEMIN                   │
   │ × 35.000 Bs          │  │ 04/08        │  ──▶ │ Papa 20 × 35.000 Bs     │
   │ = 700.000            │  │ 700.000      │      │ [ FIADO ]               │
   │ etiqueta: CLIENTES   │  │              │      │ Guardar                 │
   └──────────────────────┘  └──────────────┘      └─────────────────────────┘
     ↓ resta stock a mano      ↓ suma a mano         ↓ automático y a la vez:
                                                     stock −20 · saldo MEMIN +700.000
                                                     costo, utilidad y tasa congelados
```

Y la vista que él ya conoce —la matriz cliente × fecha— **se conserva** como pantalla de
consulta ("Cuenta corriente"), porque es como piensa. La diferencia es que ahora cada celda de
esa matriz se puede abrir y ver qué productos había detrás.
