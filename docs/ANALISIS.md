# Fase 0 — Análisis (§49, §70, §76)

> **Cómo leer este documento (nota del 20/08/2026):** es el análisis que se hizo
> *antes* de construir, y se conserva como registro de por qué se decidió cada
> cosa. Varias entidades que aquí se proponen —cuentas por cobrar y por pagar
> separadas, clientes y proveedores separados— se unificaron al implementarlas.
> Para saber **qué existe hoy**, mira `DATABASE.md` y `API.md`.

Documento previo a cualquier línea de código. Contiene: lectura del negocio, entidades,
riesgos, contradicciones detectadas en los requisitos y lo que falta para poder implementar.

---

## 1. Qué es realmente este negocio

No es un retail. Es un **intermediario mayorista transfronterizo COP/VES** con tres motores
de resultado que deben medirse por separado:

| Motor          | De dónde sale la plata                                  | Riesgo principal                                  |
| -------------- | ------------------------------------------------------- | ------------------------------------------------- |
| **Comercial**  | Comprar bultos barato y venderlos más caro              | Merma, precio, cartera incobrable                 |
| **Cambiario**  | Diferencia entre tasa de compra y venta de divisa (§16) | Devaluación del VES                               |
| **Financiero** | Fiar y cobrar después                                   | Que el VES se devalúe mientras el cliente no paga |

Esto no es un detalle contable: **si los tres se suman en un solo número de "utilidad", el
comerciante nunca sabrá si ganó vendiendo papa o si simplemente se movió el dólar.**
Por eso el estado de resultados (§56, §57) separa resultado operativo de resultado cambiario.

### El problema estructural del negocio

Una venta fiada en VES a 30 días, con el VES devaluándose, **pierde valor sola**. Ejemplo con
las tasas reales verificadas hoy (2026-08-19):

- Vende 100 USD de papa, cobrando en VES al paralelo: 90.681 VES.
- El cliente paga 30 días después. Si el VES se devaluó 8%, esos 90.681 VES ya son ~84 USD.
- **Perdió 16 USD sin haber hecho nada mal comercialmente.**

El sistema debe hacer visible esa pérdida (`diferencia cambiaria en cartera`), porque hoy en
el cuaderno es invisible. Es probablemente el mayor valor que aporta la digitalización.

---

## 2. Entidades y relaciones

```
                                    ┌──────────────┐
                    ┌──────────────▶│   Product    │◀────────────┐
                    │               └──────┬───────┘             │
                    │                      │ 1:N                 │
             ┌──────┴───────┐       ┌──────▼──────────────┐  ┌───┴──────────┐
             │ PurchaseItem │       │ InventoryMovement   │  │  SaleItem    │
             │  (embebido)  │       │ (libro mayor stock) │  │  (embebido)  │
             └──────┬───────┘       └──────▲──────────────┘  └───┬──────────┘
                    │ N:1                  │ genera              │ N:1
             ┌──────▼───────┐              │              ┌──────▼───────┐
             │   Purchase   │──────────────┴──────────────│     Sale     │
             └──────┬───────┘                             └──────┬───────┘
                    │ N:1                                        │ N:1
             ┌──────▼───────┐                             ┌──────▼───────┐
             │   Supplier   │                             │   Customer   │
             └──────────────┘                             └──────┬───────┘
                                                                 │ 1:N
                                    ┌────────────────────────────▼─────┐
                                    │           Receivable             │
                                    │    (1:1 con Sale a crédito)      │
                                    └────────────────▲─────────────────┘
                                                     │ N:M vía allocations
                                             ┌───────┴────────┐
                                             │    Payment     │
                                             └────────────────┘

   Transversales:  ExchangeRate ──(snapshot embebido)──▶ Sale, Purchase, Payment,
                                                         Expense, CurrencyExchange
                   AuditLog ──▶ cualquier documento
                   BusinessSettings (singleton)
```

### Decisiones de modelado y por qué

| Decisión                                                                                         | Razón                                                                                                                                           |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `SaleItem` / `PurchaseItem` **embebidos**, no colección                                          | Siempre se leen con su padre, son pocos (< 50) y así la venta se guarda de forma atómica sin transacción                                        |
| `Receivable` **sí** es colección propia                                                          | Permite indexar saldo/vencimiento y consultar cartera sin escanear todas las ventas. Deja la puerta abierta a deudas que no vengan de una venta |
| `InventoryMovement` es la **única** fuente de verdad del stock                                   | `Product.stock` es una proyección cacheada, recalculable desde cero (§10)                                                                       |
| `Currency` es colección, no enum                                                                 | §68: prohibido hardcodear monedas                                                                                                               |
| `ExpenseCategory`, `ProductCategory`, unidades y métodos de pago → colección `Catalog` unificada | Son cuatro entidades con forma idéntica (`type, name, active, order`). Cuatro colecciones iguales sería sobreingeniería (§69)                   |
| `Money` no es un número, es `{ amount: Decimal128, currency }`                                   | §32                                                                                                                                             |

**Entidad que el brief no pidió pero es necesaria: `CashAccount` (caja / cuenta).**
Sin ella no se puede responder _"¿cuánto dinero tengo?"_ (§75), porque el efectivo está
repartido entre pesos, bolívares, dólares, banco y pago móvil. Se marca como
`IMPORTANTE`, no MVP. Ver `RP-13` en `BUSINESS_RULES.md`.

---

## 3. Contradicciones y ambigüedades detectadas en los requisitos

