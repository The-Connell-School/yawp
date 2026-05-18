# Production DB Access

Use the bastion tunnel for production database reads and small approved writes.
Do not open RDS publicly.

## Source env

The live connection variables are gitignored:

- `scripts/production-sync.env`

That file contains the bastion host/user/key, RDS host/port/user/db, and the
RDS password. Do not copy those values into committed files or shell history.

## Open a read tunnel

Use a local port that is not already bound. Port `3307` is a safe default when
the migration helper may use `3306`.

```bash
set -a
source scripts/production-sync.env
set +a

ssh -N \
  -L 127.0.0.1:3307:${YAWP_PROD_PG_HOST}:${YAWP_PROD_PG_PORT} \
  ${YAWP_PROD_BASTION_USER}@${YAWP_PROD_BASTION_HOST} \
  -i ${YAWP_PROD_BASTION_KEY} \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30
```

Leave that process running while querying.

## Run a read query

```bash
set -a
source scripts/production-sync.env
set +a

PGPASSWORD="$YAWP_PROD_PG_PASSWORD" psql \
  -X \
  -v ON_ERROR_STOP=1 \
  -h 127.0.0.1 \
  -p 3307 \
  -U "$YAWP_PROD_PG_USER" \
  -d "$YAWP_PROD_PG_DB" \
  -c 'SELECT name, value, "valueType" FROM "Setting" ORDER BY name;'
```

Reads can be run directly. Show Bryant the exact SQL before any production
write, even small Setting upserts.

## Existing migration path

The historical migration helper still exists:

```bash
bun prisma:migrate-remote production
```

It reads `packages/prisma/.env`, opens a bastion tunnel, rewrites
`DATABASE_URL` to localhost, and runs `prisma migrate deploy`. Use this for
schema migrations, not for ad hoc inspection.
