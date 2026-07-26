# Thesis-Driven Essay prompt library

`prompts.json` is the canonical corpus for the Thesis-Driven Essay prompt
library, mirroring the Daily Pages library but tailored to longer,
thesis-driven essay prompts. The route loader imports it directly and the
library only renders for teachers viewing the **"The Thesis-Driven Essay"**
assignment type.

Unlike Daily Pages' one-line free-writes, these prompts are multi-paragraph:
an opening directive, a paragraph that gives students room to find their own
angle, and a closing note about formal organization. Each prompt therefore has
a short `title` (the library row heading) plus the full `prompt` body that
becomes the assignment when a teacher clicks it.

The voice and structure follow the YAWP "Sample Essay Prompts" sheet.

## Categories

Prompts are grouped by `category`, the primary facet:

| category | meaning |
|---|---|
| `theme` | about a theme, within or across texts |
| `single-text` | anchored to one specific named text |
| `applied-to-text` | portable — apply to whatever text the class read |
| `history-subject` | history, science, art, or another discipline |
| `general` | a general question that needs no source text |

## Schema

| field | shape |
|---|---|
| `id` | `TD-NNN` |
| `title` | string (short row heading) |
| `prompt` | string (full multi-paragraph assignment) |
| `category` | `theme` \| `single-text` \| `applied-to-text` \| `history-subject` \| `general` |
| `subjects` | string[] (controlled vocabulary) |
| `textsOrUnits` | string[] (named texts, empty for general prompts) |
| `cognitiveMoves` | string[] (`argue-a-position`, `analyze`, `compare`, `evaluate`, `interpret`, `propose-a-solution`, `reflect`, `synthesize`) |
| `sourceNeed` | `none` \| `optional` \| `required` |
| `gradeBands` | subset of `9` \| `10` \| `11` \| `12` |

## Prompt generator (LLM)

Alongside browsing the fixed corpus, teachers can **generate** new prompts.
The **"Generate a prompt"** option in the New menu (third item, next to
Document and Assignment) opens a chat sheet where the teacher describes the
essay they want and iterates with an LLM. Each time the model drafts, it
returns **three distinct options** the teacher pages through with left/right
arrows; "Use this prompt" on whichever option is showing drops it straight into
the Create Assignment sheet.

- `prompt-generator.ts` — framework-free shared module: the `GeneratorMessage`
  / `GeneratedPrompt` types, the zod `GeneratorResponseSchema` output contract
  (`{ reply, options[] }`, with a legacy singular `prompt` coerced into
  `options`), `selectFewShotExamples`, and `buildGeneratorSystemPrompt`, which
  teaches the model the three-part house style and seeds it with real corpus
  prompts as few-shot examples. Unit-tested in `prompt-generator.test.ts`.
- `thesis-prompt-generator.tsx` — the chat sheet UI (`useFetcher`).
- `../../api.domain.thesis-prompt-generator/route.ts` — the teacher-gated POST
  action that calls `getLLMCompletion` and parses the structured reply, plus the
  GET loader that serves saved history (`route.test.ts`).

The generator is gated exactly like the library: teachers only, and only on
the Thesis-Driven Essay assignment type. Its drafts follow the same three-part
structure as the corpus, so anything it produces reads like a library prompt.

Only the most recent turns are forwarded to the model, via
`selectRecentMessages`. It trims to `MAX_GENERATOR_MESSAGES` *and* drops any
leading assistant turn: a transcript alternates and always ends on the teacher,
so an even-sized window off an odd-length transcript would otherwise open on an
assistant turn, which the provider rejects.

## Saved history

`generator-history.server.ts` persists each exchange so a teacher can reopen
prompts they worked on earlier, rather than losing the chat when the sheet
closes. The sheet grows a **"Past prompts"** button listing recent conversations;
picking one replays it, and continuing appends to the same thread.

- Conversations and turns are scoped to the teacher's `OrgMembership`
  (`ThesisPromptGeneratorConversation` / `ThesisPromptGeneratorTurn`). Every read
  filters by membership, so another teacher's id reads as missing.
- Titles come from the teacher's opening ask (`deriveConversationTitle`).
- Rollout is behind `THESIS_PROMPT_GENERATOR_HISTORY_ENABLED=true`. With the flag
  off, nothing is written, the list reads empty, and the sheet looks exactly as
  it did before the feature.
- History is additive by design: a failed write or a disabled flag degrades to
  "not saved" and never throws into the request path, so the generator itself
  cannot be broken by the code that records it. The truncated-response retry
  nudge is deliberately not saved.

This is distinct from `LlmLog`, which is an ops audit trail of individual
provider calls rather than a teacher-facing history.

For e2e, `E2E_THESIS_PROMPT_GENERATOR_FIXTURE=true` (with `E2E=true` and no
`ANTHROPIC_API_KEY`) makes the action answer from a deterministic fixture,
mirroring `E2E_GRADE_ESSAY_AI_FIXTURE`. That lets the real action run — and
actually save — so the history flow is testable end to end.

## Updating the corpus

Edit `prompts.json` directly, keeping the three-part prompt structure and the
controlled vocabularies in `data.ts`. Facet lists and counts are derived at
load time, so new subjects, texts, or moves surface in the filter panel
automatically. The pure facet helpers in `data.ts`
(`buildFacets` / `buildOptionCounts` / `applyFilters`) are unit-tested in
`data.test.ts`.
