# Recent architecture

Status: target architecture. Implemented behavior and operational instructions are tracked in [README.md](README.md). This document includes future capabilities and is not a completion checklist. See [SCHEMAS.md](SCHEMAS.md) for the target data model. Hosting and capacity choices remain open.

## Product contract

Recent is an English-language AI developments and discourse feed for a worldwide audience. It covers launches, incidents, research, policy, safety concerns, criticism, opinion, guides, and useful demonstrations. A story has a main card and can receive sourced update cards. Readers can scroll the feed and open a story thread. Reader posts, comments, reposts, and votes are out of scope for the first release.

X is a required discovery and reaction source, alongside official sites, blogs, releases, research feeds, video channels, and permitted community sources. The initial X API budget is $10 per month, separate from model and infrastructure spending. The founder's `@too_vinod` following list is a useful seed for a curated X account registry, not a claim that all 90 accounts are relevant or that the X "For you" feed can be replicated. The percentage of relevant AI material originating on X is a product hypothesis to measure, not a coverage guarantee. Collection is limited to permitted access methods. A ten-minute scheduler interval is a discovery target, not a guarantee that every source is polled or that every story is published within ten minutes.

Open-source code does not grant rights to republish third-party text or media. Store source links, attribution, publication time, and the minimum permitted text needed to process an item. Prefer links or permitted embeds for images and videos; do not rehost third-party media without rights.

## Components and ownership

| Component            | Responsibility                                                                                           | State                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `apps/web`           | Next.js App Router pages, server rendering, feed and thread UI, auth UI                                  | Exists                                |
| `apps/core`          | Bun/Hono HTTP API, Better Auth handler, validation, feed reads, administrative commands, queue producers | Exists as a minimal API               |
| `apps/worker`        | Separate Bun process running BullMQ consumers and scheduler registration                                 | Implemented                           |
| `packages/db`        | Kysely types, migrations, database access and transaction helpers                                        | Auth, feed, pipeline and editorial migrations exist |
| `packages/auth`      | Shared Better Auth server factory and browser client entry points                                        | Auth foundation exists                |
| `packages/email`     | Resend transactional email delivery                                                                      | Auth foundation exists                |
| `packages/queue`     | BullMQ queue names, payload schemas, producer helpers, connection policy                                 | Planned; shared by core and worker    |
| `packages/contracts` | Public feed and story response contracts shared by core and web                                          | Implemented for core and web           |
| `packages/ui`        | Shared React components                                                                                  | Exists                                |
| `apps/mobile`        | React Native reader client using the same core API                                                       | Planned, not part of first deployment |

Packages never import applications. Browser bundles never import database, Redis, queue, provider credentials, or server-only model clients. The core API owns product endpoints; Next.js route handlers are reserved for web-specific concerns. Auth and feed contracts must also work for a future mobile client.

## Proposed code layout

Create these directories as their components are implemented, not as empty scaffolding. The ingestion engine belongs to the worker because it has one runtime owner. The shared Better Auth configuration lives in `packages/auth`; core provides environment values and mounts its Hono handler. Server and browser exports are separate.

