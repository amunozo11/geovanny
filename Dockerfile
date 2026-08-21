# Imagen de producción: una sola cosa que publicar.
# El servidor entrega la API y la aplicación desde la misma dirección.

# ── Construcción ──────────────────────────────────────────────────────────
FROM node:22-slim AS construccion

WORKDIR /app

# Primero los manifiestos: si no cambian, Docker reutiliza las dependencias
# ya instaladas y la construcción tarda segundos en vez de minutos.
COPY package*.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci

COPY . .
RUN npm run build

# Se quitan las dependencias de desarrollo: la imagen final no las necesita
# y son la mayor parte del peso.
RUN npm prune --omit=dev

# ── Imagen final ──────────────────────────────────────────────────────────
FROM node:22-slim AS produccion

ENV NODE_ENV=production
WORKDIR /app

# No correr como root.
USER node

COPY --from=construccion --chown=node:node /app/node_modules ./node_modules
COPY --from=construccion --chown=node:node /app/package.json ./package.json
COPY --from=construccion --chown=node:node /app/shared/dist ./shared/dist
COPY --from=construccion --chown=node:node /app/shared/package.json ./shared/package.json
COPY --from=construccion --chown=node:node /app/server/dist ./server/dist
COPY --from=construccion --chown=node:node /app/server/package.json ./server/package.json
COPY --from=construccion --chown=node:node /app/client/dist ./client/dist

EXPOSE 4000

# El healthcheck comprueba también la base de datos: una API viva con la base
# caída no está sana y el proveedor debe saberlo.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
