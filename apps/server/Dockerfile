# Ouroboros self-hosted server: builds the Nuxt GUI and runs the Node API.
FROM node:22-bookworm

# git is required by the LocalRunner (branch/commit/push); build tools for
# better-sqlite3's native binding fallback.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates python3 build-essential \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install all workspace dependencies (root lockfile drives the monorepo).
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY web/package.json web/package.json
RUN npm install

# Copy sources and build the static GUI.
COPY . .
RUN npm run build:web

ENV NODE_ENV=production \
    OURO_DB_PATH=/data/ouroboros.db \
    OURO_LOG_DIR=/logs \
    OURO_GUI_DIR=/app/web/.output/public \
    PORT=3000

VOLUME ["/data", "/logs"]
EXPOSE 3000

CMD ["npm", "run", "server"]