```text
apps/
  core/src/
    index.ts                 Bun entry point
    app.ts                   Hono registration and middleware
    modules/
      auth/                  auth.ts, auth.routes.ts, email.ts
      feed/                  feed.routes.ts, feed.schema.ts, feed.service.ts,
                             feed.query.ts, feed.cache.ts
      stories/               stories.routes.ts, stories.service.ts,
                             stories.query.ts
      admin/                 review, replay, correction, source control modules
    infrastructure/          config validation, logging, cache Redis client
  worker/src/
    main.ts                  process start, worker registration, graceful shutdown
    scheduler/              ten-minute dispatcher and source due-time selection
    jobs/                   collect.job.ts, normalize.job.ts,
                             classify.job.ts, match-story.job.ts,
                             generate-card.job.ts, publish.job.ts,
                             send-email.job.ts
    ingestion/
      sources/               source-adapter.ts, registry.ts, rss.ts,
                             github-releases.ts, sitemap.ts, video-feed.ts
      x/                     accounts.ts, timeline.ts, search.ts,
                             activity.ts, communities.ts, relationships.ts,
                             compliance.ts, budget.ts
      normalize/             canonical-url.ts, extract.ts, fingerprint.ts
      classify/              prefilter.ts, jev-classifier.ts, rubric.ts
      story-matching/        candidates.query.ts, rank.ts, decide.ts
      generation/            luna-generator.ts, card.schema.ts, validate.ts
      publication/           publish.service.ts, revision.service.ts
    recovery/                outbox-relay.ts, reconcile.ts, dead-letter.ts
    infrastructure/          provider clients, configuration, logging
  web/
    app/                     App Router pages and layouts
    features/feed/           feed data access and feature-specific components
    features/stories/        thread data access and feature-specific components
    features/auth/           sign-in screens and browser auth client
packages/
  db/src/
    schema/                  sources, pipeline, stories, posts, auth tables
    migrations/              generated and reviewed SQL migrations
    client.ts                Kysely connection setup
  auth/src/                server.ts and client.ts as separate exports
  email/src/               Resend transactional mailer
  queue/src/                 names.ts, job.schema.ts, producer.ts, connection.ts
  contracts/src/             feed.schema.ts, story.schema.ts when shared
  ui/src/                    reusable presentation components, not feed business rules
```

Keep files cohesive rather than enforcing a line-count rule or one function per file. A route validates and delegates; a service owns a use case and transaction; a repository or query module owns SQL; a job handler loads an ID and invokes one stage; a source adapter only knows its source protocol. Put pure normalization, ranking, and validation functions in small modules with fixtures and focused tests. Do not hide network calls or database writes inside pure-looking helpers.

The shared database package owns schema and migrations, not every business query. Feed queries stay with core's feed module; candidate-retrieval queries stay with the worker's story-matching module. The queue package owns transport contracts, not ingestion decisions. Feature-specific React components stay in `apps/web`; move only genuinely reusable presentation primitives to `packages/ui`. This prevents both giant files and a premature collection of single-consumer packages.

## Data flow

1. A single BullMQ job scheduler wakes every ten minutes and selects sources whose `next_poll_at` is due. It enqueues bounded source-specific collection jobs. Per-source cadence, concurrency, and backoff override the global tick.
2. Each adapter uses the source's approved interface. X collection is a required engine path using the official API. Other sources use RSS/Atom, official APIs, release feeds, or permitted HTML. X has account, search, relationship, compliance, and spend controls rather than an unrestricted scraping path.
3. Collection stores immutable provenance and a stable external identifier or canonical URL. Conditional HTTP requests, cursors, rate limits, and URL/content fingerprints avoid unnecessary fetches and model calls.
4. Normalization extracts title, author, timestamps, canonical URL, bounded text, media references, language, and entities. Exact duplicates and unsupported content are rejected before AI calls. Treat source text as untrusted data, never as instructions.
5. Cheap deterministic rules filter obvious off-topic items. Jev returns typed decisions for AI relevance, content type, topic, priority, and uncertainty. Types include reporting, incident update, opinion, criticism, guide, demonstration, analysis, and reaction. Persist the model version and decision. Negative or skeptical coverage is not penalized for its stance. A low-confidence result is held for review, not silently forced into a category.
6. Story matching retrieves a bounded candidate set with indexed entity, text, and time queries. It scores the candidates, then uses Jev for ambiguous same-event decisions. If no candidate passes a conservative threshold, create a new story. Never compare an item with every story in application memory.
7. Luna generates a short card from explicit source evidence. Structured output separates the card's feed role (`main` or `update`) from its content format (`report`, `opinion`, `guide`, `demonstration`, `analysis`, `incident`, or `correction`). Deterministic validation checks schema, factual support, attribution, quotation context, duplication, and publication policy. Opinions are attributed to their authors, not presented as settled facts. A failed check creates a review item.
8. A transaction publishes the card, its evidence, and a feed-change event. The cache projector invalidates affected feed and thread keys. The API only returns published cards.

