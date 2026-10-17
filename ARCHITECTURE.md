# Architecture

Recent collects reviewed sources and publishes short, attributed AI updates in story threads. Readers authenticate to read the feed. They do not create posts, comments, or reposts.

This document describes the checked-in implementation. Database definitions live in [Kysely types](packages/db/src/schema.ts) and [versioned migrations](packages/db/src/migrations). Public response contracts live in [packages/contracts](packages/contracts/src/index.ts).

## Ownership

| Workspace | Responsibility |
| --- | --- |
| `apps/web` | Next.js pages, server rendering, authentication UI, feed and story interactions |
| `apps/core` | Hono HTTP API, session checks, feed reads, editorial endpoints, configuration |
| `apps/worker` | Source polling, classification, story matching, publication, recovery, and provider budgets |
| `packages/db` | Kysely types, migrations, connection policy, transactional publication helpers |
| `packages/auth` | Better Auth server factory, browser client, and password policy |
| `packages/contracts` | Zod response schemas shared by core and web |
| `packages/email` | Resend delivery of authentication emails |
| `packages/ui` | Shared UI components |
| `packages/typescript-config` | Workspace TypeScript configuration |

Applications can import packages. Packages do not import applications. Server and browser auth exports are separate. Database, Redis, email, and model credentials stay outside browser bundles.

## Reading

Web forwards session cookies to core for server-rendered requests. Core owns Better Auth endpoints, checks reader sessions, and returns validated feed or story responses. Feed reads use snapshot keyset pagination. Story threads put the main card first and paginate later cards.

Core caches published reads in Redis. Same-key calls share one rebuild within a process; a renewable Redis lock coordinates API processes. Publication advances durable generation numbers in PostgreSQL and projects them to Redis through the outbox. A rebuild cannot overwrite a newer generation. Redis outages fall back to locally coalesced, bounded database reads. That fallback limit is per API process.

The browser loads more pages as the reader scrolls. It unmounts distant card groups and preserves their measured space; fetched card data remains in memory for scrolling back. Server requests and browser pagination have timeouts and explicit error states.

## Ingestion

1. A recurring BullMQ control job checks due sources every minute.
2. The collector fetches RSS, Atom, X timelines, or reviewed X recent searches. It normalizes URLs and persists source identity, provenance, and continuation state together.
3. A durable `pipelineTask` advances through classification, matching, and publication. PostgreSQL outbox events dispatch work to BullMQ.
4. TypeSafe classifies relevance and content type. Matching checks up to five title candidates through the official TypeSafe SDK.
5. Publication uses source text, selecting a traceable excerpt through the OpenAI API when needed. Published content retains links and attribution.
6. Uncertain decisions and terminal failures enter editorial review.

The CLI enables registered sources. RSS and Atom default to 15-minute polling; X sources default to two hours. A scheduler tick is not a freshness or coverage guarantee. X pagination keeps the previous high-water mark until the complete walk is persisted. Searches and availability rechecks share bounded read reservations.

## Durable state and recovery

PostgreSQL is authoritative for sources, cursors, tasks, classifications, story assignments, posts, revisions, model usage, budgets, and outbox delivery. Queue Redis is transport state; cache Redis is disposable.

Workers acquire session advisory locks for each task and source item. Matching uses a cross-process lock to serialize story creation. Provider calls do not hold an open SQL transaction. These locks need direct database connections or session pooling.

The reconciler checks unfinished tasks every 30 seconds, skips live owners, and restores work idle for at least one minute. Attempt counts survive queue loss. Four execution claims without completion send work to review. Queue transport remains at-least-once; locks, database constraints, and transactional side effects prevent duplicate committed publication. A process failure after a provider accepts a request can still cause another paid request on retry.

## Editorial changes

Core restricts editorial endpoints to session users listed in `ADMIN_USER_IDS`. Approval, rejection, replay, correction, and retraction record an actor and reason. Revision history uses chronological, resource-scoped cursors. Corrections must match current source evidence and preserve publication time. Retractions remove cards from published reads.

X availability checks can retract content and purge retained text. Confirmed edits require review before republishing. A dedicated editor dashboard is not implemented; the API is documented in [operations](docs/operations.md).

## Security and operations

Core validates configuration, limits request bodies, returns private cache headers, and emits request IDs and timing metrics. Better Auth owns session and auth rate-limit behavior. Worker reservations bound model requests and estimated spend before calls. Provider-side billing controls remain necessary.

Web, core, and worker run separately. Core and worker drain work on shutdown with a 30-second deadline. `/health` checks liveness; `/ready` checks PostgreSQL. Deployment networking, TLS, backups, logs, and alert delivery are operator responsibilities.

A mobile app, general HTML crawling, and additional source adapters are not implemented. See [development](docs/development.md), [self-hosting](docs/deployment.md), and [operations](docs/operations.md) for commands and current limits.
