# ARCHITECTURE.md (§29, §30, §68)

---

## 1. Principio rector

> El sistema tiene **un solo núcleo difícil**: dinero multimoneda con tasas históricas.
> Todo lo demás es CRUD. La arquitectura invierte complejidad en ese núcleo y mantiene el
> resto deliberadamente simple.

No hay Clean Architecture con cuatro capas de abstracción en todo el proyecto. Hay:

- un **dominio puro y testeable** para dinero, tasas, costeo y cartera (sin Mongo, sin Express);
- una capa de **servicios** que orquesta transacciones;
- **controladores delgados** que solo validan y traducen HTTP.

Repositorios solo donde aportan (`Sale`, `Payment`, `Receivable`, `InventoryMovement`).
Para catálogos, el modelo Mongoose directo. Eso es §30 + §69 sin sobreingeniería.

---

## 2. Monorepo

```
GEOVANNY/
├── package.json                # npm workspaces
├── docs/                       # esta documentación
├── shared/                     # ÚNICA fuente de verdad de tipos y contratos
│   └── src/
│       ├── schemas/            # Zod: SaleSchema, PaymentSchema, ...
│       ├── types/              # tipos inferidos de Zod (nunca duplicados a mano)
│       ├── money/              # Money, Decimal helpers, redondeo por moneda
│       ├── constants/          # enums de estado, tipos de movimiento
│       └── format/             # formateo de moneda/fecha compartido cliente-servidor
├── server/
│   └── src/
│       ├── domain/             # ← NÚCLEO PURO, sin dependencias de infraestructura
│       │   ├── money/          # aritmética decimal, conversión, redondeo
│       │   ├── rates/          # resolución de tasa, triangulación, snapshot
│       │   ├── costing/        # landed cost, promedio ponderado, COGS
│       │   ├── receivables/    # aplicación de pagos, diferencia cambiaria
│       │   └── profit/         # estado de resultados (RP-04)
│       ├── models/             # esquemas Mongoose
│       ├── repositories/       # acceso a datos donde hay consultas complejas
│       ├── services/           # orquestación + transacciones
│       ├── controllers/        # HTTP delgado
│       ├── routes/
│       ├── middleware/         # auth, rbac, validate, idempotency, errors, rateLimit
│       ├── jobs/               # fetch de tasas, reconciliación nocturna, alertas
│       ├── integrations/       # proveedores de tasas (interfaz + implementaciones)
│       ├── config/
│       └── lib/                # logger, errores, db
└── client/
    └── src/
        ├── app/                # router, providers, layout
        ├── features/           # POR DOMINIO, no por tipo de archivo
        │   ├── sales/          # components/ hooks/ api/ types
        │   ├── customers/
        │   ├── inventory/
        │   ├── purchases/
        │   ├── receivables/
        │   ├── expenses/
        │   ├── rates/
        │   └── dashboard/
        ├── components/ui/      # design system: Button, Sheet, DataList, MoneyInput...
        ├── hooks/
        ├── lib/                # cliente HTTP, query client, formateadores
        └── styles/
```

**Gestor de paquetes: npm workspaces** (incluido en Node 22; no exige instalar pnpm).

**Por qué `shared/`:** el esquema Zod de una venta se define una vez y se usa para validar en
el navegador _y_ en el servidor. Es imposible que se desincronicen los tipos, que es el bug
más común y más caro en apps financieras full-stack.

---

## 3. Stack y justificación

| Capa            | Elección                                            | Por qué esta y no otra                                                                     |
| --------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Front           | **React 19 + Vite + TS**                            | Pedido en §29. Vite da HMR instantáneo y bundle pequeño                                    |
| Estilos         | **Tailwind CSS v4**                                 | Pedido. v4 compila más rápido y no necesita config JS                                      |
| Estado servidor | **TanStack Query**                                  | Caché, revalidación y _optimistic updates_ — clave para que la venta se sienta instantánea |
| Estado UI       | **Zustand**                                         | Mínimo: moneda de visualización, sesión, carrito de venta. Redux sería sobreingeniería     |
| Formularios     | **React Hook Form + Zod**                           | Sin re-render por tecla → importa en móviles baratos                                       |
| Gráficos        | **Recharts**                                        | Ligero, suficiente para el dashboard                                                       |
| Tablas          | Componente propio `DataList`                        | Renderiza tabla en desktop y cards en móvil desde **una** definición de columnas (§27)     |
| API             | **Express 5 + TS**                                  | Pedido en §29                                                                              |
| ODM             | **Mongoose 8**                                      | Decimal128 nativo, middleware para auditoría                                               |
| Validación      | **Zod**                                             | Compartido con el front                                                                    |
| Decimales       | **decimal.js**                                      | §32                                                                                        |
| Auth            | **JWT access (15 min) + refresh httpOnly rotativo** | §43                                                                                        |
| Hash            | **argon2id**                                        | Estándar actual, mejor que bcrypt frente a GPU                                             |
| Logs            | **pino**                                            | JSON estructurado, rápido                                                                  |
| Tests           | **Vitest + Supertest + mongodb-memory-server**      | Mismo runner en front y back                                                               |

