# syntax=docker/dockerfile:1

# Imagen de la aplicación (API y MCP). Tres etapas —dependencias, compilación y
# ejecución— para que la imagen final no arrastre el código fuente ni las
# dependencias de desarrollo.

ARG NODE_VERSION=24-alpine

# --- Dependencias -----------------------------------------------------------
FROM node:${NODE_VERSION} AS deps

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /srv/sidequest

RUN corepack enable

# Solo los manifiestos: mientras no cambien, la instalación se sirve de la caché
# de capas en lugar de repetirse en cada cambio de código.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/package.json ./app/
COPY web/package.json ./web/

# El filtro deja fuera el panel: esta imagen solo ejecuta la aplicación.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @sidequest/app...

# --- Compilación ------------------------------------------------------------
FROM deps AS build

COPY tsconfig.base.json ./
COPY app ./app

RUN pnpm --filter @sidequest/app run build

# --- Ejecución --------------------------------------------------------------
FROM node:${NODE_VERSION} AS runtime

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NODE_ENV=production
WORKDIR /srv/sidequest

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/package.json ./app/
COPY web/package.json ./web/

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @sidequest/app

COPY --from=build /srv/sidequest/app/dist ./app/dist

USER node

# Documental: el puerto real lo fija APP_PORT y lo publica compose.yaml.
EXPOSE 3000

CMD ["node", "app/dist/index.js"]