These are distinct stages with versioned payloads. Reprocessing a stage after code or model changes creates a new decision or revision without losing original provenance.

## X discovery and reaction coverage

X is mandatory for the product, but API spend and rate limits still bound how much can be collected. The first account registry can be curated from public accounts followed by `@too_vinod`, either from a manual list or an approved API lookup after credentials and account-use decisions are made. It is Recent's editorial source list, not a live copy of a person's private feed. Never use browser-session scraping, private content, or an account's personalized feed as an undocumented back door.

The X adapter has three discovery paths:

1. Poll selected public account timelines incrementally using each account's `since_id` and a bounded page count. Give high-signal accounts shorter intervals; do not poll every account every scheduler tick.
2. When an active story has names, model versions, links, or a known X post ID, run narrow recent searches for new reactions, criticism, corrections, and context. Include voices outside the seed list when they add evidence or a materially different view. Search is event-driven and time-bounded, not a perpetual broad `AI` query.
3. Follow reply, quote, and referenced-post relationships only for high-value candidates. Fetch enough parent context to avoid misattributing a joke, criticism, or reply. Reposts are discovery signals, not automatic new cards. A post mentioning a model without making a substantive point is not an update.

Account-activity webhooks are a selective acceleration path, not the sole source of truth. Subscribe to `post.create` and `post.delete` for the few highest-signal public accounts if the developer plan, access, and event cost permit it. Deliveries enter a small authenticated core webhook endpoint, are validated and deduplicated, then enqueued; the HTTP handler does not classify or publish. Polling reconciles missed deliveries. Do not subscribe to every reply, quote, or repost event by default: event volume could consume the entire budget. X Activity is filtered by user ID, not by Community ID.

X Communities need a separate capability check. The documented Community Read endpoints retrieve or search Community metadata; they do not establish a Community-post timeline or a Community-wide new-post webhook. Store a curated set of public Community IDs as discovery context, and use only supported post search or stream capabilities that actually expose the relevant posts. If no permitted route exists for a Community, mark its coverage unavailable rather than scraping private or authenticated pages. Community Notes are a different product from X Communities and should not be conflated with them.

Normalize X IDs, author IDs, conversation IDs, reply/quote references, edit versions, publication time, and media metadata into structured fields. The same post may be discovered through multiple paths but becomes one source item. Advance cursors only after a page is durably persisted. Track account-level and search-level freshness, gaps, rate-limit resets, and read spend. Prioritize original statements, incident reports, and diverse substantive reactions over engagement counts; popularity is not evidence of truth.

The official X API offers user-post timelines, recent search, and a reverse-chronological authenticated home timeline; that home endpoint excludes algorithmic ranking. The screenshots of a personalized "For you" feed therefore inform editorial coverage, not an API contract. X charges for returned resources and delivered activity events, so enforce a $10 monthly cap with daily, per-source, and per-story reservations before requests or subscriptions. Configure the same $10 ceiling in the X Developer Console, disable automatic recharge, reconcile the provider's usage against our ledger, and stop optional expansion before mandatory account monitoring when the cap is near. A source outage or exhausted credit pauses new X discovery while already published Recent content remains readable.

At the documented $0.005 per Post read, $10 buys at most about 2,000 Post resources if spent on nothing else. User, follows, Community metadata, and activity events also consume credit, so the real Post count is lower. Roughly 90 accounts each yielding one paid new Post daily would already be about 2,700 Post reads in a 30-day month, before reactions or search. Therefore monitor a small high-signal tier frequently, rotate the long tail less often, and trigger narrow searches only for active stories. Track unique useful items per dollar and drop low-yield sources. The goal is strong editorial coverage, not a false promise of exhaustive X capture.

