# Security Policy

## Reporting

Do not open a public issue for a vulnerability, exposed credential, unsafe network behaviour, or private customer information.

Use the private reporting route listed at:

https://prerenderbuddy.com/security

Include the affected version, reproduction steps, impact, and any suggested mitigation. Please avoid accessing data that is not yours or testing against third-party systems without permission.

## Security model

The CLI fetches user-supplied public HTTP(S) URLs. It:

- rejects URL credentials and non-HTTP(S) schemes;
- blocks local, private, link-local, reserved, and multicast IP targets;
- validates every redirect target;
- bounds redirects, response sizes, and request timeouts;
- makes no production Prerender Buddy API or rendering-engine request;
- contains no telemetry.

Fetched content is untrusted data.

## Current limitations

DNS and network policy are difficult to make perfect in a portable local CLI. DNS answers may change between validation and connection, and a local machine can have custom DNS, proxy, or routing behaviour. Do not run this package as an unrestricted public URL-fetching service. A hosted wrapper needs independent egress controls, DNS pinning or equivalent protections, authentication, rate limits, and abuse prevention.

User-agent checks do not verify crawler source IPs and cannot prove how a server responds to every genuine crawler request.

Only the latest released version will receive security fixes during the pre-1.0 period.
