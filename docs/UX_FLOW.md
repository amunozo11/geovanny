# UX_FLOW.md — Navegación, flujos y wireframes (§26, §27, §36, §55, §59, §66, §67)

---

## 1. La prueba que debe pasar el diseño

> El cliente está parado al frente y dice: _"20 bultos de papa y 5 de cebolla, fiado."_
> El comerciante debe terminar el registro **antes de que el cliente termine de guardar la plata**.
> Objetivo: **menos de 15 segundos, sin cambiar de pantalla.**

Cualquier decisión de diseño que no sobreviva esa prueba se descarta.

---

## 2. Navegación

### Móvil (base del diseño — §27)

Barra inferior con 4 destinos + **FAB central de Nueva Venta**:

```
┌───────────────────────────────────────────┐
│                                           │
│              contenido                    │
│                                           │
├───────────────────────────────────────────┤
│  🏠      📦        ➕       👥      ☰     │
│ Inicio  Invent.  VENDER  Clientes  Más    │
└───────────────────────────────────────────┘
```

`Más` abre una hoja con: Compras, Cuentas por cobrar, Gastos, Tasas, Cambio de moneda,
Proveedores, Reportes, Configuración.

Razón: los cuatro accesos permanentes son las cuatro preguntas diarias del §75
(¿cuánto vendí?, ¿qué tengo?, ¿quién me debe?) y la acción dominante (vender).

### Escritorio

Barra lateral fija, 240 px, colapsable a iconos:
Dashboard · Ventas · Compras · Inventario · Clientes · Proveedores · Cuentas por cobrar ·
Gastos · Monedas · Reportes · Configuración.

Arriba: buscador global (§25), selector de moneda de visualización (§19), campana de alertas,
usuario.

### Atajos de teclado (escritorio)

| Tecla                    | Acción                                  |
| ------------------------ | --------------------------------------- |
| `N`                      | Nueva venta                             |
| `C`                      | Nueva compra                            |
| `P`                      | Registrar pago                          |
| `G`                      | Registrar gasto                         |
| `/` o `Ctrl+K`           | Búsqueda global                         |
| `Enter` (en Nueva Venta) | Agregar ítem y volver al campo producto |
| `Ctrl+Enter`             | Guardar venta                           |
| `Esc`                    | Cerrar hoja/modal                       |

---

## 3. Regla de accesos (§67)

| Acción                        | Clics desde el dashboard             |
| ----------------------------- | ------------------------------------ |
| Nueva venta                   | **1** (FAB)                          |
| Registrar pago                | **2** (cliente en "Deben" → Abonar)  |
| Consultar deuda de un cliente | **1** (tocar el cliente en la lista) |
| Consultar inventario          | **1** (pestaña)                      |
| Nueva compra                  | 2                                    |
| Registrar gasto               | 2                                    |

---

## 4. Wireframes conceptuales

### 4.1 Dashboard móvil (390×844) — §38

```
┌─────────────────────────────────┐
│ Geovanny            [COP ▼] 🔔  │  ← selector de moneda de visualización
├─────────────────────────────────┤
│ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓ │  ← CN-23: la pregunta diaria,
│ ┃ DEBO          $90.331.664   ┃ │     arriba de todo
│ ┃ ME DEBEN      $70.400.489   ┃ │
│ ┃ ─────────────────────────── ┃ │
│ ┃ DIFERENCIA   −$19.931.175   ┃ │
│ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ │
│ ┌─────────────┐ ┌─────────────┐ │
│ │ VENTAS HOY  │ │ RECIBIDO HOY│ │
│ │ $1.240.000  │ │  $840.000   │ │
│ │ 7 ventas    │ │             │ │
│ └─────────────┘ └─────────────┘ │
│ ┌─────────────┐ ┌─────────────┐ │
│ │ INVENTARIO  │ │ EN LA RAYA  │ │
│ │ 385 bultos  │ │ 40 sacos    │ │
│ │ ⚠ 2 bajos   │ │ papa        │ │
│ └─────────────┘ └─────────────┘ │
├─────────────────────────────────┤
│ ACCIONES RÁPIDAS                │
│ [+ Venta]  [$ Cobrar]           │
│ [− Gasto]  [⇄ Cambio]           │
├─────────────────────────────────┤
│ ÚLTIMAS VENTAS                  │
│ ● Juan P.   10 papa    $450.000 │
│   hace 12 min          FIADO 🟡 │
│ ● Carlos M. 5 cebolla  $180.000 │
│   hace 40 min        CONTADO 🟢 │
├─────────────────────────────────┤
│ ME DEBEN                        │
│ 🔴 Pedro R.  $3.200.000  45 d   │
│    [Ver] [Abonar]               │
│ 🟡 Juan P.     $450.000   2 d   │
│    [Ver] [Abonar]               │
└─────────────────────────────────┘
       🏠  📦  ➕  👥  ☰
```

