# Self-hosting

Deploy web, core, and worker as separate processes. PostgreSQL stores application state; queue Redis transports jobs; cache Redis stores disposable read results. Hosting configuration is supplied by the operator.

## Configuration

Use the workspace `.env.example` files as the configuration reference. Inject secrets through your deployment platform. Never expose database, Redis, email, or model credentials through `NEXT_PUBLIC_*` variables.

| Process | Required configuration |
| --- | --- |
| Web | `NEXT_PUBLIC_CORE_URL` for the public API; optional `CORE_INTERNAL_URL` for server requests |
| Core | `DATABASE_URL`, `CACHE_REDIS_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `WEB_ORIGIN`, `RESEND_API_KEY`, `EMAIL_FROM` |
| Worker | `DATABASE_URL`, `QUEUE_REDIS_URL`, `CACHE_REDIS_URL`, `JEV_API_KEY`, `OPENAI_API_KEY`, model reservation limits |

Core requires explicit HTTPS `BETTER_AUTH_URL` and `WEB_ORIGIN` values in production. Set `PORT` when core should listen somewhere other than 4000. Use one database for core and worker. Workers need direct PostgreSQL connections or session pooling because task ownership uses session advisory locks; transaction pooling is unsuitable.

If web and core use different subdomains, set `AUTH_COOKIE_DOMAIN` to their common parent so the web server can read session cookies. Use trusted subdomains and keep `WEB_ORIGIN` exact. Register production OAuth callback URLs under core's public `/api/auth/callback/google` and `/api/auth/callback/twitter` paths.

`NEXT_PUBLIC_CORE_URL` is included in the web build. Set it before building. Set `CORE_INTERNAL_URL` at runtime when web should reach core through a private address.

Use separate queue and cache Redis instances in production. Configure queue Redis with persistence and a `noeviction` policy. Cache data can be evicted. Restrict database and Redis access to the application network and use TLS where connections cross untrusted networks.

## Database migrations

Run migrations once per deployment, before starting code that depends on new schema:

```sh
bun install --frozen-lockfile
bun run --cwd packages/db migrate
```

Provide the intended deployment's `DATABASE_URL` to this command. Do not assume a developer's local `.env` refers to production. Kysely serializes migration execution and records applied versions. Run the command again to confirm there is no pending migration. Do not edit an already deployed migration or manually mark a failed one as applied.

Back up an existing database and verify that it can be restored before schema changes. `002_feed` requires `pg_trgm`. `005_reliability` enforces one story assignment per source item and backfills initial post revisions. Check for conflicting assignments before applying it:

```sql
SELECT "sourceItemId", count(*)
FROM "storyItem"
GROUP BY "sourceItemId"
HAVING count(*) > 1;
```

Resolve conflicting assignments from source evidence before migration. Do not delete evidence to make a constraint pass. Migrations disable statement timeouts for DDL but retain a five-second lock timeout; a busy database can require a quieter deployment window. A failed transactional migration should be investigated and rerun after its cause is resolved.

Prefer a forward fix for a deployed schema issue. Restore from a verified backup only as a planned recovery operation; a rollback can discard data written by newer code.

## Build and run

```sh
bun run check
bun run build
```

Start each service through your process supervisor:

```sh
bun run --cwd apps/web start
bun run --cwd apps/core start
bun run --cwd apps/worker start
```

Send `SIGTERM` for shutdown and allow at least 30 seconds before a forced stop. The API drains requests; the worker drains active jobs and background work. The database reconciler recovers unfinished tasks after a worker restarts.

## Launch checks

- Run migrations against the actual deployment database and confirm a second run has no work.
- Check core `/health` and `/ready`, sign-in, email verification, and enabled OAuth providers.
- Test a reviewed source through collection, classification, publication, and a story thread.
- Set provider-side spending ceilings and conservative application reservations.
- Set `ADMIN_USER_IDS` to the intended editors and verify other accounts are denied access.
- Configure backups, retention, restore drills, and alerts for readiness failures, source lag, queue age, retries, and budget exhaustion.
- Restrict worker egress to permitted source networks and deny internal and metadata endpoints.

Do not run the integration suite against deployment data. Passing CI does not verify production credentials, billing, backups, network policy, or provider access.
