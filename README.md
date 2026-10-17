# Recent

Keeps you current on AI.

## Local auth setup

Recent uses Bun workspaces, a Bun/Hono core API, a server-rendered Next.js web app, Kysely with PostgreSQL, Better Auth, and Resend.

1. Run `bun install` at the repository root.
2. Copy `packages/db/.env.example` to `packages/db/.env`, `apps/core/.env.example` to `apps/core/.env`, and `apps/web/.env.example` to `apps/web/.env`.
3. Put the same local PostgreSQL URL in the database and core environment files. Set a random `BETTER_AUTH_SECRET` with at least 32 characters, a Resend API key, and a verified sender address in the core file.
4. Run `bun run --cwd packages/db migrate` to apply the auth and feed migrations.
5. Run `bun run dev`, then open `http://localhost:3000/auth`.

Google and X sign-in become available when both client credentials for the provider are set in `apps/core/.env`. Register `http://localhost:4000/api/auth/callback/google` and `http://localhost:4000/api/auth/callback/twitter` with the providers. X sign-in requires the `user.email` scope. These OAuth credentials are separate from the X API credentials used for news collection.

Email passwords must be 6 to 20 characters. Account settings support changing the password.

The web and API use `localhost` on different ports in development. In production, configure `BETTER_AUTH_URL`, `WEB_ORIGIN`, and `NEXT_PUBLIC_CORE_URL` with the public origins. If they are different subdomains, set `AUTH_COOKIE_DOMAIN` to their common parent domain so the Next.js server can read the session cookie. `CORE_INTERNAL_URL` may point to an internal core address for server-side session requests.

## News pipeline

The news feed is at `/news`; story threads are at `/stories/[storyId]`. The Bun worker checks for due sources every minute and polls each source on its configured interval, classifies items with Jev, matches stories, and selects source-backed text with Luna when an excerpt is long. PostgreSQL owns the published cards. BullMQ uses `QUEUE_REDIS_URL`; the feed cache uses `CACHE_REDIS_URL`. Use separate Redis instances in production.

For locally provisioned PostgreSQL and Redis, the example URLs are `postgres://recent:recent@localhost:5432/recent` and `redis://localhost:6379`. This repository does not provision those services. The queue and cache URLs may point to that same Redis instance locally.

Copy `apps/worker/.env.example` to `apps/worker/.env`, set the database URL and provider keys, and add a reviewed feed with `bun run --cwd apps/worker source:add "Source name" atom "https://example.com/feed.atom"`. For X, provide a separate API bearer token and register a numeric user ID with `bun run --cwd apps/worker source:add "Account name" x "https://x.com/i/user/123456"`. X sources poll every two hours and reserve expanded-resource allowances against a conservative 2,000 read monthly cap. Configure a $10 spending limit in the X Developer Console as the authoritative charge guard. Timeline pagination persists continuation state between polls; track source coverage and budget exhaustion. Run `bun run --cwd apps/worker dev` alongside core and web. The worker starts the recurring dispatcher and relays database outbox events to its queues. No source is enabled by default, so source selection remains deliberate.

## Reliability and editorial operations

Apply migrations before starting the updated applications. Migration `005_reliability` adds recovery scheduling, X crawl state, editorial audit records, post revisions, and model accounting. It enforces one primary story assignment per source item; if existing data violates that invariant, resolve those assignments before migrating. Do not delete evidence to make a migration pass.

Task execution holds PostgreSQL advisory locks on a dedicated connection for the task and source item. Story matching also takes a cross-process matching lock. Provider calls do not hold an open SQL transaction. A process exit releases ownership; the reconciler checks unfinished tasks every 30 seconds and restores work idle for at least one minute. Attempts remain in PostgreSQL across queue loss. Four unsuccessful execution claims send a task to review. Terminal BullMQ jobs are removed before explicit replay, and the recurring dispatcher is recreated after Redis loss. These locks require a direct PostgreSQL connection or session pooling, not transaction pooling.

The cache coalesces same-key requests within an API process and uses a renewable Redis lock across processes. After invalidation, one caller rebuilds a generation and waiting readers share the cached result. Cold readers wait up to 15 seconds without starting competing database queries. Redis failures use local request coalescing with at most four concurrent rebuilds and 100 queued distinct-key rebuilds per API process. This outage limit is per process; there is no claim of a cross-process cache lock while Redis is unavailable. Cache writes cannot replace a newer generation. Publication invalidation projects absolute PostgreSQL generation numbers rather than incrementing a disposable counter.

Set `ADMIN_USER_IDS` in core to a comma-separated list of Better Auth user IDs. The default grants nobody editorial access. All `/api/admin` routes require an allowed user's session cookie. Browser mutation requests must use the configured web origin. Editorial actions record the actor, reason, and time.

| Method | Endpoint | Body or result |
| --- | --- | --- |
| GET | `/api/admin/reviews?status=open&after=<cursor>` | Up to 50 review records and `nextCursor` |
| POST | `/api/admin/reviews/:id/resolve` | `{ "action": "approve", "reason": "Checked against the source" }` or `reject` |
| POST | `/api/admin/tasks/:id/replay` | `{ "reason": "Provider access restored" }` |
| POST | `/api/admin/posts/:id/revise` | `{ "action": "correct", "headline": "Corrected title", "body": "Exact source excerpt", "reason": "Evidence corrected" }` or `retract` with a reason |
| GET | `/api/admin/posts/:id/history?after=<cursor>` | Chronological revision snapshots and a resource-scoped `nextCursor` |

