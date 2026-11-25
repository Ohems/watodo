# syntax=docker/dockerfile:1

# Build stage: install all workspace dependencies and build backend + frontend.
FROM node:26.13.1-alpine AS build
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# Runtime stage: production dependencies and build output only. The entrypoint
# starts the API (PORT, default 3000) and a static web server (WEB_PORT, default
# 8080) that serves the built frontend and proxies /api and /docs to the API, so
# the whole app is reachable on a single port.
FROM node:26.13.1-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/backend/dist ./backend/dist
# migrations are TypeScript and import from src (e.g. ../src/permissions.ts)
COPY --from=build /app/backend/src ./backend/src
COPY --from=build /app/backend/migrations ./backend/migrations
COPY --from=build /app/frontend/dist ./frontend/dist
COPY scripts/serve-static.mjs scripts/docker-entrypoint.mjs ./scripts/
EXPOSE 8080 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/health > /dev/null 2>&1 || exit 1
CMD ["node", "scripts/docker-entrypoint.mjs"]
