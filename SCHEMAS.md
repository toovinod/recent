# Recent data model

Status: target ingestion and publication schema for review. Kysely migrations in `packages/db` implement a smaller first slice for Better Auth, feeds, X account timelines, classification, stories, posts, and cache invalidation. The fuller tables below remain proposals. See [ARCHITECTURE.md](ARCHITECTURE.md) for processing and cache behavior.

## Conventions

- Use UUID or time-sortable IDs consistently. Do not derive identity from a mutable title or URL slug.
- Store timestamps as `timestamptz` in UTC. Preserve source-provided publication time separately from discovery and Recent publication time.
- Use `text` plus database `CHECK` constraints for stable state values, with matching Zod schemas at API and job boundaries. Keep state transitions in application services, not scattered route handlers.
- Use explicit foreign keys, unique constraints, and indexes for every feed and worker access path. Add indexes from measured queries, not every column.
- Store provider credentials in secrets, never in database rows or job payloads. Keep retained source text within the source's permissions and retention policy.
- Published cards are immutable to readers. Corrections create revisions and an audit entry; internal status may change for takedowns.

## Source and collection tables

### `sources`

One configured source or source endpoint. Fields: `id`, `name`, `kind` (`rss`, `atom`, `api`, `html`, `sitemap`, `release_feed`, `video_channel`, `x_account`, `x_search`), `base_url`, `access_method`, `enabled`, `poll_interval_seconds`, `next_poll_at`, `priority`, `rate_limit_policy`, `content_retention_policy`, `created_at`, `updated_at`. An X account or narrow search is a separate source with its own budget and cursor. A provider-specific key may be stored, but not a credential.

Indexes: unique `(kind, base_url)` after URL normalization; partial `(next_poll_at, id)` where `enabled = true` for due-source selection. Keep per-source cursor, ETag, and Last-Modified values in `source_cursors` so configuration and mutable polling state have separate ownership.

### `source_cursors`

Fields: `source_id` primary key and foreign key, `cursor`, `etag`, `last_modified`, `last_success_at`, `consecutive_failures`, `updated_at`. Update only after a collection run has safely persisted its discovered items. A failed run must not advance the cursor.

### `source_runs`

Fields: `id`, `source_id`, `started_at`, `finished_at`, `status`, `items_seen`, `items_new`, `http_status`, `error_code`, `next_retry_at`. Index `(source_id, started_at DESC)` for debugging and freshness metrics. Retain summaries longer than verbose logs.

### `discovery_candidates`

Cheap, bounded crawl frontier for eligible links and feed entries before a full fetch. Fields: `id`, `source_id`, `external_id` nullable, `canonical_url`, `canonical_url_hash`, `discovered_at`, `source_published_at` nullable, `title_hint` nullable, `priority_score`, `status` (`pending`, `leased`, `fetched`, `skipped`, `failed`), `reason_code` nullable, `next_attempt_at`, `lease_expires_at`, `attempt_count`, `source_item_id` nullable. Unique `(source_id, canonical_url_hash)` with a separate external-ID uniqueness rule when present; index `(status, priority_score DESC, next_attempt_at, id)` for bounded claiming and `(source_id, discovered_at DESC)` for yield analysis. Merge duplicate discoveries rather than enqueueing duplicate fetches. Expire rejected candidate metadata under a documented retention policy.

### `source_items`

The stable identity and provenance of one external item. Fields: `id`, `source_id`, `external_id` nullable, `original_url`, `canonical_url`, `canonical_url_hash`, `title`, `author_name`, `author_url`, `published_at`, `discovered_at`, `language`, `content_excerpt`, `content_hash`, `media_metadata` JSONB, `raw_metadata` JSONB, `retention_until`, `availability` (`available`, `edited`, `deleted`, `protected`, `withheld`), `created_at`, `updated_at`. Identity stays stable while content and availability can change. Store permitted prior content versions only as long as source policy allows; removals must propagate to generated cards.

Constraints and indexes: unique `(source_id, external_id)` where `external_id IS NOT NULL`; unique `(source_id, canonical_url_hash)`; index `(source_id, published_at DESC)`; index `(content_hash)` to find probable cross-source duplicates. A hash collision is checked against the canonical value before merging. Do not enforce global uniqueness on content hash, because independent sources are valuable corroboration.

`raw_metadata` is bounded and validated. Full article bodies are not retained by default. A media entry records origin URL, type, rights/embedding status, and dimensions or duration where known; it is not a license to copy the asset.

### `source_item_discoveries`

Records every path that found an item without storing it twice. Fields: `source_item_id`, `source_id`, `first_seen_at`, `last_seen_at`. Primary key `(source_item_id, source_id)`; index `(source_id, last_seen_at DESC)`. A post found through an X account timeline, a story search, and a quote lookup has one `source_items` row and three discovery links. `source_items.source_id` is the first discovery source, not an ownership claim.

