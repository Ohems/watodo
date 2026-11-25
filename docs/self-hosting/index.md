# Self-hosting overview

**Docker is the recommended way to run Watodo.** The prebuilt image
[`ohems/watodo`](https://hub.docker.com/r/ohems/watodo) on Docker Hub contains the API
server and the built web app and is published automatically on every GitHub release.
See [Running with Docker](/self-hosting/docker) for `docker run` and `docker compose`
instructions, including a compose template with PostgreSQL and Redis.

To build and run the app from source instead (development, or a custom setup), follow
the [repository README](https://github.com/Ohems/watodo#readme); this documentation
does not duplicate those setup steps.

## What a running instance consists of

| Component | Technology | Notes |
|-----------|------------|-------|
| Backend API | Fastify v5, Node.js, TypeScript | Served by the image on `PORT` (default 3000, internal) |
| Frontend SPA | React 19 + Vite 7, prebuilt in the image | Served on `WEB_PORT` (default 8080) with `/api` and `/docs` proxied to the API |
| PostgreSQL 17 | in the compose template, or any managed Postgres | Stores all application data |
| Redis 7 | in the compose template, or any managed Redis | Caches access tokens |

Other facts useful when hosting:

- **Auth**: users log in through OAuth providers (Discord, Google, Microsoft). There
  are no passwords. The API authenticates requests with an `x-token` header (the
  frontend sends the token from localStorage).
- **Bootstrap**: the first user to ever log in automatically gets a default
  organization (default timezone UTC) and an `admin` role in it. So the first
  person to sign in becomes the instance admin.
- **Health check**: `GET /api/health` (no auth). Interactive API docs (Swagger UI)
  are served at `/docs`.
- **Migrations**: the schema is managed with node-pg-migrate; apply pending migrations
  after every upgrade, before starting the new version (the compose template has a
  one-shot `migrate` service for this).

## Pages in this section

- [Running with Docker](/self-hosting/docker): the prebuilt image, `docker run`, and a full `docker compose` template
- [Configuration](/self-hosting/configuration): every environment variable explained
- [OAuth login providers](/self-hosting/oauth-providers): app registration and redirect URIs
- [Production deployment](/self-hosting/production): reverse proxy, TLS, backups, upgrades
