# Running with Docker

Watodo is published as a ready-to-run Docker image on Docker Hub:

```
ohems/watodo
```

A new image is built and pushed automatically whenever a GitHub release is
published (see `.github/workflows/publish-docker.yml` in the repository). Tags are
`latest` plus the release version, e.g. `1.2.3`, `1.2` and `1`.

The image contains both the API server and the built web app. A small web server
inside the container listens on `WEB_PORT` (default **8080**) and proxies `/api`
and `/docs` to the API (on `PORT`, default 3000), so the whole app is served from a
single port. `NODE_ENV=production` is already set in the image; everything else is
configured with the environment variables from [Configuration](/self-hosting/configuration).

## Prerequisites

- Docker (with the Compose plugin if you want the compose setup below)

## Run directly with docker

Create an env file and set at least
`DATABASE_URL`, `REDIS_URL`, `BASE_URL`, `APP_URL` and one OAuth provider
(see [OAuth login providers](/self-hosting/oauth-providers)). `BASE_URL` must be
the public URL of the app (used for OAuth redirects), e.g. `http://localhost:8080`
for a local test.

```bash
docker pull ohems/watodo:latest

# If the databases run on the same host, the container reaches them via
# host.docker.internal (on Linux add --add-host=host.docker.internal:host-gateway):
docker run -d --name watodo \
  --restart unless-stopped \
  -p 8080:8080 \
  --env-file .env \
  ohems/watodo:latest
```

Pending database migrations are applied automatically when the app starts
(`AUTO_MIGRATE=true`, the default; set it to `false` and run
`docker run --rm --env-file .env -e DATABASE_URL=... ohems/watodo:latest npm run migrate -w backend`
once per upgrade instead).

Then open http://localhost:8080. The API health check is at
http://localhost:8080/api/health and the interactive API docs (Swagger UI) at
http://localhost:8080/docs.

Container-specific variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `WEB_PORT` | `8080` | Port the web server (frontend + `/api` proxy) listens on; map this one |
| `PORT` | `3000` | Port the API server listens on inside the container |
| `API_URL` | `http://127.0.0.1:3000` | Where the web server forwards `/api` and `/docs` requests |

## Run with docker compose

This template has everything the app needs to run:
the app itself, PostgreSQL and Redis.

```yaml
services:
  watodo:
    image: ohems/watodo:latest
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      # Point the app at the databases defined in this file:
      DATABASE_URL: postgres://watodo:${POSTGRES_PASSWORD:-dbPass123}@postgres:5432/watodo
      REDIS_URL: redis://redis:6379
      BASE_URL: ${BASE_URL:-http://localhost:8080}
      APP_URL: ${APP_URL:-http://localhost:8080}
      # Add any other variables from the configuration reference here as needed,
      # e.g. an OAuth login provider:
      # https://ohems.github.io/watodo/self-hosting/configuration
      # DISCORD_CLIENT_ID: <numeric application id>
      # DISCORD_CLIENT_SECRET: <client secret>
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started

  postgres:
    image: postgres:17
    restart: unless-stopped
    environment:
      POSTGRES_USER: watodo
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-dbPass123}  # change this
      POSTGRES_DB: watodo
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U watodo -d watodo"]
      interval: 5s
      timeout: 3s
      retries: 12

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

Start everything:

```bash
docker compose up -d        # starts the databases and the app (waits for healthy postgres; applies pending migrations on startup)
docker compose logs -f watodo
```

The app is now at http://localhost:8080.

## Upgrading

```bash
docker compose pull                       # or: docker pull ohems/watodo:latest
docker compose up -d                      # restart the app with the new image (applies new migrations on startup)
```

Migrations run automatically at startup because `AUTO_MIGRATE=true` is the
default. To run them manually instead, set `AUTO_MIGRATE=false` and apply them
with `npm run migrate -w backend` (inside the container:
`docker compose run --rm watodo npm run migrate -w backend`).

## Production notes

For a real deployment, put the app behind a reverse proxy that terminates TLS and
set `BASE_URL`/`APP_URL` to the public URL; see
[Production deployment](/self-hosting/production). Back up the PostgreSQL volume
regularly (see the same page).