### `x_accounts`

Curated public-account registry seeded from an approved manual list or a permitted lookup of `@too_vinod` follows. Fields: `x_user_id` primary key, `current_handle`, `display_name`, `priority`, `enabled`, `last_verified_at`, `created_at`, `updated_at`. The stable user ID, not a mutable handle, identifies an account. Following an account does not imply editorial endorsement or that every post is relevant. Index `(enabled, priority DESC, x_user_id)` for scheduling.

### `x_communities`

Curated public Community metadata, not a promise that member posts or a Community-post timeline can be read. Fields: `x_community_id` primary key, `name`, `description` nullable, `enabled`, `priority`, `last_verified_at`, `coverage_status` (`metadata_only`, `post_discovery_available`, `unavailable`), `created_at`, `updated_at`. A Community ID can be attached to a source item when the API supplies it. Do not create a collection cursor or webhook subscription for a Community until a permitted post-discovery mechanism is verified.

### `x_posts`

X-specific relationship and compliance data for a `source_items` row. Fields: `source_item_id` primary key and foreign key, `x_post_id`, `author_x_user_id`, `community_id` nullable, `conversation_id`, `in_reply_to_post_id` nullable, `quoted_post_id` nullable, `reposted_post_id` nullable, `edit_history_ids` JSONB, `last_checked_at`, `created_at`, `updated_at`. Unique `x_post_id`; indexes `(author_x_user_id, x_post_id DESC)`, `(community_id, x_post_id DESC)`, `(conversation_id, x_post_id DESC)`, `(in_reply_to_post_id)`, `(quoted_post_id)`, and `(last_checked_at)` for compliance checks. IDs are strings, not JavaScript numbers. References can point to posts not stored locally; fetch them only when context is needed and budget permits. Never infer full conversation or quote coverage from these references.

### `x_activity_subscriptions` and `x_webhook_deliveries`

Subscriptions record the external subscription ID, filtered `x_user_id`, event type, webhook ID, status, expiration if any, and last reconciliation time. Unique `(x_user_id, event_type)` for active subscriptions. Deliveries record provider event ID or a deterministic payload digest, event type, received time, processing status, and linked source item when known. Unique event identity prevents duplicate processing when delivery repeats; provider billing is reconciled separately. Retain only the minimum payload permitted by X. The webhook receiver authenticates the request, persists its identity, and enqueues processing; polling reconciles missed events. There is no Community-wide webhook in this design.

### `x_api_usage`

Per-request or delivered-event spend ledger for budget enforcement and reconciliation. Fields: `id`, `request_key`, `usage_kind` (`post_read`, `user_read`, `follow_read`, `community_read`, `activity_event`, `other`), `endpoint`, `source_id` nullable, `story_id` nullable, `requested_at`, `resource_count`, `estimated_cost_usd`, `reported_cost_usd` nullable, `status`. Unique `request_key`; indexes `(requested_at)` and `(source_id, requested_at DESC)`. Reserve an estimated cost before a read request and settle it from the response or provider usage. Activity events arrive without a per-event preflight, so cap active subscriptions using measured event volume and the provider-side spend limit; reconcile delivered-event charges afterward. The approved X ceiling is $10 monthly across all resource and event types, not $10 for Posts alone. Daily, per-source, and per-story caps use this ledger plus a short-lived atomic Redis counter; Redis alone is not the accounting source of truth.

## Processing and model audit tables

### `pipeline_tasks`

One durable execution record per source item, stage, stage version, and input digest. Fields: `id`, `source_item_id` nullable for source-level tasks, `source_run_id` nullable, `stage`, `stage_version`, `input_hash`, `status` (`pending`, `processing`, `failed`, `completed`, `dead_lettered`), `attempt_count`, `max_attempts`, `next_retry_at`, `lease_expires_at`, `bullmq_job_id`, `last_error_code`, `last_error_summary`, `created_at`, `started_at`, `finished_at`.

Unique `(source_item_id, stage, stage_version, input_hash)` for item tasks, with a separate source-run key for collection tasks. Index `(status, next_retry_at)` for reconciliation and `(source_item_id, stage)` for an item's progress. An input or upstream decision change can create a new task without overwriting the old run. A retry can move `failed` back to `pending`; only `dead_lettered` requires explicit replay. `pipeline_attempts` records each attempt's start, finish, outcome, and error class without overwriting history. BullMQ state is not substituted for this audit record.

### `outbox_events`

