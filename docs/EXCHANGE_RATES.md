# Tasas de cambio — Investigación de fuentes (§33, §34)

> Verificación realizada el **2026-08-19**. Todos los valores de esta página fueron obtenidos
> consultando los endpoints reales, no de memoria. Si un endpoint no pudo verificarse, se marca
> como `NO VERIFICADO` en lugar de asumirlo.

---

## 1. Hallazgo crítico: VES tiene DOS mercados y las APIs genéricas solo ven uno

Consulta real del 2026-08-19:

| Fuente                         | Endpoint                                      |  USD → VES | Qué es realmente   |
| ------------------------------ | --------------------------------------------- | ---------: | ------------------ |
| ExchangeRate-API (open access) | `https://open.er-api.com/v6/latest/USD`       | `777.4161` | ≈ tasa oficial BCV |
| DolarAPI Venezuela — oficial   | `https://ve.dolarapi.com/v1/dolares/oficial`  | `775.3356` | BCV oficial        |
| DolarAPI Venezuela — paralelo  | `https://ve.dolarapi.com/v1/dolares/paralelo` | `906.8148` | Mercado paralelo   |

**Brecha oficial vs paralelo: ~17%.**

Consecuencia de negocio: si el sistema valora las operaciones en VES con la tasa de una API
genérica de divisas, entrega la tasa **oficial**, y en un negocio que compra/vende de verdad
en la frontera eso significa un error sistemático del ~17% en:

- el valor de las cuentas por cobrar en VES,
- la utilidad calculada,
- el inventario valorizado,
- el dashboard convertido a VES.

**Por eso la arquitectura NO trata la tasa como un número, sino como una tripleta:**

```
(par, MERCADO, fuente)   →   USD/VES @ PARALELO desde DolarAPI
```

El campo `market` es obligatorio. Nunca existe "la tasa del bolívar" a secas en este sistema.

---

## 2. COP: caso simple

El peso colombiano es de mercado libre, no tiene brecha oficial/paralelo relevante.
Cualquier API seria sirve.

- Verificado 2026-08-19: `open.er-api.com/v6/latest/USD` → `COP: 3099.309008`.
- Actualización: diaria (campo `time_last_update_utc`).
- Sin API key, sin registro. Requiere atribución en la UI.
- Límite: tolera ~1 request/hora por IP sin bloqueo; devuelve HTTP 429 y libera a los 20 min.
  Nuestro job consulta 1 vez por hora → holgado.

`REGLA PENDIENTE`: si el negocio compra/vende dólares en efectivo en la frontera (casas de
cambio de Cúcuta/Maicao), la tasa COP/USD relevante **no es la del mercado internacional**
sino la que le dan en la calle. Ver `BUSINESS_RULES.md` → `RP-11`.

---

## 3. Fuentes evaluadas

| Fuente                                        |    Cubre VES paralelo    | API key | Costo              | Límite                       | Veredicto                                                                                                                                                 |
| --------------------------------------------- | :----------------------: | :-----: | ------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DolarAPI VE** (`ve.dolarapi.com`)           |  ✅ oficial + paralelo   |   No    | Gratis             | No publicado (uso razonable) | **Primaria para VES**                                                                                                                                     |
| **ExchangeRate-API open** (`open.er-api.com`) |     ❌ solo oficial      |   No    | Gratis             | ~1/h por IP                  | **Primaria para COP y cruces mayores**                                                                                                                    |
| Cotizave (`cotizave.com/api-bcv`)             | ✅ BCV + paralelo + USDT |   Sí    | Free 1.500 req/mes | 1.500/mes                    | **Secundaria VES** (requiere alta)                                                                                                                        |
| ExchangeRate.host                             |            ❌            |   Sí    | Freemium           | 100k+/mes en pago            | Descartada (ya no es free sin key; no aporta VES)                                                                                                         |
| BCV (`bcv.org.ve`)                            |     ❌ solo oficial      |   No    | Gratis             | —                            | Solo scraping HTML, frágil. No usar como primaria                                                                                                         |
| pydolarVE                                     |            ?             |   No    | Gratis             | ?                            | `NO VERIFICADO` — los endpoints que probé (`/api/v1/dollar`, `/api/v2/tipo-cambio`) devolvieron **404**. No se implementa hasta confirmar la ruta vigente |

