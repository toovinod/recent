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

The news feed is at `/news`; story threads are at `/stories/[storyId]`. The Bun worker collects configured Atom and RSS feeds every 15 minutes when due, classifies items with Jev, matches stories, and selects source-backed text with Luna when an excerpt is long. PostgreSQL owns the published cards. BullMQ uses `QUEUE_REDIS_URL`; the feed cache uses `CACHE_REDIS_URL`. Use separate Redis instances in production.

For local Docker, `postgres://recent:recent@localhost:5432/recent` and `redis://localhost:6379` match the development containers. The queue and cache URLs may point to that same Redis instance locally.

Copy `apps/worker/.env.example` to `apps/worker/.env`, set the database URL and provider keys, and add a reviewed feed with `bun run --cwd apps/worker source:add "Source name" atom "https://example.com/feed.atom"`. For X, provide a separate API bearer token and register a numeric user ID with `bun run --cwd apps/worker source:add "Account name" x "https://x.com/i/user/123456"`. X sources poll every two hours and reserve at most five reads per request against a conservative 2,000 read monthly cap. Configure a $10 spending limit in the X Developer Console as the authoritative charge guard. The five post page can miss bursts, so track source coverage before expanding it. Run `bun run --cwd apps/worker dev` alongside core and web. The worker starts the recurring dispatcher and relays database outbox events to its queues. No source is enabled by default, so source selection remains deliberate.
