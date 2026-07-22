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

## Updating the corpus

Edit `prompts.json` directly, keeping the three-part prompt structure and the
controlled vocabularies in `data.ts`. Facet lists and counts are derived at
load time, so new subjects, texts, or moves surface in the filter panel
automatically. The pure facet helpers in `data.ts`
(`buildFacets` / `buildOptionCounts` / `applyFilters`) are unit-tested in
`data.test.ts`.
