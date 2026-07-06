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
DATABASE_URL=postgresql://... bun run scripts/ai-context-evals/baseline-runner.ts --days=60 --limit=1000
bun --env-file=.worktree-local/ai-context-evals.env run scripts/ai-context-evals/live-runner.ts --live --limit-cases=1
bun run scripts/ai-context-evals/live-results-analysis.ts .worktree-local/ai-context-evals/runs/<run-id> --gate
```

`--gate` turns the latest-context benchmark into a regression check. It fails
when live requests error, deleted/stale anchors appear, or latest-anchor recall
drops below the configured threshold in the revised-thesis, added-detail, or
deleted-content scenarios.

## Strategies

- `full-document-each-turn`: current production shape; sends the current draft on
  every tutor message.
- `delta-since-last-turn`: sends full draft once, then server-created change
  summaries and changed excerpts.
- `hybrid-summary-and-excerpts`: sends summary plus changed excerpts, escalating
  to full draft for whole-draft review.
- `full-document-with-prompt-cache`: sends full current draft while modeling a
  cacheable stable prompt/history prefix.
