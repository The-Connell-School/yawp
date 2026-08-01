# YAWP! brand reference

This file is the source of truth for how YAWP! is described in marketing
material. Edit it when positioning changes; do not improvise around it.

## What YAWP! is

YAWP! is a writing platform built for middle school, high school, and college
classrooms. Students learn a writing process, draft essays, and get real-time
feedback from the YAWP! tutor. Teachers use curriculum to teach proven lessons,
create writing assignments, and follow student progress in real time.

Source: the landing page (`services/web-app/app/routes/_index/route.tsx`). If
that copy changes, change this file too.

## Name and voice

- The product is **YAWP!** — all caps, exclamation point included, every time.
- The name comes from Whitman: *"I sound my barbaric yawp over the roofs of the
  world."* Tagline in use: **"Find your yawp, and learn how to make it heard."**
- Voice: plain, teacherly, unhurried. Short sentences. Concrete nouns.
- Write like a department chair explaining a tool to a colleague, not like a
  vendor. No "revolutionize," "unleash," "supercharge," "game-changing."
- Say what a teacher or student actually does, and what they get back.
- Humor is allowed and should be dry. Never at a teacher's or student's expense.

## Audiences

| Audience | Cares about | Lead with |
|---|---|---|
| ELA teacher | Time spent grading, feedback that students read | The work of one class, start to finish |
| Department chair / curriculum lead | Consistency across sections, rubric alignment, PD | Shared assignment types, rubrics, teacher training |
| School or district admin | Adoption, rollout, student data safety | Fits existing classes; nothing to install |
| Student | Not losing work, knowing what is expected | The editor and the feedback they get back |

## Claim rules

- **Show it or cut it.** Every capability claim must be visible in the capture
  that accompanies it.
- **No invented numbers.** No "saves teachers 5 hours a week," no percentages,
  no adoption counts, no test-score claims, unless the user supplies the source.
- **No named schools, districts, teachers, or students** without explicit
  permission from the user. Seeded personas are fictional and safe.
- **No competitor comparisons by name** unless the user asks for them.
- **AI language stays modest.** The product has an AI tutor and AI-assisted
  grading. Describe them as a first read and a drafting coach that a teacher
  reviews — never as replacing teacher judgment or as an autograder.
- **Feature-flagged and in-progress work is not marketable.** Check
  `docs/STATUS.md` before describing something as shipped.
- Accessibility is a real strength of the app (there is a dedicated
  `/accessibility` page and axe coverage in e2e). It is fair to say the product
  is built with accessibility in mind. Do not claim a specific WCAG conformance
  level without confirming it in `docs/compliance`.

## Words that work

process, draft, revise, feedback, rubric, class, assignment, tutor, progress,
in one place, on the sentence, before the deadline

## Words to avoid

leverage, seamless, robust, cutting-edge, effortless, 10x, disrupt, empower
(overused), "AI-powered" as a standalone claim

## Visual conventions

- Capture at 1440×900 unless a surface needs otherwise. Use
  `deviceScaleFactor: 2` for stills that will be shown large.
- No browser chrome in stills; the runner records the viewport only.
- Leave loading spinners and empty states out of the final cut.
- Narration voice default is Kokoro `af_sarah` at speed 1.08. Keep one voice
  across a campaign so clips can be cut together.
