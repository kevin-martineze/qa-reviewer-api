# syntax=docker/dockerfile:1.7
# Imagen de producción del API. Se publica para linux/arm64 (EC2 t4g) desde GitHub Actions;
# también construye en amd64. Ver docs/operations.md, «Producción en EC2».
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
# MONGOMS_DISABLE_POSTINSTALL: no descargar el Mongo de las pruebas al instalar.
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    MONGOMS_DISABLE_POSTINSTALL=1
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./

# Todas las dependencias y el build (nest build: SWC más chequeo de tipos).
FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --store-dir /pnpm/store
COPY tsconfig.json tsconfig.build.json nest-cli.json .swcrc ./
COPY src ./src
RUN pnpm build

# Solo las dependencias de producción.
FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --store-dir /pnpm/store --prod

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    LOG_FORMAT=json
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3000
# Vida del proceso; Mongo y el storage los mide /healthcheck/readiness-probe.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthcheck').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/main"]
