# Prerender Buddy CLI

[![npm version](https://img.shields.io/npm/v/%40prerenderbuddy%2Fcli?label=npm)](https://www.npmjs.com/package/@prerenderbuddy/cli)
[![GitHub release](https://img.shields.io/github/v/release/kopachlager/prerenderbuddy-cli?label=release)](https://github.com/kopachlager/prerenderbuddy-cli/releases)
[![CI](https://github.com/kopachlager/prerenderbuddy-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/kopachlager/prerenderbuddy-cli/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/%40prerenderbuddy%2Fcli)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/%40prerenderbuddy%2Fcli)](./package.json)

Open-source diagnostics for checking what public websites return to crawlers.

The CLI inspects returned HTML, compares standard and crawler user-agent HTTP responses, and validates common discovery files. It does not render JavaScript, change a website, require a Prerender Buddy account, or predict search rankings, indexing, AI citations, mentions, or traffic.

Using an AI assistant? The [`prerenderbuddy-mcp`](https://github.com/kopachlager/prerenderbuddy-mcp) repository exposes these diagnostics through a local stdio MCP server. See the [Prerender Buddy tools overview](https://prerenderbuddy.com/developer-tools) to compare the CLI, MCP server, Chrome extension, and managed service.

Run it without installing:

```bash
npx @prerenderbuddy/cli check https://example.com --user-agent googlebot
```

Or install the command globally:

```bash
npm install --global @prerenderbuddy/cli
prerenderbuddy check https://example.com
```

Example output from the included loading-placeholder fixture:

```text
Prerender Buddy · crawler HTML check · CRITICAL
URL                https://example.com/app
Crawler profile    Googlebot
HTTP               200
Final URL          https://example.com/app
Title              Loading application
Description        Application loading screen.
H1                 Loading application
Readable text      41 characters / 5 words
App-shell signs    root div, bundled assets, module scripts

Issues:
- CRITICAL [app_shell]: Returned HTML has limited visible content and multiple JavaScript app-shell signals.
  Why: Crawlers that do not execute JavaScript may receive only the application shell.
  Evidence: {"readableCharacters":41,"scriptCount":1,"signals":["loading-only visible text","module or bundled application script","root div detected","bundled assets detected","module scripts detected"]}
  Next: Inspect the raw response and test whether important page content is present before JavaScript executes.

This checks returned HTML only. It does not predict rankings, indexing, citations, mentions, or traffic.
```

Reproduce that output from a local checkout with `npm run demo:fixture`. The demo injects a static fixture into the normal check and formatting functions; it does not weaken public-URL safety or start a local URL-fetching service.

The finding is a documented heuristic, not proof that a crawler failed. The CLI does not run Chromium, execute page JavaScript, or produce rendered HTML.

## Requirements

- Node.js 20 or newer
- A public HTTP or HTTPS URL

Other commands:

```bash
npx @prerenderbuddy/cli compare https://example.com --user-agent gptbot
npx @prerenderbuddy/cli files https://example.com
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

Compares a browser-style user-agent HTTP response with the selected crawler user-agent HTTP response. It reports status, metadata, heading, and material text-volume differences separately. Different output can be legitimate; the result is evidence to review, not an accusation of cloaking.

Both sides are ordinary HTTP responses. Neither side executes JavaScript. This is not a raw-versus-browser-rendered comparison, and the package has no browser engine or connection to Prerender Buddy’s private rendering infrastructure.

The default text-ratio tolerance is 30% in either direction. Adjust it for a known-variable site:

```bash
prerenderbuddy compare https://example.com --text-ratio-threshold 0.20
```

The comparison normalizes HTML into whitespace-collapsed visible text and reports the exact lengths and metadata values that changed. It does not perform semantic AI comparison or automatically remove cookie notices, timestamps, rotating banners, experiments, personalization, regional content, anti-bot pages, or temporary CDN responses. Review those sources of variation before treating a warning as a regression.

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

### Programmatic use

The same diagnostics are exported as dependency-free ESM functions:

```js
import {
  analyzeHtml,
  checkDiscoveryFiles,
  checkUrl,
  compareUrl,
} from '@prerenderbuddy/cli';

const page = await checkUrl('https://example.com', { userAgent: 'googlebot' });
const comparison = await compareUrl('https://example.com', {
  userAgent: 'gptbot',
  textRatioThreshold: 0.2,
});
const files = await checkDiscoveryFiles('https://example.com');
const localAnalysis = analyzeHtml('<main><h1>Example</h1></main>');
```

Network functions retain the same public-URL safety, redirect, timeout, and response-size controls as the CLI.

### GitHub Actions

Copy [`examples/github-actions/crawler-readability.yml`](https://github.com/kopachlager/prerenderbuddy-cli/blob/main/examples/github-actions/crawler-readability.yml)
into the target repository as `.github/workflows/crawler-readability.yml`, then replace
`https://example.com` with the production URL.

The example:

- checks crawler-readable HTML as Googlebot;
- compares browser-style user-agent and GPTBot HTTP responses;
- validates `robots.txt`, `sitemap.xml`, and `llms.txt`;
- fails only on critical findings by default;
- pins the CLI version so updates are reviewed deliberately.

Run the workflow on pull requests, manually, or adapt its triggers to the deployment process.

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

## CLI and hosted service

| Capability | Open-source CLI | Hosted Prerender Buddy |
| --- | --- | --- |
| One-time public URL diagnostics | Yes | Yes |
| Local execution and CI | Yes | No |
| Returned HTML inspection | Yes | Yes |
| JavaScript execution | No | Yes, for managed crawler-ready rendering |
| Scheduled monitoring | No | Yes |
| Baselines, history, and incidents | No | Yes |
| Managed crawler routing | No | Yes |
| Cache operations | No | Yes |
| DNS or proxy onboarding | No | Yes |
| Account required | No | Yes |

The CLI is independently useful for diagnostics. The hosted service operates rendering, routing, monitoring, and cache workflows when testing shows that a production deployment needs them.

### When a managed service is not needed

If important production routes already return complete, consistent HTML to the crawlers you care about, an additional rendering layer may not be needed. Continue testing after framework, hosting, domain, or deployment changes.

### When Prerender Buddy may help

If production tests find missing, partial, crawler-dependent, or unreliable HTML, Prerender Buddy can provide managed crawler-ready rendering. Its hosted service also provides scheduled monitoring, baselines, incidents, history, cache operations, DNS/proxy onboarding, crawler routing, and support.

The CLI diagnoses a current response. The hosted service operates and monitors the production solution.

## Fixtures and heuristic limits

Deterministic fixtures live in [`test/fixtures`](./test/fixtures). They cover healthy HTML, thin application shells, minimal static pages, canvas applications, loading placeholders, hidden script data, cookie banners, crawler-blocked responses, malformed metadata, and discovery-file errors.

Application-shell detection uses observable inputs: readable character count, empty `root` or `app` mount points, loading-only text, module or bundled scripts, and framework markers. It does not identify a framework failure, simulate verified crawler traffic, or prove that a genuine crawler received the same response.

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

## Next steps

- Use the [MCP server](https://github.com/kopachlager/prerenderbuddy-mcp) with compatible AI assistants.
- Compare all [Prerender Buddy developer tools](https://prerenderbuddy.com/developer-tools).
- Run the [browser-based crawler checker](https://prerenderbuddy.com/tools/bot-view-checker).
- Read the [technical documentation](https://prerenderbuddy.com/docs).
- Review the [public roadmap](./ROADMAP.md).
- Report reproducible CLI problems in [GitHub Issues](https://github.com/kopachlager/prerenderbuddy-cli/issues).
- Use the [hosted Prerender Buddy service](https://prerenderbuddy.com) when diagnostics show that managed rendering or monitoring is needed.

## License

Apache License 2.0. See [LICENSE](./LICENSE).
