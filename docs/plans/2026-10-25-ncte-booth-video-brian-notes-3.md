# NCTE Booth Video: Brian's notes on version 4

Brian's third round of notes (Oct 25), on version 4 of the booth video. One
plan per note. All changes are to the recorder in
`services/web-app/scripts/booth-video/`; the app itself does not change.

## 1. The tutor's real refusal

**Note.** When Maya asks the tutor to write her thesis, use the tutor's actual
response ("I'm not that kind of guy, and anyway…"). The current reply sounds
very AI.

**Plan.**
- The line lives in the tutor's system prompt
  (`packages/prisma/scripts/universal-tutor-block.ts`, "THE ONE RULE"). The
  scripted reply now opens with it word for word: "I'm not that kind of guy!
  And anyway, the whole point is for YOU to figure out and share what YOU
  think. I know it isn't always easy, but if you take a little time, you can
  do great work."
- Then, as the same rule tells the tutor to, it scaffolds instead of writing:
  one sentence starter for Maya to finish.
- The callout under it changes to match: it won't write for her; it hands her
  a sentence starter and she finishes it.

## 2. Grammar and syntax highlights in grading

**Note.** Show the purple grammar and syntax highlights in the grading scene.

**Plan.**
- The Grading Assistant's grammar check returns four issues instead of one (the
  comma splice, a missing serial comma, and two style notes), each quoting
  Maya's essay exactly so the app can mark it.
- After the assistant runs, a callout lands on the purple marks in the essay
  ("Grammar and syntax, marked in the essay"), the cursor rests on one so its
  note pops up, and the Grammar/Syntax category opens to show the list, where
  the teacher can hide or remove any of them.

## 3. A better green for Revision

**Note.** The green on Part 4's title card and its highlight box is unattractive.

**Plan.** Replace the stack's olive green with a clear emerald for Part 4 only:
accent `#2E9E6B`, ground `#D7F0E3`, text `#17603F`. The title card, the
highlight ring, the callout tab and the chapter pill all take it. The other
sections keep the stack palette.

## 4. A Reporter scene

**Note.** Run a growth report on one student (Maya), with captions: "Run a
report on anything: a class, a student, an assignment, a skill." / "Run one
before a parent-teacher conference or a meeting with your principal." / "At
the end of a marking period, give students their own growth report." / "At the
end of the year, pass class reports to next year's teachers."

**Plan.**
- New Part 8, "Reports on growth," after Writing practice: the story zooms out
  from one assignment to the year, which leads into the closing cards.
- Ms. Rivera opens Reporter from the sidebar. The starter tiles show (caption
  1), she types "Growth report for Maya Thompson", and the report comes back in
  the Reporter's own format: a short read, a table of her essays since
  September (one of them a cold write with the tutor off), "The Writing", and
  "Suggested Next Steps".
- Captions 2–4 run while the report scrolls; a callout on the table ("Growth,
  essay by essay") and one on Print / Save as PDF ("Share it") anchor them.
- The report is scripted like every other model reply. Its numbers match
  Maya's story in the video (her Fahrenheit 451 essay is the latest row).

## 5. Three closing cards

**Note.** Replace the end with three cards.

**Plan.**
- Card 1, the stack, one line at a time:
  - For students: a tutor that guides and never writes
  - For teachers: a TA on every draft, a grading assistant, a class analyst,
    a lesson planner
  - For schools and districts: real-time data on how students are growing as
    writers
- Card 2, the punchline: "It won't write for your students, but it'll help you
  with everything else."
- Card 3, two QR codes: "Sign up free" and "Book a demo for your school or
  district", with yawp.school and the one-line disclosure. Until Brian sends
  the codes, each slot is a labeled placeholder. To drop them in, set
  `CLOSING_QR[n].image` in `copy.mjs` to the PNG's path and re-render.
- All three stay on the pine ground with the stack stripe, so the loop returns
  cleanly to the opening card.

## Follow-ups (not changes to the video)

- Length: the new Reporter part and the closing cards add about a minute
  (version 4 ran 6:17). If the booth needs it nearer 5 minutes, the easiest
  cuts are the slide deck's last two slides and the writing practice part.
- The QR codes, before the conference.

## Order of work

1. Copy: refusal, grammar issues, Reporter report and captions, closing lines.
2. Cards: emerald for Part 4, the three closing cards.
3. Recorder: grammar beat in grading, the Reporter part, the closing cards.
4. Full re-record against the Lesson Planner branch, frame QA, republish to
   the same download link.
