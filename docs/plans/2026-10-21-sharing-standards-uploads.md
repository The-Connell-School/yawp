# Sharing, standards and teacher uploads (Oct 21 review notes)

Source: Kevin's and Brian's notes on classroom materials, sharing and
standards alignment (Oct 21). Kevin added one feature: teachers upload their
own documents so the planner builds from their source material.

## The notes, as action items

| # | Note | What it means for the build | Status before |
| --- | --- | --- | --- |
| S1 | Take it to class: plan, deck, handouts, packet; post a lesson and choose what the link opens | Keep | Built |
| S2 | The deck uses the new branding | The Lesson Deck Kit (flag `lesson_planner_deck_gallery`) | Built, flag on in previews |
| S3 | Remove slide numbers: teachers edit and delete slides, so numbers go wrong | Take numbers off the slide face in every template. The presenter's "3 / 9" counter is not on the slide and stays | Tile template prints a number on every slide, in Present and PowerPoint |
| S4 | No LMS integration shown as working unless it works. Signing in with Google does not connect Classroom | No Canvas or Schoology buttons that only copy a link. Classroom and Teams are their own public share pages: say so, and that Google may ask which account | Canvas and Schoology pills; "Share to Google Classroom" is the main button |
| S5 | Simplest first: a link to copy into Classroom or anywhere | Copy link is the main action | Copy link is a small pill |
| S6 | Sending into LMSs directly: later, not for the free tier | Nothing now; noted | — |
| S7 | Send this lesson: sub, student, family | Keep | Built |
| S8 | Family: plain-language what we did and why, plus suggestions for talking about it at dinner | Two or three dinner conversation starters, not one question | One question |
| S9 | Admin: formal plan and standards; invite to observe; only claims the product can back up | Standards only when the teacher named them (never inferred); an "Invite to observe" option | The "Standards" box does nothing; no observe option |
| T1 | A standard the teacher names should shape the lesson, not just be mentioned | Planner rule: objective, a step that does the standard's work, and a check that measures it, each saying so | Planner may only mention it |
| T2 | Unit map should connect to the reading schedule (what is read, in class or at home, and how it supports the day) | A `reading` line on every day of the map, shown on the board | No reading field |
| T3 | The first unit map glitched | A map with one overlong cell is rejected whole. Trim long cells instead of losing the map | Overlong cell fails the map |
| T4 | A lot of material can be unwieldy without direction | Lean by default: the steps and only the material the lesson cannot run without; offer the rest | Planner builds everything |
| T5 | A sticky-note check is a check for understanding, not an exit ticket | Planner rule, and never offer "Create this exit ticket" for one | Not addressed |
| T6 | Reverse-engineer standards from a lesson ("See which Common Core standards are present in this lesson") | Not built now: needs the Common Core ELA 7–12 text in the knowledge base and the detailed-vs-pared-down comparison first. Wording settled. See "Standards experiment" | — |
| T7 | State standards, perhaps at onboarding | Later; never claim state alignment before it exists | — |
| U1 | Teachers upload documents so their source material informs the planner | New, flag `lesson_planner_uploads` | — |

## Decisions

- **Standards are only what the teacher named.** They are read from the
  teacher's own messages: Common Core codes (RL.9-10.1, W.11-12.2,
  CCSS.ELA-LITERACY.…) and text they gave as a standard ("Standard: Cite
  strong and thorough textual evidence…"). They are never inferred. They
  fill the plan's Standards section (the box stays, for more) and the admin
  page's Standards. With none, the admin option says "Name a standard in
  the planner to include it" and is off.
- **Invite to observe** adds an invitation to the admin page and email: the
  lesson, the class, and the day when the teacher has set one. No calendar
  invite (that would need a calendar connection).
- **Uploads store the text, not the file.** Simpler and smaller, and nothing
  a teacher uploads is served back to anyone. PDF (text, not scans), Word,
  PowerPoint, plain text and Markdown, up to 10 MB each, 10 per lesson. The
  planner sees each document's opening in the prompt and reads the rest
  with a tool. Uploaded text is the teacher's source material, never
  instructions to the planner.
- **PDF text** comes from `unpdf` 1.8.1 (pdf.js, no dependencies). Word and
  PowerPoint use the app's own readers.

## The plan

Tests first in each step; one commit per change.

### Phase 1. Sharing
1. Post to your class: Copy link first; the Google Classroom and Teams share
   pages second, with honest copy; no Canvas or Schoology buttons (S4, S5).
2. Family: what we did and why, and two or three ways to talk about it at
   dinner (S8).
3. Admin: Standards from the teacher's own words, or off with a hint;
   Invite to observe (S9, T1).

### Phase 2. Decks
4. No slide numbers on the slide face in the tile template, in Present or
   PowerPoint (S3).

### Phase 3. Standards and planning
5. `teacher-standards.ts`: the standards a teacher named (T1, S9).
6. The plan's Standards section (classic and kit) lists them (T1).
7. Planner rules: a named standard shapes the lesson; never infer one; lean
   by default; sticky-note checks are not exit tickets (T1, T4, T5).
8. Unit map: `reading` per day, shown on the board; overlong cells trimmed,
   not fatal (T2, T3).

### Phase 4. Teacher uploads (U1)
9. Migration: `LessonPlanUpload` (additive, with rollback).
10. `source-documents.server.ts`: text from PDF, Word, PowerPoint, text.
11. API: upload and remove, scoped to the teacher's lesson.
12. Planner: the documents in the prompt, and `read_uploaded_document`.
13. Chat: an attach button and a chip per document, with remove.
14. Flag, preview seed, guide, e2e.

### Phase 5. Ship
15. Full planner suites, typecheck, CI unit files, report, push, PR.

## Standards experiment (T6, not built)

1. Load the Common Core ELA standards for grades 7–12 (RL, RI, W, SL, L)
   from the official text into the knowledge base, with codes.
2. Take two lessons on the same text: a detailed one and a pared-down one.
   Ask the planner which standards each supports, citing the step that
   does the work.
3. Compare: which standards each turns up, whether the citations hold,
   and whether a teacher agrees. Ship "See which Common Core standards are
   present in this lesson" only if the results hold up. Keep the wording
   to Common Core, never "your state's standards".

## Status (Oct 21)

Steps 1–14 are done and on PR 437; step 15 is this report and the push.
Where the build differs from the plan:

- **Uploads before a lesson exists.** The plan had the first upload start
  the lesson. That would have let a lesson start without counting against
  the lesson quota, so instead an upload added before the first message
  waits (24 hours, in that tab) and the first message attaches it.
- **Long unit-map cells.** Only cells up to twice the limit are trimmed. A
  paragraph in a cell still fails the map, so the board never shows a wall
  of text.
- **"Paper instead"** (the before-class list, from earlier today) is still
  remembered per browser.
- **Not testable end to end:** the planner reading a document in a real
  turn. E2E stubs the model, so the e2e tests cover the upload, the chips,
  the errors and the request that carries the documents, and unit tests
  cover the prompt and the tool. Try it on the preview with a real chapter.
