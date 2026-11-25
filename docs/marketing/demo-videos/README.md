# Yawp! marketing demo videos

Short (20–30 second) silent demos of Yawp! features, recorded from the real app
with demo data, for marketing. Each is 1920x1080, 30fps H.264, with a poster
frame (`.jpg`) next to it.

| Video | Length | What it shows |
| --- | --- | --- |
| `tutor.mp4` | 22s | A student asks the Tutor if her thesis is strong enough; the Tutor answers with questions, and she rewrites the thesis herself. |
| `grading-assistant.mp4` | 21s | A teacher opens an essay, the Grading Assistant scores it on the rubric and drafts feedback, and the teacher edits it before saving. |
| `lesson-planner.mp4` | 24s | A timed lesson plan for *The Things They Carried*, its run of show, and the slide deck in presentation mode. |

All three open on a title card and close on "Yawp! Writing that stays human. /
yawp.school".

## Captions

**Tutor:** "A writing tutor that never writes it for them." · Students draft
their essays in Yawp! · Stuck? They ask the Tutor. · It asks the questions a
great teacher would… · …so the thinking, and the writing, stay theirs.

**Grading Assistant:** "Feedback on every essay, in seconds." · Open a
student's essay. · One click: the Grading Assistant scores it against your
rubric… · …and drafts specific, encouraging feedback. · You stay in charge:
edit anything, then release it.

**Lesson Planner:** "Tomorrow's lesson, planned in minutes." · Tell it the
class, the text and the time you have. · Get a complete, timed lesson plan,
step by step. · Every minute accounted for, ready to adjust. · And a slide
deck, ready to present.

## What is scripted

The screens are the real app. The demo data is invented (student "Maya Torres",
teacher "Ms. Rivera", English 10). The recording environment has no AI model,
so the AI's words are scripted to match what the product does: the Tutor's
reply, and the Grading Assistant's comments. The rubric scores are the
Grading Assistant's test fixture.

## Re-recording

The recorder is `services/web-app/e2e/tools/record-marketing-demos.ts`. With
the e2e dev server up on :5173 (see `services/web-app/playwright.config.ts`):

```bash
cd services/web-app
bunx playwright test -c playwright.marketing-demos.config.ts
```

`MARKETING_DEMOS_ONLY=tutor,lesson-planner` records just those. Captions,
title cards and scripted AI text are at the top of the recorder. Add a new
demo by adding another block to the test.
