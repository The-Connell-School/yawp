# AI Context Evals

Backend-only sandbox for comparing tutor document-context strategies. Dry runs
write local artifacts and make no Anthropic calls.

## Local Secret

`.worktree-local/ai-context-evals.env` contains the production Anthropic key and
production model name. It is ignored by git.

## Commands

```bash
bun test ./scripts/ai-context-evals/*.test.ts
bun run scripts/ai-context-evals/live-runner.ts --limit-cases=2
bun run scripts/ai-context-evals/live-runner.ts
DATABASE_URL=postgresql://... bun run scripts/ai-context-evals/baseline-runner.ts --days=60 --limit=1000
bun --env-file=.worktree-local/ai-context-evals.env run scripts/ai-context-evals/live-runner.ts --live --limit-cases=1
bun --env-file=.worktree-local/ai-context-evals.env run scripts/ai-context-evals/live-runner.ts --live --concurrency=4
bun --env-file=.worktree-local/ai-context-evals.env run scripts/ai-context-evals/live-runner.ts --live --concurrency=4 --resume-run-dir=.worktree-local/ai-context-evals/runs/<run-id>
bun run scripts/ai-context-evals/live-results-analysis.ts .worktree-local/ai-context-evals/runs/<run-id> --gate
bun run scripts/ai-context-evals/live-results-analysis.ts .worktree-local/ai-context-evals/runs/<run-id> --gate --compare-baseline=scripts/ai-context-evals/baselines/latest-context-2026-07-04-legacy.json
bun run scripts/ai-context-evals/live-results-analysis.ts .worktree-local/ai-context-evals/runs/<run-id> --gate --write-baseline=scripts/ai-context-evals/baselines/latest-context-<date>.json
```

`--gate` turns the latest-context benchmark into a regression check. It fails
when live requests error, deleted/stale anchors appear, or latest-anchor recall
drops below the configured threshold in the revised-thesis, added-detail, or
deleted-content scenarios. The gate also treats `full-document-each-turn` as the
control lane: every request must include the canonical current document, and the
control lane must clear the stricter latest-anchor recall threshold.

`--compare-baseline` prints `Baseline diff: PASS/FAIL` and compares current OK
rate, latest-anchor recall, canonical-current-document rate, stale/deleted
anchor violations, and cost against the blessed JSON. The committed
`latest-context-2026-07-04-legacy.json` baseline is from the pre-expanded
one-domain live run; after the expanded-domain benchmark is run live and passes,
write a new blessed baseline with `--write-baseline`.

## Coverage

The default matrix is 140 cases and 1,960 planned model requests:

- 7 document sizes: 20, 50, 100, 200, 500, 750, and 1000 words.
- 5 synthetic domains: school lunch argument, literary analysis, AP history DBQ,
  science claim-evidence, and personal narrative.
- 4 latest-context scenarios: revised local feedback, specific detail question,
  deleted-content trap, and whole-draft review.
- 6 tiny-change traps: changed name, changed date, changed number,
  negation flip, deleted paragraph, and reordered claim.

The full dry-run estimate for `claude-sonnet-4-6` is about `$10.68` total across
all four strategies with the default assumed 220 output tokens/request:

- `full-document-each-turn`: 490 requests, `$3.0419`.
- `delta-since-last-turn`: 490 requests, `$2.2689`.
- `hybrid-summary-and-excerpts`: 490 requests, `$2.4536`.
- `full-document-with-prompt-cache`: 490 requests, `$2.9140`.

## Strategies

- `full-document-each-turn`: current production shape; sends the current draft on
  every tutor message.
- `delta-since-last-turn`: sends full draft once, then server-created change
  summaries and changed excerpts.
- `hybrid-summary-and-excerpts`: sends summary plus changed excerpts, escalating
  to full draft for whole-draft review.
- `full-document-with-prompt-cache`: sends full current draft while modeling a
  cacheable stable prompt/history prefix.
