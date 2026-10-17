# Local development

## Requirements

- Bun 1.4.2, as pinned in `package.json` and CI.
- PostgreSQL with permission to install `pg_trgm`.
- Redis 7.4 or a compatible BullMQ deployment.
- Resend API credentials and a verified sender for authentication email.
- TypeSafe and OpenAI API credentials to run the ingestion worker.
- X API access and a separate bearer token if you register X sources.

PostgreSQL 17 and Redis 7.4 are used in CI. The repository does not provision local services. Start your own services and create a database and application role before migrating.

## Install and configure

From the repository root:

```sh
bun install --frozen-lockfile
cp packages/db/.env.example packages/db/.env
cp apps/core/.env.example apps/core/.env
cp apps/web/.env.example apps/web/.env
cp apps/worker/.env.example apps/worker/.env
```

Use the same `DATABASE_URL` in the database, core, and worker files. Bun loads environment files relative to each workspace. A root `.env` does not configure every app.

Set `BETTER_AUTH_SECRET` to a random value of at least 32 characters. Set `RESEND_API_KEY` and `EMAIL_FROM` in core. Keep credentials in ignored environment files.

For ingestion, set `JEV_API_KEY`, `OPENAI_API_KEY`, and the model budget variables in the worker. `QUEUE_REDIS_URL` and `CACHE_REDIS_URL` can point to the same Redis instance locally.

## Migrate and start

```sh
bun run --cwd packages/db migrate
bun run dev
```

Turbo starts the web app on port 3000, core on port 4000, and the worker as a separate process. The worker requires its credentials even if no sources are registered. To work on web and auth without ingestion, run these in separate terminals:

```sh
bun run --cwd apps/core dev
bun run --cwd apps/web dev
```

Open `http://localhost:3000/auth`. After signing in, the feed is at `/news` and account settings at `/account`. An empty database shows an empty feed.

Core exposes `GET /health` for liveness and `GET /ready` for PostgreSQL readiness. A healthy response does not verify email or model credentials.

## Optional OAuth

Configure both client ID and client secret for each provider in core. Register these development callbacks with the provider:

| Provider | Callback |
| --- | --- |
| Google | `http://localhost:4000/api/auth/callback/google` |
| X | `http://localhost:4000/api/auth/callback/twitter` |

X sign-in requires the `user.email` scope. OAuth credentials do not replace the X bearer token used by the worker.

## Add sources

Register only sources whose access and retention terms you have reviewed:

```sh
bun run --cwd apps/worker source:add "Source name" atom "https://example.com/feed.atom"
```

The command accepts `rss`, `atom`, `x`, and `x_search` and enables the registered source. X timelines use a numeric user ID:

```sh
bun run --cwd apps/worker source:add "Account name" x "https://x.com/i/user/123456"
```

See [operations](operations.md) for search sources, read allowances, review, and replay.

## Checks

```sh
bun run check
bun test apps/core/src apps/worker/src
bun run build
```

Without test service URLs, database and Redis integration suites are skipped. CI runs them against disposable services. To run them locally, create a database named `recent_test` on localhost and a separate test Redis listener on port 56379. Apply migrations to the test database first:

```sh
DATABASE_URL=postgres://recent:recent@127.0.0.1:55432/recent_test bun run --cwd packages/db migrate
TEST_DATABASE_URL=postgres://recent:recent@127.0.0.1:55432/recent_test TEST_REDIS_URL=redis://127.0.0.1:56379/13 bun test apps/core/src apps/worker/src
```

Integration tests truncate tables and remove test queues. Use only disposable services. The `TEST_DATABASE_URL` and `TEST_REDIS_URL` variables are independent of the application database.
