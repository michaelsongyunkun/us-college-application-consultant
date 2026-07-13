# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NODE_ENV=production

FROM base AS dependencies
ENV NODE_ENV=development
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS verification
COPY . .
RUN npm run verify && npm run eval:ai

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev && npm cache clean --force

FROM base AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/* && mkdir -p /app/data /app/backups && chown -R node:node /app
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .
USER node
ENV HOST=0.0.0.0 PORT=4177 AUTH_DATABASE_PATH=/app/data/auth.sqlite DATABASE_BACKUP_DIR=/app/backups/sqlite
EXPOSE 4177
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:4177/readyz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "start"]