> No se implementa ninguna integración contra una fuente que no haya respondido correctamente
> en la verificación. `pydolarVE` queda documentada como candidata, no como dependencia.

---

## 4. Estrategia de obtención (con degradación, nunca dependencia total)

```
                 ┌─────────────────────────────────────────┐
   cron 1h  ───▶ │ RateFetcher                             │
                 │  provider: dolarapi  → USD/VES OFICIAL  │
                 │  provider: dolarapi  → USD/VES PARALELO │
                 │  provider: erapi     → USD/COP          │
                 └──────────────┬──────────────────────────┘
                                │ falla / timeout 5s / respuesta inválida
                                ▼
                 ┌─────────────────────────────────────────┐
                 │ Fallback 1: proveedor secundario        │
                 │ Fallback 2: última tasa vigente en BD   │
                 │             (marcada como STALE)        │
                 │ Fallback 3: tasa MANUAL del usuario     │
                 └──────────────┬──────────────────────────┘
                                ▼
                    Alerta en campana + banner ámbar
                    "Tasa desactualizada (hace 3 h). Actualizar manualmente."
```

**La app SIEMPRE es usable sin internet para tasas**: si no hay ninguna tasa fresca, el
formulario de venta exige confirmar o teclear la tasa, y la guarda con `source: MANUAL`.
Nunca se bloquea una venta por una API caída.

---

## 5. Cruce COP ↔ VES: triangulación por USD

No existe fuente confiable directa COP/VES. Se calcula:

```
VES por 1 COP  =  (VES por 1 USD) / (COP por 1 USD)
```

- Se calcula con `decimal.js`, precisión 20, **nunca** con `number`.
- La tasa derivada se persiste en el snapshot con `derived: true` y con los dos IDs de tasa
  origen, para poder auditar de dónde salió.
- El usuario puede **sobrescribir** la tasa COP/VES manualmente (caso frontera, donde la
  cruzada real difiere de la triangulada).

---

## 6. Dirección de la tasa: convención única e inviolable

`ExchangeRate.rate` significa siempre: **cuántas unidades de `quote` equivale 1 unidad de `base`.**

```
{ base: "USD", quote: "VES", rate: "906.8148" }   →  1 USD = 906.8148 VES
```

Reglas:

1. Nunca se guarda la tasa inversa. Invertir y volver a invertir introduce error de redondeo.
2. Pares canónicos: `USD/COP`, `USD/VES`, `USD/…`. USD es siempre base.
   El par `COP/VES` se deriva (§5).
3. La UI **siempre** muestra la dirección escrita: `1 USD = 906,8148 VES`, jamás `Tasa: 906,81`.

> ⚠️ Contradicción detectada en los requisitos: el §21 del brief usa el ejemplo
> `1 USD = 0.89 VES`, que está invertido respecto a la realidad (1 USD ≈ 777–907 VES).
> Esto es exactamente el error que la convención anterior previene. Ver `ANALISIS.md` → C-1.

---

## 7. Precisión

| Dato               | Almacenamiento            | Precisión                                             |
| ------------------ | ------------------------- | ----------------------------------------------------- |
| Tasa               | `Decimal128` (string)     | hasta 12 decimales                                    |
| Monto              | `Decimal128` (string)     | escala por moneda: USD 2, VES 2, COP 0 (configurable) |
| Cálculo intermedio | `decimal.js`              | 20 dígitos significativos, sin redondeo intermedio    |
| Redondeo           | solo al persistir/mostrar | `ROUND_HALF_UP`                                       |

---

## 8. Campos obligatorios de toda tasa (§34)

```ts
{
  base: "USD", quote: "VES",
  rate: Decimal128,
  market: "OFICIAL" | "PARALELO" | "ACORDADA",
  source: "API" | "MANUAL" | "ADMINISTRATIVA",
  provider: "dolarapi" | "erapi" | "cotizave" | null,   // null si MANUAL
  fetchedAt:    Date,   // cuándo se consultó
  effectiveAt:  Date,   // desde cuándo rige
  effectiveTo:  Date | null,
  derived: boolean,
  derivedFrom: [ObjectId, ObjectId] | null,
  createdBy: ObjectId | null,
  note: string | null
}
```

---

## Atribución requerida

ExchangeRate-API (endpoint abierto) exige atribución visible. Se incluirá en
`Configuración → Tasas de cambio`: "Tasas COP por ExchangeRate-API".
