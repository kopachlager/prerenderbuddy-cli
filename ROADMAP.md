# Public roadmap

This roadmap describes possible directions, not promised dates or release commitments.

## Diagnostic improvements

- additional transparent crawler profiles supported by public documentation;
- clearer evidence and remediation fields for every finding;
- more deterministic HTML and discovery-file fixtures;
- configurable diagnostic thresholds;
- stable JSON schema work toward `1.0`;
- URL-list or sitemap-driven batch checks;
- richer CI annotations and possible SARIF output.

## Explicitly out of scope

- browser rendering or JavaScript execution;
- private Prerender Buddy API access;
- hosted monitoring, baselines, incidents, or history;
- managed crawler routing or DNS onboarding;
- cache management;
- proxy, queue, billing, or infrastructure deployment.

The CLI will remain usable without an account, authentication, telemetry, or calls to Prerender Buddy production services.