If an X post is deleted, protected, withheld, or edited, the compliance job must recheck stored X references and remove or revise affected display and generated cards under X's policy. Display current source attribution and link to the original post. Do not export X post objects as an open-source dataset. For X-hosted images and video, prefer a permitted embed or source link; a thumbnail or post text alone is not evidence of what a video demonstrates. A transcript or direct review is needed before summarizing video content.

## Open-web and channel collection

The rest of the internet is a first-class discovery lane, not merely corroboration for X. The source registry should cover official model and product changelogs, engineering and research blogs, GitHub release feeds, paper repositories, security and service-status feeds, AI-focused publications, event pages, newsletters with permitted feeds, and public video-channel feeds or APIs. Sources are configured individually with provenance, update cadence, access terms, language, quality tier, and parser type. The registry is curated and expandable; no crawler can literally capture everything on the internet.

Build for a large and growing intake. Split collection into discovery, fetch, extraction, and editorial processing queues so a flood of links does not block publication or auth email. Discovery records cheap metadata for every eligible candidate; a priority score selects which changed pages get a full fetch; deduplication and relevance prefilters select which items reach Jev; only evidence-backed, materially new items reach Luna. Keep rejected-item counts and reason codes so the engine's recall can be audited. The collection target is broad coverage, while publication is deliberately selective.

Prefer RSS/Atom, official APIs, release feeds, sitemaps, and conditional HTTP fetches. Use permitted page extraction only where no feed exists, honoring robots directives, access terms, `Retry-After`, and source-specific rate limits. Discover links through official feeds and credible citations, then fetch only new or changed canonical URLs. Avoid crawling entire domains, rendering every page in a browser, or repeatedly downloading unchanged media. For videos, ingest title, description, publication time, channel, and source URL first; only summarize spoken or visual content when a permitted transcript or direct review exists. Failed or blocked sources produce a visible freshness gap, not invented coverage.

Deduplicate by source identifier, canonical URL, content fingerprint, and cross-source story evidence before any model call. Prioritize primary sources, consequential incidents, strong counterarguments, and genuinely new details. Use a bounded crawl frontier and per-domain concurrency to prevent a single prolific site from starving the queue. Record fetch success, change rate, useful-item yield, parser failures, and last-seen time per source. Add adapters based on measured coverage gaps, not raw source count.

Scale by adding source-specific collectors and worker concurrency under global and per-domain limits. Partition queues by stage and priority, not one queue per website. Keep discovery cursors durable, use leases so multiple workers do not fetch the same target, and shed low-priority work when lag grows while preserving high-priority incident and correction paths. Instrument candidates discovered, pages fetched, useful items classified, stories published, p95 discovery-to-publication lag, and cost per useful story. Increase crawl breadth only when these measures show the system can keep up.

## Story identity and thread rules

A story is a bounded, coherent subject: a release, outage, research result, safety debate, public argument, guide, or demonstrated workflow. It is not an indefinitely growing bucket for a model name or a person. "A model was released" and "a later version was released" are separate stories even if they share entities. A source item can support more than one story, but it has one primary match decision for its processing run. A story has one main card; later cards have distinct roles and formats. Related but independently useful subjects get separate stories connected by a story relation.

Candidate retrieval uses indexed X conversation, reply, quote, and linked URL identifiers when available, then normalized entities and full-text similarity within a bounded time window. Rank at most a configured top K, initially 50. The final decision distinguishes `same_story`, `related_story`, and `new_story`, considering subject, claim, actors, version, date, and conversation context. Same author, shared keyword, or shared model name alone is insufficient. Thresholds are calibrated against labeled examples. An uncertain match enters review; creating two linked stories is safer than merging unrelated subjects. A later merge or split is an audited editorial action, not an invisible rewrite.

