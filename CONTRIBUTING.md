# Contributing

Thank you for helping make crawler-readability diagnostics clearer and more reproducible.

## Scope

Good contributions include:

- fixes to HTML or discovery-file analysis;
- public crawler-profile corrections supported by official documentation;
- deterministic fixtures and tests;
- clearer diagnostic wording and limitations;
- small portability or accessibility improvements.

Out of scope for this repository:

- a self-hosted rendering engine or browser farm;
- proxy, DNS, cache, queue, billing, or crawler-routing implementation;
- bypassing anti-bot, rate-limit, access-control, or paid-service controls;
- hidden telemetry or automatic website changes;
- claims that a check guarantees rankings, indexing, citations, mentions, or traffic.

## Development

Use Node.js 20 or newer.

```bash
npm test
npm run test:coverage
npm run check
npm run pack:check
```

Every behavioural change should include tests. A diagnostic rule should explain what was observed, avoid declaring a platform-wide failure, and document common false positives.

## Pull requests

Keep pull requests focused. Describe:

1. the observable problem;
2. a reproducible public example or fixture;
3. the proposed behaviour;
4. false-positive and compatibility considerations;
5. tests performed.

Do not include production credentials, customer data, internal endpoints, private prompts, or copied third-party code.

By contributing, you agree that your contribution is licensed under Apache-2.0.