Nada más. No se satura (§38). Todo lo demás está a un toque.

### 4.2 Nueva venta (la pantalla más importante del sistema)

**Una sola pantalla. Sin pasos. Sin modales anidados.**

```
┌─────────────────────────────────┐
│ ✕   NUEVA VENTA          [USD ▼]│
├─────────────────────────────────┤
│ CLIENTE                         │
│ ┌─────────────────────────────┐ │
│ │ 🔍 Juan Pé...               │ │  ← autocompletar; crear al vuelo con "+ Juan Pérez"
│ └─────────────────────────────┘ │
│ Juan Pérez · debe $450.000 🟡   │  ← contexto inmediato, sin salir
├─────────────────────────────────┤
│ PRODUCTOS                       │
│ ┌─────────────────────────────┐ │
│ │ 🔍 papa                     │ │
│ └─────────────────────────────┘ │
│   Papa        290 bultos        │  ← resultados con stock a la vista
│   Cebolla roja 85 bultos        │
│                                 │
│ ┌── al elegir Papa ───────────┐ │
│ │ Papa                        │ │
│ │ Cant. [  20 ] bultos        │ │
│ │ Precio [ 45.000 ]           │ │
│ │ último a Juan: 45.000  ↩    │ │  ← RP-08: la memoria del comerciante, automatizada
│ │ Subtotal      900.000       │ │
│ │        [ AGREGAR ]          │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ 🥔 Papa 20 × 45.000   900.000 ✕ │
│ 🧅 Cebolla 5 × 36.000 180.000 ✕ │
├─────────────────────────────────┤
│ TOTAL          $1.080.000 COP   │  ← sticky, siempre visible
│ ≈ 348,50 USD · 1 USD = 3.099 COP│  ← conversión en vivo si hay 2ª moneda
├─────────────────────────────────┤
│ ┌──────────┬──────────┬───────┐ │
│ │ CONTADO  │  FIADO   │PARCIAL│ │  ← 3 botones grandes, no un select
│ └──────────┴──────────┴───────┘ │
│ (si PARCIAL) Abona [ 400.000 ]  │
│              Saldo   680.000    │
├─────────────────────────────────┤
│ [      GUARDAR VENTA      ]     │  ← botón 56 px de alto
└─────────────────────────────────┘
```

Detalles que hacen la diferencia:

- El teclado numérico se abre solo en cantidad y precio (`inputMode="decimal"`).
- Tras "Agregar", el foco vuelve al buscador de producto: se puede encadenar sin tocar nada más.
- El total se recalcula en cada tecla, sin latencia de red.
- Guardar es **optimista**: la UI confirma de inmediato y sincroniza detrás; si falla, avisa y
  ofrece reintentar sin perder los datos.
- La moneda arranca en la del cliente o la principal del negocio; cambiarla no borra los ítems.

### 4.3 Estado de cuenta del cliente (§6)

```
┌─────────────────────────────────┐
│ ← Juan Pérez              ⋮     │
│ 📞 300 123 4567                 │
├─────────────────────────────────┤
│ DEUDA TOTAL        $1.350.000   │
│ PAGADO               $200.000   │
│ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓ │
│ ┃ SALDO PENDIENTE $1.150.000  ┃ │
│ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ │
│ [    REGISTRAR ABONO    ]       │
├─────────────────────────────────┤
│ 18/08 · Venta #001              │
│ 10 papa              $450.000   │
│ Abonado $0 · Saldo $450.000  🟡 │
├─────────────────────────────────┤
│ 19/08 · Venta #002              │
│ 3 cebolla            $400.000   │
│ Abonado $200.000·Saldo $200.000 │
├─────────────────────────────────┤
│ 20/08 · Venta #003              │
│ 20 papa + 3 cebolla  $500.000   │
│ Abonado $0 · Saldo $500.000  🟡 │
├─────────────────────────────────┤
└─────────────────────────────────┘
```