---

## 4. El núcleo de dinero

### 4.1 Regla absoluta

```ts
// PROHIBIDO
const total = price * qty; // ❌ float
// CORRECTO
const total = D(price).times(D(qty)); // ✅ decimal.js
```

Se aplica con una regla ESLint (`no-restricted-syntax` sobre operadores aritméticos en
archivos de dominio) y con tests de propiedad. El `Decimal128` de Mongo se convierte a
`Decimal` en el límite del repositorio; **nunca** llega un `Decimal128` a la lógica ni un
`number` a la persistencia.

### 4.2 Servicio de conversión

```
convert(monto, monedaOrigen, monedaDestino, { at, market })
  1. si origen === destino → devuelve tal cual
  2. busca tasa directa vigente en `at` para (origen, destino, market)
  3. si no existe, triangula por USD (EXCHANGE_RATES.md §5) y marca derived:true
  4. si no hay tasa → lanza RateUnavailableError (NUNCA asume 1:1)
  5. redondea a currency.decimals solo al final
```

`at` por defecto es "ahora"; para reimprimir una operación histórica se pasa la fecha de la
operación, aunque en la práctica se lee el `rateSnapshot` guardado, que es más barato y más
fiel.

### 4.3 Snapshot

Al crear cualquier operación financiera, `RateSnapshotService.capture(total, currency)`
devuelve el bloque descrito en `DATABASE.md §0`, que se embebe en el documento.
Es la implementación literal de `RC-03` y del §35.

---

## 5. Manejo de errores

Una jerarquía, un middleware final:

```
AppError
├── ValidationError      400   (Zod)
├── AuthError            401
├── ForbiddenError       403
├── NotFoundError        404
├── ConflictError        409   (idempotencia, stock insuficiente, versión)
├── BusinessRuleError    422   (lleva `rule: "RC-22"` para trazar al documento)
└── IntegrationError     502   (proveedor de tasas)
```

Respuesta uniforme:

```json
{ "error": { "code": "INSUFFICIENT_STOCK", "message": "...", "rule": "RP-14", "details": {...} } }
```

El cliente traduce `code` a un mensaje en español. Nunca se filtra un stack trace en producción.

---

## 6. Transversales

| Preocupación   | Implementación                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Auditoría      | Middleware de servicio: cada mutación importante escribe `audit_logs` dentro de la misma transacción                        |
| Idempotencia   | Middleware que exige `Idempotency-Key` en POST sensibles; índice único; repetición devuelve el resultado original (`RP-09`) |
| RBAC           | `requirePermission('sale:create')`; matriz rol→permisos en un solo archivo                                                  |
| Rate limiting  | Global por IP + estricto en `/auth/login`                                                                                   |
| Seguridad      | helmet, CORS con allowlist, `express-mongo-sanitize`, límite de body, secretos solo por env                                 |
| Observabilidad | pino con `requestId`; log de toda operación financiera con su número                                                        |
| Paginación     | Siempre por cursor; `limit` máximo 100                                                                                      |
| Sesión | Access token de 15 min **solo en memoria** (nunca en localStorage) + refresh en cookie httpOnly con rotación y detección de reuso. El cliente **agrupa las renovaciones concurrentes en una sola petición**: el refresh es de un solo uso y dos en paralelo dispararían la detección de robo (ver T-31) |

---

## 7. Rendimiento (§52) — presupuesto explícito

| Métrica                     | Objetivo |
| --------------------------- | -------- |
| Guardar una venta (P95)     | < 400 ms |
| Primera pantalla útil en 3G | < 1,5 s  |
| Bundle inicial (gzip)       | < 180 KB |
| Dashboard completo          | < 800 ms |

Técnicas: desnormalización deliberada (`customerName`, `productName` en la venta evitan
`$lookup` en la lista), proyecciones cacheadas (`stock`, `balances`), code splitting por ruta,
prefetch de clientes y productos al abrir Nueva Venta, caché de tasas en memoria con TTL,
agregaciones del dashboard cacheadas 60 s.

---

## 8. Flujo de una venta a crédito (extremo a extremo)

```
POST /api/sales  { Idempotency-Key }
   │
   ├─ validate (Zod compartido)
   ├─ rbac: sale:create
   ├─ idempotency: ¿ya existe? → devuelve original
   │
   └─ SaleService.create()  ── withTransaction ──────────────────────┐
        1. resolver tasas → RateSnapshot                             │
        2. por ítem: precio, subtotal, unitCostSnapshot (avgCost)    │
        3. validar stock (RP-14: advertir o bloquear)                │
        4. counters.$inc → número V-2026-00001                       │
        5. insert sale                                               │
        6. N × insert inventory_movements  + $inc products.stock     │
        7. si hay saldo → insert receivable                          │
        8. $inc customers.balances + balanceFunctional               │
        9. insert audit_log                                          │
        10. calcular profit congelado                                │
       ──────────────────────────────────────── commit ──────────────┘
   │
   └─ 201 { sale, receivable }   →  el cliente invalida las queries afectadas
```
