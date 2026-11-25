# Yawp! marketing demo videos

Short (20–30 second) silent demos of Yawp! features, recorded from the real app
with demo data, for marketing. Each is 1920x1080, 30fps H.264, with a poster
frame (`.jpg`) next to it.

Thirteen videos, in the order of the catalog (`../Yawp-Feature-Demos.pdf`):

| # | Video | Length | What it shows |
| --- | --- | --- | --- |
| 01 | `tutor.mp4` | 23s | Maya clicks **Give me feedback!** on Body Paragraphs; the Tutor says what works and asks what her quotation reveals, and she adds her own analysis. |
| 02 | `pre-writing.mp4` | 20s | A messy pre-write; the Tutor pushes her thinking until she names a focus. |
| 03 | `thesis-builder.mp4` | 23s | The Thesis Statement step: the lesson, feedback on her observation and analysis, then her thesis. |
| 04 | `student-feedback.mp4` | 21s | The student's released grade: rubric, margin comments, grammar notes, then **Revise with feedback**. |
| 05 | `class-starter.mp4` | 24s | The 200-prompt library, then a teacher-written warm-up sent to the class. |
| 06 | `prompt-library.mp4` | 21s | Searching the essay prompt library; a prompt opens the assignment sheet pre-filled. |
| 07 | `exit-ticket.mp4` | 23s | Check for understanding: name the concept, and Yawp! writes the question. |
| 08 | `writing-practice.mp4` | 21s | A grammar lesson, then mixing skills into a practice set for the class. |
| 09 | `grading-assistant.mp4` | 26s | Rubric scores, feedback, and purple grammar highlights on a full essay; the teacher edits and saves. |
| 10 | `margin-comments.mp4` | 21s | Highlight a sentence, leave a comment beside it. |
| 11 | `grading-workflow.mp4` | 20s | Needs Grading / Graded / Released / In Progress, then next-student arrows. |
| 12 | `class-summary.mp4` | 20s | Class performance summary: strengths and gaps by rubric skill, student examples, next steps. |
| 13 | `reporter.mp4` | 23s | Reporter answers **Who needs attention?** with students, reasons, and a next step. |

All of them open on a title card and close on "Yawp! Writing that stays human. /
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

The data is invented: a demo English 10 class (Ms. Rivera, student Maya Torres,
and seventeen classmates) built by `services/web-app/e2e/tools/marketing-demo-world.ts`,
whose Gatsby essays quote the novel accurately. The recording environment has no AI
model, so the AI's words are scripted to match what each feature does: the
Tutor's reply, the Grading Assistant's comments and grammar issues, and
Reporter's report. The rubric scores are the Grading Assistant's test fixture. The
class performance summary is the app's own (fixture-mode) summary of the demo grades.

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

## The catalog

`../Yawp-Feature-Demos.pdf` lists every video with a still, a description, and
Watch / Download links to copies in Google Drive. `../build-demo-catalog.py`
writes its HTML (the Drive file ids are in it); Chromium prints it to PDF.