| #       | Dónde      | Problema                                                                                                                                                         | Propuesta                                                                                                                                                                       |
| ------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C-1** | §21        | Usa `1 USD = 0.89 VES`. Está invertido: hoy 1 USD ≈ 777–907 VES. Implementado literal, todos los cálculos en VES quedan al revés                                 | Convención única `rate = cuántos QUOTE por 1 BASE`, y la UI siempre imprime la frase completa `1 USD = 906,8148 VES`. Ver `EXCHANGE_RATES.md §6`                                |
| **C-2** | §3 vs §33  | Se pide obtener tasas automáticamente de fuentes confiables, pero para VES la fuente automática confiable devuelve la tasa **oficial**, que no es la del negocio | ✅ **RESUELTA (19/08/2026)**: toda tasa lleva `market`, y el mercado por defecto para VES es **PARALELO** (`RC-30b`). La oficial BCV se guarda solo como referencia comparativa |
| **C-3** | §12 vs §56 | El costo real unitario cambia con cada compra, pero la utilidad de una venta pasada debe ser estable                                                             | Costo promedio ponderado congelado en `SaleItem.unitCostSnapshot` al vender. La utilidad histórica no se recalcula                                                              |
| **C-4** | §22 vs §47 | "No permitir que una operación desaparezca" + "¿se permite cambiar precio después de vender?"                                                                    | Ninguna operación financiera se edita ni se borra: se **anula** y se crea una nueva. La anulación revierte inventario y cartera con movimientos compensatorios                  |
| ~~**C-5**~~ | §28 vs §32 | Offline e integridad financiera estaban en tensión | **Ya no aplica (20/08/2026):** el funcionamiento sin señal se descartó, así que la tensión desaparece |
| **C-6** | §61 vs §33 | El MVP pide tasas manuales pero también COP/USD/VES funcionando                                                                                                  | MVP: tasa manual obligatoria + auto-fetch como conveniencia. La app nunca depende de la API                                                                                     |

---

## 4. Riesgos

| Riesgo                                         | Impacto                      | Mitigación                                                                                                                                                                |
| ---------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stock negativo por ventas concurrentes         | Alto                         | Update condicional atómico `$inc` con filtro `stock >= qty`; política configurable de permitir/bloquear negativos                                                         |
| Doble registro de un pago (doble tap en móvil) | Alto                         | `Idempotency-Key` obligatorio en POST de venta/pago + índice único                                                                                                        |
| Saldo de cartera desincronizado                | Alto                         | Pago y actualización de saldo en una transacción MongoDB (**exige replica set**, ver `DEPLOYMENT.md`), job nocturno de reconciliación y endpoint `/receivables/reconcile` |
| Float en dinero                                | Crítico                      | Prohibido `number` para dinero. Regla de lint + tests de precisión                                                                                                        |
| Redondeo asimétrico en conversión              | Medio                        | Redondeo solo en los bordes (persistir / mostrar), nunca en cálculos intermedios                                                                                          |
| API de tasas caída                             | Medio                        | Cascada de fallback + tasa manual + alerta (§41)                                                                                                                          |
| El comerciante abandona la app por lenta       | **Crítico para el proyecto** | Presupuesto de rendimiento: venta guardada en < 400 ms, primera pantalla < 1,5 s en 3G. Es requisito, no aspiración                                                       |

---

## 5. El cuaderno (§46, §76) — ✅ documento recibido, 📷 fotos pendientes

> **Actualización 19/08/2026:** se recibió y analizó `CUENTAS 12 AGOSTO 2026.xlsx`, el archivo
> real del negocio. El análisis completo está en **[ANALISIS_CUADERNO.md](ANALISIS_CUADERNO.md)**
> y ya se aplicaron 12 cambios al diseño (`D-1` … `D-12`).
>
> Siguen pendientes **las fotografías del cuaderno físico**, por si registra a mano cosas que
> no llegan al Excel: gastos operativos, ventas del día en detalle y cambios de divisa —tres
> áreas que el §17 y el §16 piden y que **no aparecen en ningún lado del archivo**.

Lo que sigue se escribió antes de recibir el archivo y se conserva como registro:

Conforme a §47 y §73 **no se inventa** la estructura del cuaderno. Lo que esto afecta:

| Sí se puede avanzar sin las fotos         | Requiere las fotos                                         |
| ----------------------------------------- | ---------------------------------------------------------- |
| Arquitectura, stack, modelo de datos base | Nombres y abreviaturas reales de las columnas              |
| Motor multimoneda y tasas históricas      | Orden exacto de captura en el formulario rápido            |
| Inventario, cartera, pagos, gastos        | Si agrupa por día, por cliente o por camionada             |
| API, autenticación, despliegue            | Si maneja conceptos propios (p. ej. "fiado por camionada") |
| Dashboard y reportes                      | Presentaciones y unidades reales por producto              |

El diseño ya contempla esta incertidumbre: los catálogos (unidades, categorías, métodos de
pago) son datos, no código, así que adaptar el sistema al vocabulario real del cuaderno será
configuración, no reescritura.

**Sube las fotos y el documento a este directorio y los analizo antes de cerrar la Fase 1.**

---

## 6. Salidas de esta fase

| Entregable pedido (§76)   | Documento           |
| ------------------------- | ------------------- |
| A. Arquitectura           | `ARCHITECTURE.md`   |
| B. Modelo de datos        | `DATABASE.md`       |
| C. Reglas de negocio      | `BUSINESS_RULES.md` |
| D. Flujo UX               | `UX_FLOW.md`        |
| E. Diseño de pantallas    | `UX_FLOW.md` §4     |
| F. API                    | `API.md`            |
| G. Roadmap                | `ROADMAP.md`        |
| H. MVP                    | `ROADMAP.md` §3     |
| I. Plan de implementación | `ROADMAP.md` §4     |
| Investigación de tasas    | `EXCHANGE_RATES.md` |
