# Thesis-Driven Essay decks (hybrid)

New versions of Brian's Teacher Training slide decks for the Thesis-Driven
Essay, one lesson at a time. Each one keeps Brian's slides and words, and
dresses them in a hybrid look:

- **From the lesson planner's YAWP! tile template (PR #437):** a cream page,
  raised paper tiles, a mono eyebrow over a serif title, and the small YAWP!
  wordmark and slide number at the foot.
- **From Brian's original decks:** his teal, sunshine, coral, orange and pink;
  white line icons in coloured bubbles; confetti dots; yellow highlighter on
  the words that matter.

New in every deck: speaker notes on every slide, drawn from Brian's lesson
plan and training video, and current screenshots of the YAWP! app.

| Lesson | Deck | Preview |
| --- | --- | --- |
| 2 · Pre-Writing | [`lesson-2-pre-writing.pptx`](lesson-2-pre-writing.pptx) | [`lesson-2-pre-writing-preview.jpg`](lesson-2-pre-writing-preview.jpg) |

## Rebuilding

The decks are generated, so edit the source, not the `.pptx`:

```bash
cd services/web-app
bun scripts/thesis-essay-decks/build.ts
bun test scripts/thesis-essay-decks
```

- Slide content: `services/web-app/scripts/thesis-essay-decks/prewriting-deck.ts`
- Layouts: `render-hybrid-deck.ts`; colours and fonts: `hybrid-theme.ts`
- Images and icons: `assets/` (icons have SVG sources next to their PNGs)

The preview image is rendered with LibreOffice, which swaps Georgia for a
wider serif, so lines wrap a little earlier there than in PowerPoint.
