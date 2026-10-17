# Security policy

## Supported code

Security fixes target the current `main` branch. Recent does not currently maintain versioned release branches. Deployments based on older commits should update before reporting a problem that has already been fixed.

## Report a vulnerability

[Submit a private vulnerability report](https://github.com/toovinod/recent/security/advisories/new).

Include the affected commit, reproduction steps, expected and observed behavior, and likely impact. A minimal example is useful. Remove API keys, cookies, connection strings, and personal data from attachments.

Do not publish exploit details in an issue or pull request before a fix is available. If private reporting is unavailable, open an issue requesting a private security contact without including vulnerability details.

Maintainers will investigate, coordinate a fix with the reporter, and use a GitHub advisory when disclosure is appropriate. There is no guaranteed response time or bug bounty program.

## Testing scope

Test against your own local deployment and data. Do not probe other users' accounts, consume paid provider quotas, or test against deployments you do not operate without permission. Stop if a test exposes someone else's data.

## Deployment security

Operators are responsible for secret storage, HTTPS, network restrictions, database and Redis access, backups, and dependency updates. See [self-hosting](docs/deployment.md). An audit with no known dependency advisories is not a guarantee that the application has no vulnerabilities.