Approving uncertain classification advances it to matching. Approving a story-match review requires `storyId` for an existing story or explicit `null` for a new story. A source already assigned to a story must keep that assignment. Approving a processing failure replays that failed stage. Rejection prevents automatic processing and replay. Active processing must finish before an editor changes its source item. Corrections require an exact excerpt of current evidence and keep the original publication time. Retractions remove the card from published reads. Revision snapshots preserve manual changes; X takedowns redact retained source text and revision bodies while preserving non-content audit metadata. The editorial API is implemented; a dedicated editor dashboard is not included.

## X coverage and budgets

Timeline collection persists one page and its continuation token atomically with its items. While more pages remain, `sinceId` stays at the previous high-water mark and the source becomes due again after one minute. Only the final persisted page advances the high-water mark. Rate-limit delays preserve that state. An interrupted walk therefore resumes without jumping over the unseen pages. API history limits and budget exhaustion still constrain coverage.

Published X main cards register seven-day conversation searches for attributed replies. You can also register a reviewed recent-search query with `source:add` and kind `x_search`, using a URL such as `https://api.x.com/2/tweets/search/recent?query=conversation_id%3A123456%20-is%3Aretweet`. Search cursors are independent of account cursors. Missing parent context still enters editorial review. Conversation searches do not provide exhaustive quote or reaction coverage.

`X_MONTHLY_READ_LIMIT` bounds conservative resource reservations across collection, search, and availability checks. Timeline and search pages reserve allowances for expanded resources before requests; failures keep their reservations. Discovery stops at 80 percent of the configured allowance, leaving 20 percent for checks. A separate hourly job checks up to five stored X posts, prioritizing those not checked in 24 hours. Explicit unavailable responses retract the display and purge retained text; confirmed text changes retract the old card and require editorial approval before publishing the new source excerpt. Generic request errors do not imply deletion. Check throughput and available credit limit recheck freshness. Keep the provider-side spending ceiling as the authoritative monetary guard.

Set `MODEL_MONTHLY_BUDGET_USD`, `MODEL_MONTHLY_REQUEST_LIMIT`, `JEV_REQUEST_BUDGET_USD`, and `LUNA_REQUEST_BUDGET_USD` in the worker. Each attempted provider call atomically reserves its configured allowance and a request before sending. Failed and ambiguous calls keep that reservation. `modelUsage` records provider, purpose, duration, returned token counts when available, and request ID. The per-request dollar values are operator-supplied conservative estimates, not provider pricing or measured charges. Configure provider-side monetary limits too. No call is admitted when its reservation would exceed the application budget. A provider's reported 429 delay is honored; permanent HTTP failures enter review without repeated automatic calls.

## Verification and performance

Run `bun test apps/core/src apps/worker/src` for unit tests. Integration suites run when `TEST_DATABASE_URL` points to a disposable local database named `recent_test`; Redis tests additionally require `TEST_REDIS_URL=redis://127.0.0.1:56379/13`. These suites truncate their test tables and create/delete isolated test queues. Never point them at application data. Apply migrations to that test database first.

`TEST_DATABASE_URL=postgres://.../recent_test bun run apps/worker/src/benchmark-stories.ts` compares the old candidate query with the indexed trigram predicate on 50,000 synthetic stories and rolls its fixture back. This is a reproducible local benchmark, not a production latency guarantee. Matching evaluates up to five candidates in one bounded provider request and holds ambiguous multi-match results for review.

JSON metrics cover cache outcomes and rebuild duration, provider requests and reservations, source collection and lag, pipeline execution and backlog age, task recovery, candidate lookup, availability checks, and outbox delivery. Database queries taking at least 100 ms emit a timing metric without SQL parameters. Feed and story reads use snapshot keyset pagination; story threads put the main card first. The web list unmounts distant groups of 20 cards while retaining measured scroll space and the fetched data needed for scrolling back.

### Production verification and operation

TypeSafe classification and matching use `@typesafe-ai/sdk` with typed question builders. SDK retries are disabled so each BullMQ retry reserves and records its own model attempt. Provider responses are still validated against the publication contracts.

Core validates connection protocols, ports, a 32-character minimum auth secret, paired OAuth credentials, and explicit HTTPS public origins in production. `/health` is liveness; `/ready` checks PostgreSQL. Redis is optional for feed availability. Requests carry correlation IDs, security headers, private cache policy, body-size limits, and duration metrics. Next.js server requests time out after 10 seconds; browser pagination after 15 seconds. Backend outages show a retry screen instead of being treated as signed-out sessions.

Database pools have connection and statement timeouts. Migrations disable the statement timeout for DDL, while retaining a short lock timeout so deployments fail rather than wait indefinitely on production locks. API and worker shutdowns drain active work with a 30-second deadline. Run workers with direct PostgreSQL connections or session pooling because ownership uses session advisory locks.

GitHub Actions installs the frozen lockfile, audits dependencies, checks types and lint, applies migrations to isolated PostgreSQL, runs unit and PostgreSQL/Redis integration tests, and builds the web app. The workflow still needs its first hosted run. Keep production backups and restore drills, TLS and restricted database/Redis access, outbound source-network restrictions, log retention, and metric alerts configured in the deployment environment. Live email/OAuth, X access and billing, model credentials, and deployment shutdown behavior require environment-specific acceptance checks before launch.