En escritorio es la tabla del §6 con las mismas columnas. Mismo componente `DataList`,
distinta presentación (§27).

### 4.4 Registrar abono con moneda distinta (§8 + §21) — pantalla crítica

```
┌─────────────────────────────────┐
│ ✕   REGISTRAR ABONO             │
├─────────────────────────────────┤
│ Juan Pérez                      │
│ Deuda: Venta #001               │
│ ┌─────────────────────────────┐ │
│ │ Valor original    100,00 USD│ │
│ │ Tasa original  1 USD=890 VES│ │
│ │ Equivalía         89.000 VES│ │
│ │ ─────────────────────────── │ │
│ │ Tasa actual    1 USD=906 VES│ │
│ │ Hoy equivale      90.681 VES│ │
│ │ Diferencia        +1.681 VES│ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ PAGA EN:  [ VES ▼ ]             │
│ ¿CON QUÉ TASA COBRAS?  (elige)  │
│ ○ Original   1 USD = 890        │
│ ○ Actual     1 USD = 906,81     │
│ ○ Acordada   [__________]       │
│ ↳ ninguna preseleccionada:      │
│   RC-29 exige decisión expresa  │
├─────────────────────────────────┤
│ Monto recibido [ 90.681 ] VES   │
│ Aplica a la deuda   100,00 USD  │
│ Saldo restante        0,00 USD  │
│ Dif. cambiaria       +1,85 USD  │  ← visible, no escondida
├─────────────────────────────────┤
│ Método [ Pago móvil ▼ ]         │
│ Nota   [________________]       │
│ [      REGISTRAR ABONO      ]   │
└─────────────────────────────────┘
```

Esta pantalla es la traducción literal del §21: muestra las tres tasas, obliga a elegir una y
**deja evidencia de cuál se usó** (`Payment.rateMode`).

### 4.5 Vista "Cuenta corriente" — la matriz que él ya conoce (CN-1, CN-5)

En escritorio se conserva **su misma matriz cliente × fecha**, porque es como piensa. La
diferencia: cada celda es ahora un enlace al detalle de productos que hoy no existe.

```
CUENTAS POR COBRAR — DÓLARES                        [ US$ ▼ ]  [ Bs ]

CLIENTE      Viene   28/07  30/07  01/08  04/08  07/08   TOTAL   ABONOS  A DEBER
             25/07
ALEX PULGA     111       ·      ·      ·      ·      ·     111       40       71
BRANYER      1.350   1.200      ·      ·  3.200      ·   5.750    1.500    4.250
COLLA        2.620       ·  1.990    200    400    200   5.410    4.610      800
                             ▲ clic → "30/07: 5 bultos papa × 398 · fiado"
                                                        ─────────────────────────
                                                TOTAL  21.249    8.259   12.990
```

En móvil la misma información se presenta como lista de clientes con su saldo, y el detalle
por fecha se abre al tocar. Las dos monedas son **pestañas separadas**, nunca sumadas (CN-2).

### 4.6 Tabla → cards (§27)

Una sola definición de columnas alimenta ambas presentaciones:

```tsx
<DataList
  items={sales}
  columns={[
    { key: 'customer', label: 'Cliente', primary: true },
    { key: 'number', label: 'Venta' },
    { key: 'total', label: 'Total', money: true },
    { key: 'paid', label: 'Pagado', money: true },
    { key: 'balance', label: 'Saldo', money: true, emphasis: true },
  ]}
  actions={[{ label: 'Ver' }, { label: 'Abonar' }]}
/>
```

- `≥ md`: tabla con encabezado fijo.
- `< md`: card con `primary` como título, el resto como pares etiqueta/valor y las acciones
  como botones de 44 px.

Nunca hay scroll horizontal en móvil (§27).

---

## 5. Selector de moneda de visualización (§19, §20)

Vive en el encabezado y afecta **solo la presentación**. Cuando está activo, cada cifra
convertida muestra su origen al tocarla:

```
$1.080.000 COP
└─ tocar ─▶  Original: 348,50 USD
             Tasa usada: 1 USD = 3.099,31 COP (paralelo, 19/08 08:00)
             Fuente: API · dolarapi
```

Los totales del dashboard se presentan **siempre discriminados y luego consolidados** (§20):

```
VENTAS DEL MES
  COP   $12.400.000
  USD    $  1.250,00
  VES    Bs. 890.400
  ─────────────────────
  Total equivalente en COP:  $17.930.000
  (a tasas de hoy · ver detalle)
```

---

## 5b. Vocabulario obligatorio de la interfaz (CN-*)

La app usa **sus palabras**, no las del software de gestión. Ver tabla completa en
`ANALISIS_CUADERNO.md §8`:

**Viaje** (no "orden de compra") · **Cargue** (no "costos indirectos") · **Abono N.º 3** ·
**A deber** (no "saldo de cartera") · **Venta día** (contado) · **Fiado** ·
**Merma** · **En la raya** (en tránsito) · **A favor** · **Bultos / Cajas / Sacos** ·
**Viene del…** (saldo de arrastre) · **Ok** ✓ (abono confirmado).

---

## 6. Sistema visual (§53)

| Elemento     | Definición                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| Tipografía   | Inter variable; números tabulares (`font-variant-numeric: tabular-nums`) para que las columnas de dinero alineen |
| Color base   | Neutros fríos (slate). Fondo claro por defecto, modo oscuro incluido                                             |
| Acento       | Un solo color de marca para acciones primarias                                                                   |
| Semáforo     | 🟢 `emerald` sin deuda · 🟡 `amber` deuda parcial · 🔴 `rose` deuda alta                                       |
| Dinero       | Positivo neutro; saldos pendientes en ámbar; pérdidas en rose. Nunca color como único indicador (accesibilidad)  |
| Radio        | 12 px cards, 10 px inputs                                                                                        |
| Sombras      | Una sola elevación sutil. Sin gradientes decorativos                                                             |
| Animación    | Solo transiciones de 150 ms en estados. Sin animaciones de entrada                                               |
| Toque mínimo | 44×44 px                                                                                                         |
| Contraste    | AA mínimo en todo texto                                                                                          |

---

## 7. Breakpoints probados (§54)

| Dispositivo     | Ancho     | Comportamiento                                                       |
| --------------- | --------- | -------------------------------------------------------------------- |
| iPhone 12/13/14 | 390×844   | Base del diseño. Nav inferior + FAB. Cards                           |
| Android típico  | 360×800   | Idéntico; se verifica que el total sticky no tape el botón           |
| Tablet          | 768×1024  | 2 columnas; nav inferior se convierte en lateral colapsada           |
| Laptop          | 1366×768  | Sidebar + contenido; tablas densas                                   |
| Desktop         | 1920×1080 | Ancho máximo 1440 px centrado; se evita la línea de texto larguísima |

Extras móviles: `env(safe-area-inset-bottom)` para el notch, `100dvh` en vez de `100vh`,
y prevención del zoom de iOS con `font-size: 16px` en inputs.

---

## 8. Búsqueda global (§25)

`Ctrl+K` / lupa. Una sola caja, resultados agrupados:

```
"juan"
  CLIENTES     Juan Pérez · debe $1.150.000
  VENTAS       V-2026-00001 · Juan Pérez · $450.000
  PAGOS        P-2026-00318 · Juan Pérez · $200.000

"papa"
  PRODUCTOS    Papa · 290 bultos · costo $38.000
  VENTAS       12 ventas este mes · 340 bultos
  COMPRAS      C-2026-00042 · 300 bultos
```

Implementación: índices `text` de Mongo + `$unionWith`, con debounce de 200 ms y límite de 5
por grupo.

---

## 9. Estados vacíos, carga y error

- **Vacío**: nunca una tabla en blanco. _"Aún no has registrado ventas. [Registrar la primera]"_.
- **Carga**: skeletons con la forma del contenido, no spinners.
- **Error**: mensaje en español + acción de reintento. Jamás un código técnico crudo.
- **Sin conexión**: banda superior _"Sin conexión — las ventas se guardarán y se enviarán solas"_.
- **Tasa vieja**: banda ámbar _"Tasa de hace 6 h. [Actualizar]"_ (§41).
