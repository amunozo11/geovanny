# DEPLOYMENT.md — Publicar la aplicación

> Reescrito el 21/08/2026 con los pasos reales de lo que está construido.

---

## Lo que se publica

**Una sola cosa.** El servidor entrega la aplicación y la API desde la misma
dirección, así que no hay dos despliegues que mantener sincronizados, ni CORS
que configurar, ni un cliente apuntando a una API que cambió de sitio.

```
   Tu celular / computador
            │  https://…
            ▼
   ┌─────────────────────────────┐
   │  Un servicio                │
   │  · la aplicación (pantallas)│
   │  · la API (/api)            │
   └──────────────┬──────────────┘
                  │
                  ▼
        MongoDB Atlas (la base)
```

---

## ⚠️ Esta instalación va SIN contraseña

Por decisión del negocio (20/08/2026) se despliega con `ACCESO_ABIERTO=true`:
la aplicación no pide usuario ni contraseña.

**Cualquiera que conozca la dirección entra como administrador**: ve las deudas
de todos los clientes, sus teléfonos, el dinero en caja y las tasas, y puede
registrar, modificar y anular operaciones.

Medidas mínimas que sí conviene tomar:

- **No compartir la dirección** ni publicarla en ningún sitio.
- Dejar la dirección larga que asigna el proveedor
  (`geovanny-a1b2c3.onrender.com`) en vez de un dominio corto y fácil de
  adivinar.
- Guardarla como marcador y no enviarla por grupos de WhatsApp.

**Para cerrar la puerta en cualquier momento**, sin tocar código: cambiar la
variable `ACCESO_ABIERTO` a `false` y reiniciar. Vuelve la pantalla de entrada
con el usuario y la contraseña de `SEED_ADMIN_*`, y todo lo registrado sigue
igual.

---

## Paso 1 · La base de datos (gratis)

1. Crear cuenta en **mongodb.com/atlas** y un clúster **M0** (gratuito).
2. Región: **AWS N. Virginia (us-east-1)** — la más cercana a Colombia y
   Venezuela entre las disponibles.
3. En *Database Access*, crear un usuario con contraseña.
4. En *Network Access*, permitir el acceso desde el servidor.
5. Copiar la cadena de conexión, que se ve así:

```
mongodb+srv://usuario:clave@cluster.xxxxx.mongodb.net/geovanny?retryWrites=true&w=majority
```

> Atlas es un replica set de tres nodos incluso en el plan gratuito, que es lo
> que MongoDB exige para las transacciones. Sin eso, ninguna venta se podría
> guardar entera (ver `DATABASE.md`).

Cuándo pasar de M0 a M10 (~57 US$/mes): no por tamaño —el volumen de este
negocio cabe de sobra— sino cuando quieras **copias de seguridad automáticas**
con recuperación a un punto en el tiempo. Recomendado en cuanto haya datos
reales de los que dependas.

---

## Paso 2 · El servidor

### Opción A — Render (la más simple)

El repositorio trae `render.yaml`, así que Render lo configura solo.

1. Subir el proyecto a GitHub.
2. En Render: *New → Blueprint* y elegir el repositorio.
3. Completar las variables que pide:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | la cadena de Atlas del paso 1 |
| `CORS_ALLOWED_ORIGINS` | la dirección que te dé Render |
| `ACCESO_ABIERTO` | `true` |
| `SEED_ADMIN_EMAIL` · `SEED_ADMIN_PASSWORD` · `SEED_ADMIN_NAME` | por si algún día cierras la puerta |

`JWT_SECRET` y `JWT_REFRESH_SECRET` los genera Render solo.

**Plan `starter` (~7 US$/mes), no el gratuito.** El gratuito duerme a los 15
minutos y despierta en unos 30 segundos: abrirías la app frente a un cliente y
esperarías medio minuto.

### Opción B — Cualquier servidor con Docker

```bash
docker build -t geovanny .
```

```bash
docker run -d -p 80:4000 --env-file .env.produccion --restart unless-stopped geovanny
```

Sirve para un VPS (~6–12 US$/mes), Fly.io o cualquier proveedor. La imagen
incluye healthcheck y no corre como root.

---

## Paso 3 · Nada más

Al arrancar, el servidor **se prepara solo**: crea los catálogos, los productos
base, las tres cajas y consulta la tasa del día en internet. Es idempotente, así
que puede reiniciarse las veces que sea.

Comprobar que quedó bien:

```bash
curl https://TU-DIRECCION/api/health
```

Debe responder `"status":"ok"` y `"database":"conectado"`.

---

## Variables de producción

```bash
NODE_ENV=production
DATABASE_URL=mongodb+srv://…            # Atlas
TZ_NEGOCIO=America/Bogota               # el día del negocio
ACCESO_ABIERTO=true                     # sin usuario ni contraseña
COOKIE_SECURE=true
CORS_ALLOWED_ORIGINS=https://tu-direccion
JWT_SECRET=…                            # openssl rand -base64 48
JWT_REFRESH_SECRET=…                    # distinto del anterior
LOG_LEVEL=info
RATES_ENABLED=true
RATES_VES_DEFAULT_MARKET=PARALELO
```

---

## Después de publicar

| Tema | Qué hacer |
|---|---|
| **Copias de seguridad** | Lo más importante de todo. Atlas las hace automáticas desde M10; en M0 conviene un `mongodump` semanal guardado fuera del proveedor. Una copia que no se ha probado restaurando no es una copia |
| **Vigilancia** | `https://TU-DIRECCION/api/health` con un servicio gratuito tipo UptimeRobot: avisa si se cae |
| **Actualizar** | Subir los cambios a GitHub; Render vuelve a desplegar solo. Con Docker, reconstruir la imagen |
| **Secretos** | Solo en las variables del proveedor. Nunca en el repositorio |
| **Hora** | Todo se guarda en UTC y se muestra en la hora del negocio (`TZ_NEGOCIO`) |

---

## Por qué esta arquitectura y no otra

| | **Render + Atlas** | **VPS con Docker** | **Serverless** |
|---|---|---|---|
| Costo al mes | ~7 US$ + base gratis | ~6–12 US$ todo | 0–20 US$, impredecible |
| Arranque en frío | Ninguno en plan pago | Ninguno | Sí, en cada función ❌ |
| Transacciones de MongoDB | ✅ | ✅ | ⚠️ el pool de conexiones sufre |
| Copias de seguridad | Incluidas desde M10 | Tuyas ❌ | Incluidas |
| Mantenimiento | Casi nulo | Actualizaciones, TLS, seguridad ❌ | Casi nulo |

**Serverless queda descartado**: transacciones de MongoDB y arranques en frío
son justo lo que rompe el objetivo de que una venta se guarde en menos de medio
segundo.

La latencia importa menos por dónde estés tú que por **dónde está la base
respecto al servidor**: una venta hace ocho o diez idas y vueltas a MongoDB. Por
eso ambos van en la misma región. El usuario puede estar a 80 ms; la base no.
