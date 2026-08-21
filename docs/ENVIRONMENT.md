# ENVIRONMENT.md (§64)

Ningún secreto real vive en el repositorio. `.env` está en `.gitignore`; lo que se versiona es
`.env.example` con las claves vacías y documentadas.

Las variables se validan **al arrancar** con Zod (`server/src/config/env.ts`): si falta una
obligatoria, el proceso no levanta. Es preferible fallar al iniciar que fallar a mitad de una
venta.

---

## Servidor — `server/.env.example`

```bash
# ── Aplicación ────────────────────────────────────────────────
NODE_ENV=development            # development | test | production
PORT=4000
API_PREFIX=/api
TZ=UTC                          # se guarda en UTC; se muestra en la zona del negocio

# ── Base de datos ─────────────────────────────────────────────
# DEBE ser un replica set: las transacciones lo exigen (DEPLOYMENT.md §1)
DATABASE_URL=mongodb://localhost:27017/geovanny?replicaSet=rs0
DATABASE_NAME=geovanny

# ── Autenticación ─────────────────────────────────────────────
JWT_SECRET=                     # ≥ 64 caracteres aleatorios: openssl rand -base64 48
JWT_ACCESS_TTL=15m
JWT_REFRESH_SECRET=             # distinto del anterior
JWT_REFRESH_TTL=30d
COOKIE_DOMAIN=localhost
COOKIE_SECURE=false             # true en producción, siempre

# ── CORS ──────────────────────────────────────────────────────
FRONTEND_URL=http://localhost:5173
CORS_ALLOWED_ORIGINS=http://localhost:5173

# ── Proveedores de tasas (EXCHANGE_RATES.md) ─────────────────
RATES_ENABLED=true
RATES_REFRESH_MINUTES=60
RATES_TIMEOUT_MS=5000

# COP: ExchangeRate-API, endpoint abierto, sin key, exige atribución
RATES_COP_PROVIDER=erapi
RATES_ERAPI_URL=https://open.er-api.com/v6/latest/USD

# VES: DolarAPI Venezuela, sin key, devuelve oficial y paralelo
RATES_VES_PROVIDER=dolarapi
RATES_DOLARAPI_URL=https://ve.dolarapi.com/v1/dolares
RATES_VES_DEFAULT_MARKET=PARALELO      # OFICIAL | PARALELO  (ver C-2)

# Secundario opcional para VES (requiere alta gratuita, 1.500 req/mes)
RATES_COTIZAVE_URL=
RATES_COTIZAVE_API_KEY=

# ── Seguridad ─────────────────────────────────────────────────
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120
RATE_LIMIT_LOGIN_MAX=5
BODY_LIMIT=1mb
ARGON2_MEMORY_COST=19456        # 19 MiB, recomendación OWASP
ARGON2_TIME_COST=2

# ── Observabilidad ────────────────────────────────────────────
LOG_LEVEL=info                  # debug | info | warn | error
SENTRY_DSN=

# ── Semilla inicial (solo primer arranque) ────────────────────
SEED_ADMIN_EMAIL=
SEED_ADMIN_PASSWORD=            # cambiar tras el primer login
SEED_BUSINESS_NAME=
```

---

## Cliente — `client/.env.example`

```bash
# Solo variables PÚBLICAS. Vite incrusta VITE_* en el bundle:
# lo que se ponga aquí es visible para cualquiera. NUNCA una API key aquí (§43).
VITE_API_URL=http://localhost:4000/api
VITE_APP_NAME=Geovanny
VITE_DEFAULT_CURRENCY=COP
VITE_SENTRY_DSN=
VITE_ENABLE_OFFLINE=false       # fase 15
```

> Las claves de proveedores de tasas viven **solo** en el servidor. El cliente nunca llama a
> una API externa: pide las tasas a nuestro backend, que ya las tiene cacheadas y auditadas.

---

## Generación de secretos

```bash
openssl rand -base64 48
```

---

## Matriz por entorno

| Variable        | Local                      | Staging                | Producción             |
| --------------- | -------------------------- | ---------------------- | ---------------------- |
| `NODE_ENV`      | development                | production             | production             |
| `COOKIE_SECURE` | false                      | true                   | true                   |
| `LOG_LEVEL`     | debug                      | info                   | info                   |
| `RATES_ENABLED` | false (usa tasas manuales) | true                   | true                   |
| `DATABASE_URL`  | `npm run dev` la levanta   | Atlas M0               | Atlas                  |
| `SEED_*`        | sí                         | solo primer despliegue | solo primer despliegue |

---

## Checklist antes de producción

- [ ] `JWT_SECRET` y `JWT_REFRESH_SECRET` distintos, ≥ 64 caracteres, nunca los de ejemplo
- [ ] `COOKIE_SECURE=true` y dominio propio con HTTPS
- [ ] `CORS_ALLOWED_ORIGINS` con el dominio exacto, sin `*`
- [ ] `DATABASE_URL` apuntando a un replica set con usuario de mínimos privilegios
- [ ] IP allowlist configurada en Atlas
- [ ] Contraseña del admin sembrado ya cambiada
- [ ] Variables `SEED_*` retiradas del entorno tras el primer arranque
- [ ] Backup verificado con una restauración real
