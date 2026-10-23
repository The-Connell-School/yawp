# NCTE Booth Video: Brian's notes on the first cut

Brian's feedback on the first cut (`2026-10-22-ncte-booth-video.md`), one plan per
actionable note. Everything is a change to `services/web-app/scripts/booth-video/`
(the recording) unless it says otherwise; the app itself does not change.

## 1. Hand-off from "sent" to Maya

**Note.** After the assignment is created, the video visits Maya's dashboard
without showing the assignment, then jumps into her document. "Every student
gets a document with the tutor built in" belongs where we see her open it.

**Plan.**
- Section 1 ends on the teacher's class page with the new assignment listed and
  one caption: "Sent to every student in the class."
- Section 2 opens on Maya's class page with the assignment card in view. She
  clicks it; as her document and the tutor appear, the caption reads "Every
  student gets their own document, with the tutor built in."
- Drop the student-dashboard shot.

## 2. The tutor through every step, as a time-lapse

**Note.** When Maya drafts the essay, show the tutor moving through its steps
(thesis statement, introduction, body paragraphs…) in a quick mini-scene, with a
voiceover like "As the classroom teacher teaches each step, the tutor supports
the student through the process." The essay appears; no typing shown per step.

**Plan.**
- After the refusal, a new shot: the tutor's module header advances Thesis
  Statement → Introduction Paragraph → Body Paragraphs → Conclusion Paragraph →
  Title Your Essay, about three seconds each, each module's own tutor
  instructions visible.
- At each module the matching part of the essay appears (thesis sentence, the
  introduction around it, the body paragraphs, the conclusion, the title), as a
  time-lapse with the "Time-lapse" badge.
- Caption: "As you teach each step, the tutor supports students through it."
- Then the existing finish-and-submit shot.

## 3. Grading starts from "To grade"

**Note.** Don't open grading from the assignment page, where the Class Summary
is the main feature. Start at the dashboard's grading block and click into the
essay.

**Plan.**
- Section 3 opens on the teacher dashboard; a callout on the "To grade 1" block.
- Click it, then Maya's essay in the needs-grading list, which opens in the
  grading view. The rest of the grading beat is unchanged.
- Check the seed leaves exactly one essay to grade.

## 4. Lesson Planner: other ways to start

**Note.** Keep the "From your class summary" callout, then scroll to the tiles
to show teachers can start planning from other places.

**Plan.**
- After the "From your class summary" callout, scroll to the starter tiles
  ("Or start from one of these") with a callout: "Or start somewhere else: a
  skill, a standard, a writing fundamental." Scroll back up and continue.

## 5. The new stack (run of show)

**Note.** Show the new, colorful stack and run of show. Highlights only:
- the teacher stays in control: drag to reorder, remove;
- it builds a slide deck;
- it creates the writing assignments in Yawp!;
- the lesson can be sent to an administrator or an absent student.

**Plan.**
- The new stack is in the Lesson Planner PR (The-Connell-School/yawp#437), behind
  flags that are off in production. The video records against that branch with
  its stack, share and deck-kit flags on in the booth database
  (`lesson_planner_stack_v2`, `_stack_v3`, `_stack_panel`, `_share`,
  `_run_show`, `_templates`, `_deck_v2`, `_deck_gallery`,
  `_plan_export_v2`). Intake v2 stays off so the hand-off from the Class
  Summary stays as Brian liked it. `run.sh` takes `BOOTH_APP_ROOT` to record
  against another checkout.
- The scripted plan follows that branch's reply format (one heading per step,
  minutes per step) so every step lands in the stack with its time.
- Stack beat, about 35 seconds:
  1. Add everything; open the stack: the run of show with its time bar.
  2. Drag one step to a new place; remove one, undo. Callout: "You stay in
     control. Drag, cut, reorder."
  3. Create in Yawp! on the exit ticket. Callout: "Writing steps become Yawp!
     assignments in one click."
  4. Build the slide deck; show it. Callout: "It builds the slide deck from
     your stack."
  5. Send this lesson; show the audiences (an administrator, a student who
     missed class). Callout: "Send it to an administrator or a student who
     was absent."
- If a step can't be shown reliably in this environment (for example email
  delivery), show the screen up to the send and say what's left out.

**Caveat for Brian.** These stack features aren't on for schools yet. If the
booth video shows them, they should be on in production (or on the demo site)
before NCTE, or visitors will look for something they can't find.

## 6. Color

**Note.** Tan and orange throughout feels monochrome. Use a brighter highlight
for callouts (from the new stack's palette), add some color to the title cards,
and the colorful stack itself will help.

**Plan.**
- Callouts and the spotlight ring take a bright accent from the stack v3 palette
  instead of the app's orange; the caption bar keeps its dark ground.
- Each section card gets its own accent color (bar, eyebrow, progress dot)
  drawn from the same palette, on the same light ground; the opening and closing
  cards get a colored accent too.

## Not a change to the video

- **A Loom on how the video creator works.** That's for Kevin to record. The
  README in `services/web-app/scripts/booth-video/` is the written version.

## Order of work

1. PR #437 worktree: bootstrap, flags, confirm the existing segments still run.
2. Notes 1, 2, 3, 4 and 6 in the recorder.
3. Note 5 (stack), once the branch's planner formats are mapped.
4. Full re-record, QA every frame, deliver v3 through the download page.