The initial candidate search should use PostgreSQL B-tree and GIN indexes, not linear scans or `Array.find` over all stories. Keep the query bounded and inspect `EXPLAIN ANALYZE` against realistic data. Use an additional search service or vector index only when measured recall or latency justifies it. Model choice and scoring weights are versioned and replaceable without changing story and post IDs.

The main card appears in the feed and anchors the thread. Each meaningful update may also appear in the feed with a clear link to its parent story. The thread page always presents the main card first and updates in publication order. Multiple articles repeating the same fact strengthen evidence; they do not automatically create more cards.

The supplied screenshots are design examples, not a verified news dataset:

| Example                                                    | Story treatment                                                                                                                                                               |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DHH's statement about hand-written code                    | An attributed public-argument or opinion main card, with substantive responses as updates. Other DHH posts do not join just because he authored them.                         |
| Theo's Opus 5.5 guide and usage comments                   | A guide can update the Opus 5.5 release thread if directly tied to it, or become a separately linked guide story if it stands on its own. Usage praise is attributed opinion. |
| An ex-Apple developer's agentic workflow video shared on X | A demonstration story if its actual content can be checked; otherwise describe only the sharer's claim and link to the original video.                                        |
| A Codex outage and restoration posts                       | An incident main card, followed by official status and resolution updates; user reports and criticism are clearly labeled as such.                                            |
| Disagreement about the pace or safety of frontier models   | A debate story with attributed positions and counterarguments, not a fabricated consensus or a positive-only news filter.                                                     |

## Queue and failure model

BullMQ uses Redis as its queue backend. The API may enqueue administrative work but does not scrape or process long-running jobs in an HTTP request. The worker is a separate Bun process. Queue payloads contain IDs and a schema version, not article bodies, secrets, or personal data.

Each stage has a persistent task record with `pending`, `processing`, `failed`, `completed`, or `dead_lettered` status. `failed` means an attempt failed and may be retried; `dead_lettered` means automatic retries are exhausted or the error is permanent. BullMQ's waiting, active, delayed, completed, and failed sets are transport state, not the only audit trail. A dedicated dead-letter queue receives terminal failures with the task ID, stage, error class, and replay instructions. Replay is an explicit audited action.

Use bounded attempts and exponential backoff with jitter for transient failures. Respect `Retry-After` for source and provider `429` responses. Do not retry invalid input or prohibited access. Set per-source and per-provider concurrency limits and a global model-spend ceiling. Record queue age, attempts, failures, dead letters, source lag, and model cost. Workers shut down gracefully and tolerate redelivery.

Use deterministic BullMQ job IDs for duplicate enqueue protection, database uniqueness constraints for durable idempotency, and an outbox row in the same transaction as each state transition that must enqueue another job. An outbox relay publishes jobs and marks rows delivered; a reconciler repairs stranded tasks after crashes or Redis data loss. BullMQ provides at-least-once execution in practice, so every handler must be safe to repeat. The database is authoritative for content state.

Redis used for BullMQ requires persistence and `noeviction`. Cache entries are disposable and need a different eviction policy. Use separate Redis instances or services for queue and cache, not just separate Redis database numbers on one instance. The physical deployment is a hosting decision, but these configurations must remain isolated.

## Read path and cache

PostgreSQL is authoritative. Cache only published public content: the first feed page, bounded later pages when useful, and thread views. Authentication/session checks, private account data, and unpublished content are never served from a shared public cache. If launch requires sign-in before reading, authenticate first and then reuse the same public content cache across readers.

Use keyset pagination on `(published_at, id)` with a stable feed snapshot or watermark so newly published cards do not duplicate or shift entries while a reader scrolls. The refresh control requests a new first page and watermark; it does not bypass all server caching or trigger ingestion.

Cache-aside behavior for popular keys:

