# Production deployment

Run Watodo in production with the prebuilt Docker image (`ohems/watodo`); see
[Running with Docker](/self-hosting/docker) for the container and compose setup.
To build and run from source instead, follow the
[repository README](https://github.com/Ohems/watodo#readme).

This page covers the production concerns that are specific to hosting: exposing the
container through a TLS-terminating reverse proxy, the required environment, backups,
and upgrades.

## Reverse proxy and TLS

Put the container behind a reverse proxy (Caddy, nginx, Traefik) that terminates
TLS. The container itself serves plain HTTP on port 8080. Example with Caddy for
`app.example.com`:

```caddy
app.example.com {
  reverse_proxy localhost:8080
}
```

Then set the public URLs in the environment (see
[Configuration](/self-hosting/configuration)):

```bash
BASE_URL=https://app.example.com
APP_URL=https://app.example.com
```

`BASE_URL` is used to build the OAuth redirect URLs, so it must match exactly how
users reach the app (see [OAuth login providers](/self-hosting/oauth-providers)).

## Databases

PostgreSQL 17 and Redis 7 are required. The compose template in
[Running with Docker](/self-hosting/docker) starts both next to the app; for larger
setups point `DATABASE_URL` / `REDIS_URL` at managed services instead.

## Backups

Back up PostgreSQL regularly, for example from a compose setup:

```bash
docker compose exec -T postgres pg_dump -U watodo watodo | gzip > "watodo-$(date +%F).sql.gz"
```

Redis only holds a token cache and can be recreated at any time.

## Upgrading

With the compose template:

```bash
docker compose pull                       # fetch the new image
docker compose up -d                      # restart the app with the new image (applies new migrations on startup)
```

Migrations are applied automatically at startup (`AUTO_MIGRATE=true`, the
default). With plain `docker run`, see
[Running with Docker](/self-hosting/docker#upgrading). Never edit or delete existing
migration files.

## Optional: notification delivery

In-app notifications always work if enabled by the user.
To deliver email and push notifications, configure
`MAIL_*` and `VAPID_*` as described in [Configuration](/self-hosting/configuration).
