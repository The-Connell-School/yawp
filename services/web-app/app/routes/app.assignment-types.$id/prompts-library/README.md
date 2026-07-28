# Prompts Library data

`prompts.json` is the canonical corpus consumed by the Daily Pages prompts library. The route loader imports it directly.

## Updating the corpus

The authoring source is the Free Write Prompts Library spreadsheet (xlsx, lives outside this repo per the spec). After editing the sheet, regenerate `prompts.json`:

```bash
python3 build-prompts-json.py /path/to/freewrite_prompts_library.xlsx
```

Requires `openpyxl` (`pip install openpyxl`).

The script handles two known quirks of the source sheet: Excel auto-converting comma-separated grade bands like `10, 11, 12` into dates, and common mojibake patterns in em-dashes / smart quotes.

## Schema

| field | shape |
|---|---|
| `id` | `FW-NNN` |
| `prompt` | string |
| `themes` | string[] (controlled vocabulary) |
| `textsOrUnits` | string[] (literary works + writing units) |
| `seriousness` | `playful` \| `light` \| `moderate` \| `serious` \| `heavy` |
| `type` | `agree-disagree` \| `open-reflection` \| `narrative-anchor` \| `hypothetical` \| `provocation` \| `definitional` |
| `cognitiveMoves` | string[] |
| `gradeBands` | subset of `9` \| `10` \| `11` \| `12` |

## Prompt generator

Browsing the corpus is not the only way in. **New → Generate a prompt** (teachers, Daily Pages only) opens a chat sheet where a teacher describes the freewrite they have in mind and the assistant drafts brand-new prompts in the corpus's house style.

| file | role |
|---|---|
| `prompt-generator.ts` | Framework-free contract: the `{ reply, options[] }` zod schema, token/limit constants, `selectFewShotExamples`, `resolveGeneratorModel`, `buildGeneratorSystemPrompt`. |
| `daily-pages-prompt-generator.tsx` | The chat sheet: starter prompts, the options carousel with "Save prompt" / "Use this prompt", and a tiny dependency-free Markdown pass for replies. |
| `../../api.domain.daily-pages-prompt-generator/route.ts` | Teacher-gated POST that calls `getLLMCompletion` and parses the structured reply. |
| `../../api.domain.daily-pages-prompt-save/route.ts` | Teacher-gated POST that keeps a draft in "My prompts". |
| `~/domain/daily-pages-prompts/saved-prompts.server.ts` | Read/write for the `SavedDailyPagesPrompt` table. |

Notes on how it stays in style:

- Real prompts from `prompts.json` are injected as few-shot examples — one per `type`, preferring an unused `seriousness` so the examples aren't all heavy. Editing the corpus therefore changes what the generator imitates.
- The system prompt pins the Daily Pages house style explicitly: one or two sentences, second person, a claim or question to push against, and **no** thesis statements, rubrics, word counts, or numbered sub-questions.
- Each draft is tagged with this file's controlled vocabulary (`type`, `seriousness`, `cognitiveMoves`) so it reads like a library row. Tagging is best-effort: a value outside the vocabulary is dropped, never enough to lose the draft.
- The model answers with strict JSON on every turn. `options` is empty while it is still asking a clarifying question. Parsing tolerates code fences and surrounding prose; a response that can't be structured yields a friendly retry message rather than raw JSON in the chat.

Using a generated prompt pre-fills the Create Assignment sheet, the same path a library click takes.

## My prompts

Generated prompts a teacher keeps land in **My prompts**, a collection inside the same Prompt Library. It's the first filter section and is open by default, so it's visible even when empty.

- A prompt is kept two ways: explicitly with **"Save prompt"**, and implicitly by **"Use this prompt"** — anything actually assigned is worth keeping. Both go through the same upsert, so the two never duplicate.
- Rows are keyed by `sha256(trimmed prompt)` per (teacher, assignment type), which is what makes save-then-use idempotent. Re-saving also clears `archivedAt`, so keeping a prompt again restores one that had been removed.
- The generator's facet tags are stored alongside the text, so a saved prompt still answers the Type / Seriousness / Cognitive move filters and reads like a corpus row. Tags are re-validated on read — a value that has since left the vocabulary is dropped, not shown.
- Saved prompts carry no theme, text/unit, or grade-band metadata, so those filters exclude them rather than matching a missing value.
- Saves are scoped to the assignment type they were made from; another assignment type's library never shows them.