Fields: `id`, `event_type`, `aggregate_type`, `aggregate_id`, `payload_version`, `payload` JSONB containing IDs only, `created_at`, `enqueued_at`, `attempt_count`, `last_error`. Insert in the same PostgreSQL transaction as the stage transition or publication. Index `(created_at, id)` where `enqueued_at IS NULL`. The relay uses `FOR UPDATE SKIP LOCKED`; consumers still deduplicate because a relay may enqueue twice after a crash. A reconciler scans stranded tasks and outbox events.

### `classification_decisions`

Fields: `id`, `source_item_id`, `model_provider`, `model_name`, `model_version`, `rubric_version`, `relevant`, `content_type` (`report`, `incident_update`, `opinion`, `criticism`, `guide`, `demonstration`, `analysis`, `reaction`), `topic`, `priority_score`, `confidence`, `decision_json`, `input_hash`, `created_at`. `decision_json` may hold a target-specific stance (`supports`, `opposes`, `mixed`, `unclear`), but a negative view must not reduce relevance. Index `(source_item_id, created_at DESC)`. Keep decisions append-only so changing a rubric does not erase earlier reasoning. Store model input/output token counts and reported cost in `model_usage`, not the full prompt unless retention policy permits it.

### `model_usage`

Fields: `id`, `provider`, `model`, `purpose`, `source_item_id` nullable, `story_id` nullable, `input_tokens`, `output_tokens`, `reported_cost_usd`, `request_id`, `status`, `created_at`. Index `(provider, created_at DESC)` and `(purpose, created_at DESC)` for budget enforcement and reconciliation. A hard application budget is checked before expensive calls; provider-side caps are a second boundary.

## Story and publication tables

### `stories`

One bounded subject, not a permanent bucket for a person or model. Fields: `id`, `canonical_title`, `summary`, `status` (`candidate`, `active`, `merged`, `retracted`), `story_kind` (`release`, `incident`, `discourse`, `guide`, `demonstration`, `research`, `policy`, `other`), `subject_key` nullable, `anchor_at`, `first_seen_at`, `last_updated_at`, `main_post_id` nullable, `merged_into_story_id` nullable, `match_version`, `created_at`, `updated_at`. A DHH argument, a Codex outage, and an Opus guide may each be a story. A model name by itself is not a `subject_key`.

Constraints: a merged story points to another story, never itself; `main_post_id` must belong to this story, enforced in the service transaction and integration tests if a composite foreign key is impractical. Index `(status, last_updated_at DESC, id DESC)`. Do not use the title as a unique key.

### `story_entities`

Normalized candidate-retrieval keys: `story_id`, `entity_type`, `entity_key`, `display_name`, `created_at`. Unique `(story_id, entity_type, entity_key)`; index `(entity_type, entity_key, story_id)`. Examples include organization, product, model, version, and person. This narrows matching before model evaluation.

### `story_relations`

Connect separately useful stories without merging them. Fields: `from_story_id`, `to_story_id`, `relation` (`follows`, `context_for`, `responds_to`, `related`), `created_at`. Primary key `(from_story_id, to_story_id, relation)`; index `(to_story_id, from_story_id)`. The service rejects self-links and duplicate inverse links for symmetric `related`. A guide about a released model can link to its release story while retaining its own main card.

### `story_items`

Links source evidence to stories. Fields: `story_id`, `source_item_id`, `relationship` (`primary`, `corroboration`, `reaction`, `criticism`, `analysis`, `guide`, `demonstration`, `incident_update`, `correction`), `match_score`, `match_method`, `match_version`, `created_at`. Primary key `(story_id, source_item_id)`; index `(source_item_id, story_id)`. A source item may support multiple stories, but repeated processing must not create repeated links. A post is not an update merely because it shares an author, keyword, or model name.

### `story_match_decisions`

Audit of candidate selection: `id`, `source_item_id`, `candidate_story_id` nullable, `decision` (`same_story`, `related_story`, `new_story`, `review`), `score`, `method_version`, `reason_code`, `created_at`. Index `(source_item_id, created_at DESC)`. Record the winning decision and material rejected candidates; do not persist an unbounded candidate list.

### `posts`

One visible feed card. Fields: `id`, `story_id`, `role` (`main`, `update`), `format` (`report`, `opinion`, `guide`, `demonstration`, `analysis`, `incident`, `correction`), `status` (`draft`, `review`, `published`, `retracted`), `current_revision_id`, `published_at` nullable, `created_at`, `updated_at`. Role describes position in a thread; format describes content. A public opinion or incident can be the main card. The body is in `post_revisions` so corrections preserve history.

Constraints and indexes: unique `story_id` where `role = 'main'`; partial feed index `(published_at DESC, id DESC)` where `status = 'published'`; thread index `(story_id, published_at ASC, id ASC)` where `status = 'published'`. A publish transaction assigns `published_at` once and never changes it during a text correction. Pagination uses the feed index and a stable snapshot watermark.

### `post_revisions`

