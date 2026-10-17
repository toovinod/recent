# Operations

Apply migrations before starting the updated applications. Migration `005_reliability` adds recovery scheduling, X crawl state, editorial audit records, post revisions, and model accounting. It enforces one primary story assignment per source item; if existing data violates that invariant, resolve those assignments before migrating. Do not delete evidence to make a migration pass.

## Task recovery

Task execution holds PostgreSQL advisory locks on a dedicated connection for the task and source item. Story matching also takes a cross-process matching lock. Provider calls do not hold an open SQL transaction. A process exit releases ownership; the reconciler checks unfinished tasks every 30 seconds and restores work idle for at least one minute. Attempts remain in PostgreSQL across queue loss. Four unsuccessful execution claims send a task to review. Terminal BullMQ jobs are removed before explicit replay, and the recurring dispatcher is recreated after Redis loss. These locks require a direct PostgreSQL connection or session pooling, not transaction pooling.

## Cache rebuilds

The cache coalesces same-key requests within an API process and uses a renewable Redis lock across processes. After invalidation, one caller rebuilds a generation and waiting readers share the cached result. Cold readers wait up to 15 seconds without starting competing database queries. Redis failures use local request coalescing with at most four concurrent rebuilds and 100 queued distinct-key rebuilds per API process. During a Redis outage, each API process enforces its own limit. Cache writes cannot replace a newer generation. Publication invalidation projects absolute PostgreSQL generation numbers rather than incrementing a disposable counter.

## Editorial actions

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

## Model spending

Set `MODEL_MONTHLY_BUDGET_USD`, `MODEL_MONTHLY_REQUEST_LIMIT`, `JEV_REQUEST_BUDGET_USD`, and `LUNA_REQUEST_BUDGET_USD` in the worker. Each attempted provider call atomically reserves its configured allowance and a request before sending. Failed and ambiguous calls keep that reservation. `modelUsage` records provider, purpose, duration, returned token counts when available, and request ID. The per-request dollar values are operator-supplied conservative estimates, not provider pricing or measured charges. Configure provider-side monetary limits too. No call is admitted when its reservation would exceed the application budget. A provider's reported 429 delay is honored; permanent HTTP failures enter review without repeated automatic calls.

## Verification and performance

Run `bun test apps/core/src apps/worker/src` for unit tests. Integration suites run when `TEST_DATABASE_URL` points to a disposable local database named `recent_test`; Redis tests additionally require `TEST_REDIS_URL=redis://127.0.0.1:56379/13`. These suites truncate their test tables and create/delete isolated test queues. Never point them at application data. Apply migrations to that test database first.

`TEST_DATABASE_URL=postgres://.../recent_test bun run apps/worker/src/benchmark-stories.ts` compares the old candidate query with the indexed trigram predicate on 50,000 synthetic stories and rolls its fixture back. This is a reproducible local benchmark, not a production latency guarantee. Matching evaluates up to five candidates in one bounded provider request and holds ambiguous multi-match results for review.

JSON metrics cover cache outcomes and rebuild duration, provider requests and reservations, source collection and lag, pipeline execution and backlog age, task recovery, candidate lookup, availability checks, and outbox delivery. Database queries taking at least 100 ms emit a timing metric without SQL parameters. Feed and story reads use snapshot keyset pagination; story threads put the main card first. The web list unmounts distant groups of 20 cards while retaining measured scroll space and the fetched data needed for scrolling back.

