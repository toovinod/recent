# Contributing

Use an issue to describe a bug or propose a change. For large changes, explain the problem and intended behavior before opening a pull request. Report vulnerabilities through [the security policy](SECURITY.md), not public issues.

## Development

Follow [local setup](docs/development.md), then read [the architecture](ARCHITECTURE.md) and [agent guidelines](AGENTS.md). Keep changes focused. Preserve source attribution and links; do not add reader posts, comments, or invented reactions.

Use Bun and the committed `bun.lock`. Run Biome from the repository root. Keep secrets and personal source data out of code, fixtures, screenshots, and logs.

## Validation

```sh
bun run check
bun run test
bun run build
```

Add regression tests when behavior changes. Include integration coverage for database constraints, retries, queue recovery, and concurrency where applicable. Use disposable test services as described in [local setup](docs/development.md#checks). State which suites ran and which were skipped.

Inspect UI changes in a browser. Include a screenshot when appearance or interaction changes. Match checks to the change; documentation edits need accurate commands, working links, and a readable preview.

## Database and dependency changes

Add a new migration for deployed schema changes. Keep TypeScript database types and affected contracts in sync. Explain existing-data handling and deployment order in the pull request. Never rewrite an applied migration or use test cleanup against application data.

Use `bun add` or `bun update` for dependency changes and include the lockfile. Review release notes, run `bun audit`, and validate affected behavior. Dependency updates are maintained manually and reviewed before merging.

## Pull requests

Describe the problem, resulting behavior, and validation. Link the relevant issue when one exists. Mention migration, environment, source-retention, or deployment changes. Avoid unrelated refactors and generated build output.

A maintainer reviews changes before merging. Small fixes do not need a proposal document, a new package, or a new abstraction.

Maintainers should also read [maintenance](docs/maintainers.md) for branch rules, dependency updates, and releases.

## License and conduct

Contributions are provided under the repository's [Apache 2.0 license](LICENSE). Only submit code and fixtures you have the right to share. Be respectful, discuss the work, and keep reports specific and reproducible.