Fields: `id`, `post_id`, `revision_number`, `headline`, `body`, `attribution_text`, `generation_model`, `prompt_version`, `validation_version`, `change_reason`, `created_at`, `approved_at`. Unique `(post_id, revision_number)`. Keep the text short and source-grounded. `current_revision_id` changes only in a validated transaction. Revision history is not an exemption from source-deletion rules; purge or redact retained X-derived text when policy requires it, while keeping non-content audit metadata.

### `post_evidence`

Claim-level source mapping: `id`, `post_revision_id`, `source_item_id`, `claim_text`, `evidence_pointer` nullable, `evidence_kind`, `created_at`. Index `(post_revision_id)` and `(source_item_id)`. Every factual claim or attributed reaction in a published revision must have supporting rows. Quotes require a source span or direct source reference; model-generated quotations are prohibited.

### `publication_events`

Append-only audit: `id`, `post_id`, `story_id`, `action` (`publish`, `correct`, `retract`, `merge`, `split`), `actor_type` (`system`, `editor`), `actor_id` nullable, `reason`, `created_at`. Index `(story_id, created_at DESC)`. Auto-publication records the model and validation versions through the associated revision and decisions.

### `review_items`

Fields: `id`, `source_item_id` nullable, `story_id` nullable, `post_id` nullable, `reason_code`, `status` (`open`, `approved`, `rejected`, `resolved`), `priority`, `assigned_to` nullable, `created_at`, `resolved_at`. Index `(status, priority DESC, created_at)`. Review is for uncertain or unsafe cases; it is not required for every card.

## Auth, cache, and future writes

Better Auth owns its user, account, session, verification, and database rate-limit tables. The first Kysely migration creates them. Configure Google and X OAuth plus email/password and email OTP verification and reset. Resend is a delivery service, not an account database. Do not design a separate password or OTP table unless Better Auth's supported configuration requires it. Add only app-owned fields to a separate `reader_profiles` table when actual preferences are introduced.

Redis cache is disposable and has no PostgreSQL table mirroring every key. Feed and story generation numbers can be kept in a small `cache_generations` table or publication sequence so outbox replay reconstructs invalidation after Redis loss. A cache value includes its generation, fresh-until time, stale-until time, and response payload. Queue Redis and cache Redis are operationally isolated.

Votes, likes, dislikes, and per-user feed ranking are not first-release tables. If added, a vote needs a unique `(user_id, post_id)` constraint and a separate aggregate path; it must not turn the public feed into a per-user cache key by accident.

## Query and migration checks

- Feed: `posts.status = 'published'`, ordered by `(published_at DESC, id DESC)`, with a keyset cursor and limit. No offset pagination for infinite scroll.
- Thread: fetch its main post and published updates by `story_id`; join only current revisions and evidence needed for the response.
- Due sources: `enabled = true AND next_poll_at <= now()` with a bounded batch ordered by `next_poll_at` and priority.
- Crawl frontier: claim due `discovery_candidates` in bounded priority batches with a lease and `FOR UPDATE SKIP LOCKED`; expire stale leases and track skipped reasons. Query source yields without scanning all candidate rows.
- Candidate stories: first use `story_entities`, a bounded recency window, and PostgreSQL full-text search with a GIN index on normalized title/summary text. Inspect query plans before adding `pg_trgm` or vector search.
- X discovery: look up posts by unique `x_post_id` before insert; use indexed `conversation_id`, reply, quote, and shared-link relationships to retrieve candidate context. Keep account and search cursors independent, and advance only after persistence.
- X compliance and spend: index availability rechecks by `x_posts.last_checked_at` and active cards by `post_evidence.source_item_id`; ledger queries must enforce configured caps before scheduling more reads.
- Outbox relay and task reconciler: use partial status indexes and `FOR UPDATE SKIP LOCKED` where multiple workers may claim rows.
- Run migrations in order, review generated SQL, test uniqueness and transition constraints against duplicates, and measure index size and write cost. No destructive migration is applied automatically to production.

## Decisions still open

1. Can guests read the feed, or is sign-in mandatory? Recommended: public reads, optional sign-in.
2. What minimum evidence permits auto-publication? Recommended: one authoritative primary source for a release or official incident update; two independent credible sources for an unconfirmed factual claim; a directly attributable original post for an opinion. A video claim requires direct review or a transcript before describing what the footage shows. Contradictions, missing context, and low confidence enter review.
3. Which public accounts and Communities enter the initial registry? The X API cap is $10 per month across Post, User, Follows, Community, and activity-event charges; search breadth, webhook subscriptions, and reaction depth must fit it.
4. What retention period is permitted for each source's excerpts and raw metadata? This is source-specific, not one global setting.

These decisions should be recorded before implementing publication rules, auth gating, or source adapters. Hosting topology can be decided separately without changing these logical schemas.
