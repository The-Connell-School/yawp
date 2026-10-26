# Ship Review r1 — PR #828

**Target:** https://github.com/The-Connell-School/yawp/pull/828  
**Branch:** `cursor/allowed-action-origins-709b`  
**Reviewed head:** `0171b9401d711058d04ca7878ac6cae7c7e08373`

## Verdict

**SHIP**

## Scope check

| File | Change |
|------|--------|
| `services/web-app/react-router.config.ts` | Adds `allowedActionOrigins` (7 lines + comment) |
| `scripts/deployment-contract.test.ts` | Contract test asserting config hosts |

No unrelated edits. Diff is 23 insertions, 0 deletions across two files only.

## Origin allowlist review

Configured hosts:

- `yawp.school` — production CloudFront alias (`production_domain_name` default in `infra/variables.tf`).
- `demo.yawp.school` — demo environment (documented in `.github/workflows/demo-environment.yml`).
- `ua.yawp.school` — UA partner hostname (`ua_partner_hostname` default; second production edge alias in `infra/main.tf`).
- `*.preview.yawp.school` — PR preview wildcard per `docs/runbooks/preview.md` (`pr-<n>.preview.yawp.school`, `ua-pr-<n>.preview.yawp.school`, etc.).

React Router matches patterns via `matchWildcardDomain`; `*.preview.yawp.school` correctly covers single-label preview subdomains.

**Out of scope (acceptable for this hotfix):** `internal.yawp.school` is a separate internal integration origin, not a browser-facing Yawp web-app host on this deploy surface. Local dev continues to work when `Origin` matches `request.url` (no proxy scheme mismatch).

## Contract test

Test name: `React Router allows HTTPS browser action origins behind TLS-terminating proxies`.

Asserts presence of `allowedActionOrigins` and exact quoted host strings matching config. Ran locally against PR head contents: **pass** (5 expects).

## CI (snapshot at review)

Required checks on PR head were green except **Prisma migrations** still pending at review time; no migration changes in this PR.

## Risks

1. **CSRF surface:** Explicit allowlist is required for RR 7.18+ `singleFetchAction` CSRF checks when TLS terminates in front of Node (`Origin: https://…` vs `request.url` `http://`). Listed hosts are Yawp-controlled; arbitrary third-party origins remain blocked.
2. **Host drift:** New public hostnames that terminate TLS in front of App Runner need matching `allowedActionOrigins` entries; the deployment-contract test only guards the four patterns above.
3. **Wildcard limits:** Only `*.preview.yawp.school` is covered; multi-level preview hostnames outside that pattern would still 400 until added (none documented for current preview layout).

## Notes

Competing PR #827 (hygiene bundled) was closed per driver; hygiene remains follow-up. This review does not merge #828.
