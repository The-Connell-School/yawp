# AI Context Eval Sandbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a backend-only local eval harness that compares tutor document-context strategies with real production model settings, production cost baselines, and dry-run artifacts before any live Anthropic calls are made.

**Architecture:** Keep this outside the product UI for now. Use deterministic TypeScript scripts to generate fixture conversations, estimate cost, summarize production `LlmLog` history, and optionally run live Anthropic requests behind an explicit `--live` guard.

**Tech Stack:** Bun scripts, TypeScript, Anthropic SDK already present in the web app workspace, Postgres read-only `LlmLog` queries, local ignored output under `.worktree-local/ai-context-evals`.

---

### Current Findings

- Production App Runner is configured with `AI_MODEL=claude-sonnet-4-6`.
- Production Anthropic API key is stored in AWS Secrets Manager as `yawp-production-anthropic-key`.
- Local live-run env was created at `.worktree-local/ai-context-evals.env`; it is ignored by git and should not be printed.
- The current tutor route already sends current editor text on every tutor turn through the `content` form field and wraps it in `student_document_context`.

### Strategy Set

- **A: `full-document-each-turn`**: current canonical draft is sent on every turn. This is simplest and most robust; cost is the main concern.
- **B: `delta-since-last-turn`**: first turn sends full draft, later turns send server-created change summaries and changed excerpts. This is cheapest but risks weak whole-draft answers.
- **C: `hybrid-summary-and-excerpts`**: later turns send current summary plus changed excerpts, and escalate to full draft when the student asks for whole-draft review.
- **D: `full-document-with-prompt-cache`**: full draft is still sent, but stable system/history prefix is modeled as cacheable to estimate whether caching reduces cost without losing context.

### Eval Cases

- Local revision follow-up: can the tutor tell whether a thesis revision addressed prior feedback?
- Specific detail question: can the tutor use a newly added precise detail?
- Deleted-content trap: does the tutor avoid old content that was removed?
- Whole-draft review: can the tutor reliably review the entire current draft after several edits?

Each case is generated across 20, 50, 100, 200, 500, 750, and 1000 word documents.

### Outputs

- `manifest.json`: model, live/dry-run status, case count, strategy count.
- `planned-requests.jsonl`: every planned request, context coverage, estimated input tokens, anchors, and expected behavior.
- `summary.md`: per-strategy estimated cost using current Anthropic pricing.
- `tutor-baseline.md`: current production/local snapshot baseline from `LlmLog`.
- `live-results.jsonl`: only produced when `--live` is explicitly passed.

### Commands

- [ ] **Run tests**

```bash
bun test ./scripts/ai-context-evals/*.test.ts
```

- [ ] **Create a dry-run plan with no API calls**

```bash
bun run scripts/ai-context-evals/live-runner.ts --limit-cases=2
```

- [ ] **Build a cost baseline from a production snapshot or tunnel**

```bash
DATABASE_URL=postgresql://... bun run scripts/ai-context-evals/baseline-runner.ts --days=60 --limit=1000
```

- [ ] **Run live Anthropic evals intentionally**

```bash
bun --env-file=.worktree-local/ai-context-evals.env run scripts/ai-context-evals/live-runner.ts --live --limit-cases=1
```

### Decision Rule

Pick the cheapest strategy that still gives the tutor canonical current-document context whenever the student asks for global review, specific details, or follow-up on edits. If the full-document strategy is only marginally more expensive at 20-1000 word drafts, prefer it for reliability and use prompt caching later for stable prompt/history cost rather than forcing the model to reason from deltas.
