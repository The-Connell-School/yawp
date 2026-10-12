# Thesis-Driven Essay decks (hybrid)

New versions of all seven of Brian's Teacher Training slide decks for the
Thesis-Driven Essay. Each keeps every one of Brian's slides and his words,
in a hybrid look:

- **From the lesson planner's YAWP! tile template (PR #437):** a cream page,
  raised paper tiles, a mono eyebrow over a serif title, and the small YAWP!
  wordmark and slide number at the foot.
- **From Brian's original decks:** his teal, sunshine, coral, orange and pink;
  white line icons in coloured bubbles; confetti dots; yellow highlighter on
  the words that matter.

New in every deck: speaker notes on every slide (from Brian's lesson plans and
training videos), and current screenshots of the YAWP! app on that lesson's
step.

| Lesson | Deck | Slides | Preview |
| --- | --- | ---: | --- |
| 1 · Introduce Students to YAWP! | [`lesson-1-day-1.pptx`](../../../services/web-app/resources/thesis-essay-decks/lesson-1-day-1.pptx) | 15 | [preview](lesson-1-day-1-preview.jpg) |
| 2 · Pre-Writing | [`lesson-2-pre-writing.pptx`](../../../services/web-app/resources/thesis-essay-decks/lesson-2-pre-writing.pptx) | 23 | [preview](lesson-2-pre-writing-preview.jpg) |
| 3 · Thesis Statement | [`lesson-3-thesis-statement.pptx`](../../../services/web-app/resources/thesis-essay-decks/lesson-3-thesis-statement.pptx) | 45 | [preview](lesson-3-thesis-statement-preview.jpg) |
| 4 · Introduction Paragraph | [`lesson-4-introduction.pptx`](../../../services/web-app/resources/thesis-essay-decks/lesson-4-introduction.pptx) | 24 | [preview](lesson-4-introduction-preview.jpg) |
| 5 · Body Paragraphs | [`lesson-5-body-paragraphs.pptx`](../../../services/web-app/resources/thesis-essay-decks/lesson-5-body-paragraphs.pptx) | 25 | [preview](lesson-5-body-paragraphs-preview.jpg) |
| 6 · Conclusion Paragraph | [`lesson-6-conclusion.pptx`](../../../services/web-app/resources/thesis-essay-decks/lesson-6-conclusion.pptx) | 28 | [preview](lesson-6-conclusion-preview.jpg) |
| 7 · Titles and Formatting | [`lesson-7-titles.pptx`](../../../services/web-app/resources/thesis-essay-decks/lesson-7-titles.pptx) | 21 | [preview](lesson-7-titles-preview.jpg) |

Slide counts include Brian's slides plus the new app screenshots (one per
lesson; Lesson 1's sign-up screenshot became three slides of today's join
flow). The plan and decisions behind them are in [PLAN.md](PLAN.md).

## In the app

With the `thesis_essay_decks` flag on, the Thesis-Driven Essay's page offers
each deck inside its step in **Modules** (Pre-writing → Lesson 2, Thesis
Statement → Lesson 3, …), with Day 1's deck above the list. Teachers only;
downloads come from `/api/thesis-essay-deck/:slug`. With the flag off the page
is unchanged.

## Rebuilding

The decks are generated, so edit the source, not the `.pptx`:

```bash
cd services/web-app
bun scripts/thesis-essay-decks/build.ts          # all decks
bun scripts/thesis-essay-decks/build.ts "" lesson-3-thesis-statement
bun test scripts/thesis-essay-decks
```

- Content, one file per lesson: `scripts/thesis-essay-decks/*-deck.ts`
- Shared pieces (review quiz, conclusion structure, house analogy, sample essay):
  `shared-slides.ts`, `sample-essay.ts`
- Layouts: `render-hybrid-deck.ts`; colours and fonts: `hybrid-theme.ts`
- Images and icons: `assets/` (icons have SVG sources next to their PNGs)

The previews are rendered with LibreOffice, which swaps Georgia for a wider
serif, so lines wrap a little earlier there than in PowerPoint.