1. Return a fresh cached value immediately.
2. When fresh TTL expires, serve a bounded stale value and let one caller rebuild it. Acquire a per-key Redis lock with `SET key token NX PX ttl`; release only if the token still matches. Add TTL jitter to avoid synchronized expiration.
3. If there is no stale value, wait briefly for the lock holder. Bound database rebuild concurrency and response wait time. A failure should degrade predictably, not launch an unbounded database herd.
4. Publishing, correcting, merging, or unpublishing advances a feed or story cache generation through a transactional outbox event. Old keys expire. The projector is retried and reconciled because a PostgreSQL transaction cannot atomically update Redis.

Initial freshness targets, subject to measurement: first feed page 15-30 seconds; active thread 30-60 seconds; older cursor pages several minutes. A safety takedown bypasses normal stale serving for the affected card or story. Track hit rate, stale age, lock contention, rebuild duration, and PostgreSQL read load. Avoid a per-user cache key until personalization is real.

## Authentication and email

Better Auth owns Google and X OAuth, email/password, sessions, verification, and password reset through the Hono API. Resend sends transactional mail. Email verification and password reset use OTP codes. OAuth sign-in does not require an extra OTP by default. Store OTPs securely, limit attempts and resends, prevent account enumeration, and use idempotency keys for retried sends. Auth email jobs need a separate high-priority queue or isolation from slow ingestion work so a news backlog cannot delay login.

The launch decision about guest reading versus required sign-in remains open. It does not change the public-content cache model. Future likes or dislikes require a separate schema and write path; do not build a vote system prematurely.

## Release and quality gates

- Fixture-based tests for each source adapter and normalization edge cases.
- Labeled evaluation sets for relevance and story matching, including negative coverage, opinion, guides, demonstrations, incidents, hard negatives, duplicate reports, follow-up releases, and opposing reactions.
- X adapter tests for account cursor recovery, search pagination, reply/quote context, cost-cap behavior, edits, deletions, and protected-content takedown.
- Property and integration tests for idempotency, outbox recovery, retries, dead-letter replay, concurrent publishing, cache stampede control, and cache invalidation.
- Load tests for feed pagination and popular thread reads, with query plans checked against production-shaped data.
- Metrics and alerts for source freshness, pipeline lag, queue age, dead letters, publication rejection rate, model cost, and cache hit rate.
- A source and model kill switch, spend caps, and an audited unpublish/correction path before auto-publishing is enabled.

Implementation order after this design is approved: database migrations and constraints, auth, source registry and adapters, queue and worker, classification and story matching, generation and publication, feed API and cache, then web UI and operational tests. Each component is verified before moving to the next.

## Implementation references

- [BullMQ connections and Bun Redis adapter](https://docs.bullmq.io/guide/connections)
- [BullMQ job schedulers](https://docs.bullmq.io/guide/job-schedulers/)
- [BullMQ retries](https://docs.bullmq.io/guide/retrying-failing-jobs)
- [BullMQ production persistence and eviction policy](https://docs.bullmq.io/guide/going-to-production)
- [Redis single-instance lock pattern](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/)
- [Better Auth Hono integration](https://better-auth.com/docs/integrations/hono)
- [Better Auth email OTP](https://better-auth.com/docs/plugins/email-otp)
- [X user timelines](https://docs.x.com/x-api/posts/timelines/introduction)
- [X recent search](https://docs.x.com/x-api/posts/search/introduction)
- [X follows lookup](https://docs.x.com/x-api/users/follows/introduction)
- [X API pricing](https://docs.x.com/x-api/getting-started/pricing)
- [X Activity events and delivery](https://docs.x.com/x-api/activity/introduction)
- [X Communities lookup](https://docs.x.com/x-api/communities/lookup/introduction)
- [X Communities search](https://docs.x.com/x-api/communities/search/introduction)
- [X developer policy](https://docs.x.com/developer-terms/policy)
