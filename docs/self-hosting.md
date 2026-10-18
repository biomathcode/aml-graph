# Deployment and operations

## Single server

Install Docker Engine and Compose v2 on the target server (Node/jq not required), then run one command from the repository root:

```sh
npm run setup
```

That single command:

1. Generates `.env` with random secrets, identifiers and bindings from `.env.sample`,
   unless it already exists (credentials are preserved).
2. Builds all optimized images (app, OCR service) and starts the full stack:
   PostgreSQL, Redis, FalkorDB, OCR, migrations and the app.
3. Waits until the app health check passes and prints the URLs.

Without npm, run `node scripts/selfhost-init.mjs` (Node 22+) or create `.env`
from `.env.sample` manually, then `docker compose up -d --build`.

Then edit `.env`: set `APP_URL` to your public HTTPS origin and configure
storage/SMTP as needed. Check `docker compose ps` and `docker compose logs
--tail=50 app migrate`. Free space after rebuilds with `npm run docker:clean`.

The one-shot migration service runs before the app starts. The app image is
multi-stage alpine: the server bundle is compiled to plain JS with esbuild and
runs on `node`, so the runtime image carries only production dependencies
(no TypeScript toolchain, no frontend packages — vite compiles those into
static assets). The app runs as a non-root user. PostgreSQL, Redis, and
document volumes survive container restarts. Redis uses AOF persistence. There
is deliberately no RabbitMQ service or document worker.

## Custom domain and HTTPS

Point your domain to the server. Run Caddy on the host with this Caddyfile, replacing the example domain:

```caddyfile
kyc.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

Set `APP_URL=https://kyc.example.com` and `TRUST_PROXY=1`, then recreate the app. Caddy obtains the HTTPS certificate. The custom domain is deployment-wide; per-tenant domain registration is not included. Set `BIND_ADDRESS` only when the app must listen beyond loopback, and restrict exposure to the trusted proxy. Enable streaming and disable proxy buffering for `/api/events`.

## Email and notifications

Set `SMTP_URL=smtps://user:password@mail.example.com:465` (URL-encode credentials) and `SMTP_FROM`. Magic links and password reset report an error if SMTP is absent. Email/password sign-up works without SMTP. Sign-up is public; add an access gateway or invitation policy before a private organizational deployment if needed.

Webhook destinations require HTTPS and an exact administrator-configured hostname in `WEBHOOK_ALLOWED_HOSTS`. Create a signing secret under Settings. Notification delivery uses a small PostgreSQL outbox dispatcher in the app process, with 5 bounded attempts and exponential delay. This is independent of the deferred document processing queue. Multiple app instances coordinate claims in PostgreSQL. Failed deliveries are visible in Settings.

## Backups and restore

```sh
mkdir -p backups
chmod 700 backups
# Pause writes while backing up the database and documents consistently.
docker compose stop app
docker compose exec -T postgres pg_dump -U openkyc -d openkyc -Fc > backups/openkyc.dump
docker compose run --rm --no-deps --user root -v "$PWD/backups:/backup" app \
  tar czf /backup/documents.tgz -C /app/data/uploads .
docker compose start app
```

For a consistent snapshot, stop the app **before both** the database dump and document archive. For cloud buckets, use provider versioning/backup policies and retain matching PostgreSQL snapshots. Treat backups and `.env` as sensitive; encrypt and store them off-host.

Restore PostgreSQL into a fresh deployment with `pg_restore -U openkyc -d openkyc`, restore the local document archive into `/app/data/uploads` with ownership matching container user `node`, and retain the auth secret. Test recovery before relying on backups. Redis is not the primary document record; resetting Redis invalidates pending upload tickets and resets rate counters.

## Upgrades

Back up first. Run `docker compose build`, `docker compose run --rm migrate`, then `docker compose up -d app`. Review SQL migrations before upgrading. Never use `docker compose down -v` unless intentionally deleting all local data.

## Limits

This Compose setup is a single-host deployment, not a high-availability cluster. There is no automatic provider credential provisioning, external compliance certification, OCR, face matching, sanctions screening, or document authenticity decision. Manual review decisions and notes are tenant-owned records. Configure infrastructure retention, encryption, and monitoring to your organization's requirements.
