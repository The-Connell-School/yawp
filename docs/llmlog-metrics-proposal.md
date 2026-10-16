# LlmLog Metrics Proposal

This is a proposal for aggregate metrics that could be computed from de-identified `LlmLog` rows after write-time de-identification and the backfill are complete. It does not add dashboards, pipelines, retention changes, or new production jobs.

## Scope

- Use only de-identified prompt, response, token, timing, provider, model, feature, route, and fallback metadata.
- Keep metrics aggregated by feature, route, provider, model, and time window.
- Do not reintroduce user, student, teacher, organization, request, class, IP hash, filename, email, username, or name dimensions.
- Do not delete `LlmLog` rows as part of metrics work.

## Operational Metrics

- Request count by feature, route, provider, model, and hour/day.
- Error count and error rate by feature, route, provider, model, and hour/day.
- P50, P90, P95, and P99 latency by feature, route, provider, and model.
- Input, output, and total token counts by feature, route, provider, model, and day.
- Mean and percentile token counts per request.
- Estimated provider cost by feature, route, model, and day using a separately maintained price table.
- Requests using metadata-only payload logging versus full de-identified payload logging.
- Tool-use request count, average tool rounds, and max tool rounds by feature and route.

## Reliability Metrics

- Anthropic-to-OpenAI fallback count and rate by feature, route, and day.
- Fallback reason counts, including retryable status groups and circuit-open events.
- Provider error classes by feature, route, model, and day.
- Empty response count and rate by feature, route, model, and day.
- Timeout or abort count by feature, route, model, and day, if represented in logged errors.
- Cache creation and cache read token totals by feature, route, model, and day.
- Cache read rate for prompt-cached calls and estimated token savings from cache reads.

## Product Quality Signals

- Tutor response volume by assignment workflow feature and route.
- Grading response volume by grading workflow feature and route.
- Average prompt and response text length by feature and route, using stored length metadata where available.
- Response length outliers by feature and route for manual review queue sizing.
- Error rate immediately after prompt or model changes, grouped by feature and model.
- Fallback rate immediately after prompt or model changes, grouped by feature and model.
- Tool-use loop exhaustion count by feature and route.

## Privacy And Governance Metrics

- Count of rows marked `deidentified=true` by de-identification version and day.
- Count of legacy rows that remain not de-identified before, during, and after backfill.
- Backfill dry-run scanned, changed, text-changed, skipped, and would-update counts.
- Backfill apply scanned, changed, text-changed, skipped, and updated counts.
- Count of rows using metadata-only payload logging by feature and route.
- Count of rows where raw payload fields are omitted due to metadata-only logging.

## Implementation Notes

- Run the backfill in dry-run mode first for demo, then production only after the required production RDS snapshot is taken and recorded.
- Prefer aggregate tables or scheduled reports that store only bucketed counts and percentiles.
- Avoid dimensions with high cardinality that could become indirect identifiers.
- Keep any future dashboard access limited to authorized admins and reviewers.
