# Music of the Cosmos — production image.
#
# Pages are prerendered from the database (Cache Components), so `next build` needs a live
# database. The image therefore holds the source and dependencies, and the entrypoint
# migrates, seeds an empty database, builds once on first start and then serves.
# See docker/entrypoint.sh and docker-compose.yml.

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
# curl for the healthcheck; tini reaps the npx/node children and forwards signals.
RUN apt-get update && apt-get install -y --no-install-recommends curl tini && rm -rf /var/lib/apt/lists/*
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10m --retries=3 CMD curl -fsS "http://localhost:${PORT}/api/health" || exit 1
ENTRYPOINT ["/usr/bin/tini", "--", "docker/entrypoint.sh"]
