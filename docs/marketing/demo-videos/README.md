# Yawp! marketing demo videos

Short (20–30 second) silent demos of Yawp! features, recorded from the real app
with demo data, for marketing. Each is 1920x1080, 30fps H.264, with a poster
frame (`.jpg`) next to it.

| Video | Length | What it shows |
| --- | --- | --- |
| `tutor.mp4` | 23s | Maya is on the Body Paragraphs step of a thesis-driven essay. She clicks **Give me feedback!**; the Tutor praises what works and asks what her quotation reveals, and she adds her own analysis. |
| `grading-assistant.mp4` | 26s | A teacher opens Maya's full five-paragraph essay and clicks the Grading Assistant: rubric scores, overall feedback, and purple grammar highlights. Hovering shows why each one is flagged; a rubric criterion shows its comment; the teacher edits and saves. |
| `reporter.mp4` | 23s | In Yawp Reporter the teacher picks **Who needs attention?** and gets the students who are slipping, why (quoting the teacher's own comments), and a next step. |

All three open on a title card and close on "Yawp! Writing that stays human. /
yawp.school".

## Captions

**Tutor:** "A writing tutor that never writes it for them." · The Tutor walks
students through every step of the essay. · When they want feedback, they ask
for it. · It points out what's working, and asks the questions a great teacher
would. · The thinking, and the writing, stay theirs.

**Grading Assistant:** "Feedback on every essay, in seconds." · Open a
student's essay. One click on the Grading Assistant… · …scores it against your
rubric, drafts feedback, and marks every grammar slip. · Hover any highlight to
see what's wrong, and why. · Every rubric score comes with a reason. · You stay
in charge: edit anything, then release it.

**Reporter:** "Know who needs you, before report cards do." · Ask about your
classes in plain language. · Reporter reads every grade and comment you've
released… · …and tells you who's slipping, and why. · With a next step you can
use tomorrow.

## What is real and what is scripted

The screens are the real app, set up the way production is: the original
document editor (the `document-editor-v2` flag off) and the production
Thesis-Driven Essay Tutor steps and buttons (from
`packages/prisma/fixtures/prod-fidelity`).

The data is invented: student "Maya Torres", teacher "Ms. Rivera", English 10,
and the students in the Reporter answer. The recording environment has no AI
model, so the AI's words are scripted to match what each feature does: the
Tutor's reply, the Grading Assistant's comments and grammar issues, and
Reporter's report. The rubric scores are the Grading Assistant's test fixture.

## Re-recording

The recorder is `services/web-app/e2e/tools/record-marketing-demos.ts`. With
the e2e dev server up on :5173 (see `services/web-app/playwright.config.ts`):

```bash
cd services/web-app
bunx playwright test -c playwright.marketing-demos.config.ts
```

`MARKETING_DEMOS_ONLY=tutor,reporter` records just those. Captions, title
cards and scripted AI text are in the recorder. Add a new demo by adding
another block to the test.
