# Maintenance

## Reviews and main

Keep pull requests focused and review the diff, validation results, migrations, and deployment notes before merging. `CODEOWNERS` requests the repository maintainer's review; it does not enforce review by itself.

`main` is protected by required pull requests, the `verify` CI check, an up-to-date branch, and resolved conversations. Force pushes and branch deletion are blocked. Administrator bypass remains enabled for maintenance. A second approval is not required while the project has one maintainer.

Once CodeQL has completed its first hosted run, add its analysis check to the required checks. Require code-owner review when another maintainer is available. Revisit administrator bypass as the maintainer team grows.

Branch rules are GitHub settings, not enforced by files in this repository. Keep GitHub Actions restricted to the permissions each workflow needs. Do not use `pull_request_target` to execute contributor code with secrets.

## Dependencies and security

Update Bun packages and GitHub Actions manually. Review release notes and run the same checks as code changes. Keep action references pinned to verified full commit IDs. Dependency alerts remain enabled; automatic dependency-update pull requests are disabled.

Use private reporting for vulnerabilities and follow [SECURITY.md](../SECURITY.md). Keep secret scanning and push protection enabled. Rotate an exposed secret immediately; removing it from the latest commit does not revoke it or remove Git history.

CodeQL runs on pull requests, main, and a weekly schedule. CI installs the frozen lockfile, audits packages, checks code, migrates a disposable database, runs tests, and builds web. Investigate failures rather than weakening a check to merge a change.

## Releases and deployment

Do not advertise a release until its checks pass. For a release, record the commit and write notes covering user-visible changes, new configuration, dependency updates, migrations, and known limits. Use a version tag when publishing a versioned release; do not move an existing release tag.

The project currently develops on `main` and does not maintain release branches. Security support follows that policy. Before deployment, use the checks in [self-hosting](deployment.md#launch-checks) and keep the previous application artifact and a verified database recovery path available.

Update the README when the product changes. Keep detailed setup and operations in `docs/`. Update architecture and database types from the implementation, not from planned features. Local schema notes are excluded from Git.
