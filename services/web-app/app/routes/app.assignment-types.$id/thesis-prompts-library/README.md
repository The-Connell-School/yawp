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

Alongside browsing the fixed corpus, teachers can **generate** a new prompt.
The **"Generate a prompt"** option in the New menu (third item, next to
Document and Assignment) opens a chat sheet where the teacher describes the
essay they want and iterates with an LLM until they have a draft they like;
"Use this prompt" drops it straight into the Create Assignment sheet.

- `prompt-generator.ts` — framework-free shared module: the `GeneratorMessage`
  / `GeneratedPrompt` types, the zod `GeneratorResponseSchema` output contract
  (`{ reply, prompt }`), `selectFewShotExamples`, and
  `buildGeneratorSystemPrompt`, which teaches the model the three-part house
  style and seeds it with real corpus prompts as few-shot examples. Unit-tested
  in `prompt-generator.test.ts`.
- `thesis-prompt-generator.tsx` — the chat sheet UI (`useFetcher`).
- `../../api.domain.thesis-prompt-generator/route.ts` — the teacher-gated POST
  action that calls `getLLMCompletion` and parses the structured reply
  (`route.test.ts`).

The generator is gated exactly like the library: teachers only, and only on
the Thesis-Driven Essay assignment type. Its drafts follow the same three-part
structure as the corpus, so anything it produces reads like a library prompt.

## Updating the corpus

Edit `prompts.json` directly, keeping the three-part prompt structure and the
controlled vocabularies in `data.ts`. Facet lists and counts are derived at
load time, so new subjects, texts, or moves surface in the filter panel
automatically. The pure facet helpers in `data.ts`
(`buildFacets` / `buildOptionCounts` / `applyFilters`) are unit-tested in
`data.test.ts`.
