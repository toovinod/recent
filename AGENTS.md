# Recent agent guidelines

Recent is an AI news feed. It collects source material, groups related updates into story threads, and presents news and attributed reactions as short posts. Readers do not create posts, comments, or reposts.

## How to work

- Read the files relevant to the task before editing. Keep changes scoped and preserve unrelated work.
- Prefer clear ownership over duplicated logic. Share code when two real consumers need the same contract or behavior; do not create a package for a single use.
- Keep comments brief and useful. Use single line comments only when the code needs explanation; do not narrate the change history.
- Do not use em dashes or emojis in code, comments, or project documentation.
- Never commit secrets. Add example environment variables when a new required variable is introduced.
- Match verification to risk. Add tests for behavior or contracts that could regress; skip tests that merely restate a label, style value, or implementation detail.
- Report what you ran and what remains unverified. Do not describe a cached result as a fresh execution.

## Repository map

```text
apps/web/                 Next.js App Router web app
apps/core/                Hono API running on Bun
packages/ui/              Shared React UI components
packages/typescript-config/ Shared TypeScript configurations
packages/auth/            Shared Better Auth server and client entry points
packages/db/              Kysely database types and migrations
packages/email/           Resend transactional email delivery
packages/contracts/       Shared feed and story response schemas
apps/worker/              Bun ingestion and publication worker
```

The repository currently contains these workspaces. A mobile app is planned. Check the tree before referring to a planned feature as existing code.

## Boundaries

- `apps/web` owns pages, layouts, server rendering, and browser interactions. Keep product API logic in `apps/core`; use Next.js route handlers only for web-specific concerns when needed.
- `apps/core` owns HTTP endpoints and request validation. It runs TypeScript directly with Bun. Do not add a `dist` build unless a deployment requirement calls for one.
- `packages/auth` owns shared Better Auth configuration and client entry points. Keep server and browser exports separate so database and email code cannot enter browser bundles. Core mounts the auth HTTP handler.
- `packages/*` holds code shared by actual consumers. Apps may import packages; packages must not import apps.
- Keep browser code free of database credentials, queue clients, and other server-only dependencies.
- When adding a worker, run it as a separate Bun process. API handlers may enqueue work, but must not perform scheduled scraping or long-running queue processing inside an HTTP request.
- Keep source collection, normalization, classification, story grouping, and post generation as distinct steps. Store source URLs and attribution; do not invent quotes, reactions, or claims. Make ingestion idempotent so retries do not duplicate posts.

## Stack and commands

- Use Bun for package installation, scripts, and the API runtime. The workspace lockfile is `bun.lock`.
- Use Biome from the repository root. Its root configuration covers supported files throughout `apps/*` and `packages/*`.
- `bun install`: install workspaces.
- `bun run dev`: start development tasks through Turbo.
- `bun run lint`: check formatting, lint rules, and imports across the repository.
- `bun run lint:fix`: apply safe Biome fixes.
- `bun run check-types`: typecheck workspaces through Turbo.
- `bun run check`: run lint and typechecks.
- `bun run build`: build workspaces that have a build step. The Hono API does not need one.
- In `apps/core`, `bun run dev` uses hot reload; `bun run start` runs the source in production mode.

Husky runs `bun run lint:staged` before commit and `bun run check` followed by `bun run test` before push. Database and Redis integration suites require disposable test service URLs; otherwise they are skipped. Run the relevant checks yourself before handing off work; hooks do not replace verification.

## Current implementation and documentation

The implemented stack includes PostgreSQL, Kysely, Zod, Better Auth, Redis, BullMQ, and a separate Bun worker. TypeSafe classification and matching use `@typesafe-ai/sdk`. Editorial recovery is implemented through core admin endpoints. A mobile client and general HTML crawling are not implemented. Keep shared response schemas in `packages/contracts`.

Use `ARCHITECTURE.md` for current ownership, `docs/development.md` for setup, `docs/deployment.md` for hosting and migrations, and `docs/operations.md` for recovery and editorial actions. The migrations and `packages/db/src/schema.ts` define the implemented database. `SCHEMAS.md` is an ignored local design note, not a published schema contract. Update relevant documentation when behavior or configuration changes.

When implementing ingestion, respect each source's access terms and rate limits. Preserve the original link and publication time, distinguish reporting from opinion, and keep model generated summaries traceable to source material. The current one minute due-source dispatch and two hour X poll do not guarantee coverage or freshness.

## Verification

- For changes in `apps/core`, run `bun run check` and verify affected endpoints or behavior.
- For changes in `apps/web` or `packages/ui`, run `bun run check` and `bun run build`. Inspect changed UI in a browser when layout or interaction is uncertain.
- For shared contracts or cross workspace changes, check each affected consumer and run the root checks.
- Run `bun run test` for regression coverage. Integration suites require disposable local PostgreSQL and Redis; they truncate their test data. Never point them at an application database.
- For documentation and workflow changes, validate relative links, commands, YAML, and any changed visual assets.
- Follow `CONTRIBUTING.md` and `SECURITY.md`. Do not publish vulnerability details or include secrets in issue fixtures.
- Do not hand edit generated output such as `.next/`, `.turbo/`, or `dist/`.
