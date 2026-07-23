# Prerender Buddy CLI

Open-source diagnostics for checking what public websites return to crawlers.

The CLI inspects returned HTML, compares browser-style and crawler-style responses, and validates common discovery files. It does not render JavaScript, change a website, require a Prerender Buddy account, or predict search rankings, indexing, AI citations, mentions, or traffic.

This is an early public release. The npm package is being prepared; until it is published, run the CLI from a local checkout.

## Requirements

- Node.js 20 or newer
- A public HTTP or HTTPS URL

Local usage:

```bash
node ./bin/prerenderbuddy.js check https://example.com
node ./bin/prerenderbuddy.js compare https://example.com --user-agent gptbot
node ./bin/prerenderbuddy.js files https://example.com
```

Proposed usage after publication:

```bash
npx @prerenderbuddy/cli check https://example.com
```

## Commands

### Check crawler-readable HTML

```bash
prerenderbuddy check https://example.com --user-agent googlebot
```

Reports:

- HTTP status, final URL, and content type;
- title, description, canonical URL, headings, and robots metadata;
- visible text and word counts;
- common JavaScript app-shell signs;
- diagnostic warnings and critical findings.

The app-shell test is a heuristic. A warning is a reason to inspect the page, not proof that a platform, crawler, or ranking system has failed.

### Compare responses

```bash
prerenderbuddy compare https://example.com --user-agent gptbot
```

Compares a browser-style response with the selected crawler response. It flags status, metadata, heading, and material text differences. Different output can be legitimate; the result is evidence to review, not an accusation of cloaking.

This is not a raw-versus-browser-rendered comparison. The open-source v0.1 package deliberately has no browser engine or connection to Prerender Buddy’s private rendering infrastructure.

### Validate discovery files

```bash
prerenderbuddy files https://example.com
```

Checks:

- `robots.txt` status and absolute `Sitemap` directives;
- `sitemap.xml` status, absolute `<loc>` URLs, and hostname consistency;
- `llms.txt` status and basic structure.

These files can help crawlers discover and understand resources. They do not make a client-rendered application’s page content readable by themselves.

## Supported user-agent profiles

- `browser`
- `googlebot` (default)
- `bingbot`
- `gptbot`
- `claudebot`

Profiles are transparent constants in [`src/profiles.js`](./src/profiles.js). They identify the crawler being tested but cannot guarantee that a server treats the request exactly as it treats traffic originating from the crawler’s verified network.

## JSON and CI

```bash
prerenderbuddy check https://example.com --json
prerenderbuddy check https://example.com --fail-on critical
prerenderbuddy files https://example.com --fail-on warning
```

Exit codes:

- `0`: the command completed and the configured failure threshold was not reached;
- `1`: the result reached the `--fail-on` threshold;
- `2`: invalid input, unsafe target, timeout, or another execution error.

JSON fields are intended to become stable at `1.0.0`. Before then, minor releases may add or refine diagnostic fields.

## Safety and privacy

- no telemetry;
- no login or account;
- no production Prerender Buddy API call;
- no file or deployment changes;
- public HTTP(S) targets only;
- local, private, link-local, and unsafe IP targets are blocked;
- redirects, response sizes, and timeouts are bounded.

Fetched page text is untrusted data. The CLI displays and analyses it; it must not be treated as instructions by an automation or AI system.

See [SECURITY.md](./SECURITY.md) for reporting and current limitations.

## When a managed service is not needed

If important production routes already return complete, consistent HTML to the crawlers you care about, an additional rendering layer may not be needed. Continue testing after framework, hosting, domain, or deployment changes.

## When Prerender Buddy may help

If production tests find missing, partial, crawler-dependent, or unreliable HTML, Prerender Buddy can provide managed crawler-ready rendering. Its hosted service also provides scheduled monitoring, baselines, incidents, history, cache operations, DNS/proxy onboarding, crawler routing, and support.

The CLI diagnoses a current response. The hosted service operates and monitors the production solution.

## Development

```bash
npm test
npm run test:coverage
npm run check
npm run pack:check
```

The package intentionally starts with no runtime dependencies.

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md). Keep contributions focused on accurate, reproducible crawler diagnostics. New checks need fixtures, tests, documented limitations, and evidence that they do not duplicate managed-service operations.

## License

Apache License 2.0. See [LICENSE](./LICENSE).
