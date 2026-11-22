# Lesson Planner test-and-review brief

You are testing Yawp!'s Lesson Planner, an AI tool that plans high school
English lessons (a lesson plan in chat, a "stack" that is the teacher's
run of show, student handouts, and a slide deck). It runs live on a PR
preview. You will run real planner requests, capture everything they
produce, then review each lesson as a demanding, experienced high school
English department chair would: rigorously, specifically, with evidence.
Be fair; praise what is genuinely good. Do not soften real problems.

All paths below are absolute. `CAP=/tmp/claude-0/-home-user-yawp/7190eb60-e4b8-57dd-a60c-4c9a3ff6fa16/scratchpad/cap`.

## 1. Running one lesson (about 4 to 8 minutes)

```bash
cd $CAP && WHO=<your login> MSG="<the request>" OUT=$CAP/<id> HANDOUT=<0 or 1> timeout 1000 node lesson-test.cjs; ./render.sh $CAP/<id>; python3 tiles.py $CAP/<id>
```

Run the command in the foreground with a long timeout (at least 1,100,000 ms)
and run your lessons one after another, never two at once. Use only your
assigned login. `HANDOUT=1` also asks the planner for the student handout
after the lesson. If `log.txt` says `NO REPLY` or `ERROR`, or the run times
out, run that lesson once more with a new id (`<id>b`); if it fails again,
report the failure as a finding, with what `log.txt` and `failed.png` show.

What you get in `$CAP/<id>/`:
- `tiles/1-reply-NN.png`: the planner's lesson plan as the teacher sees it, in pieces, top to bottom.
- `tiles/2-reply-with-handout-NN.png`: the same, after the handout was asked for (if `HANDOUT=1`).
- `tiles/3-stack-NN.png`: the stack (the teacher's run of show, timing, writing share, printing).
- `sheet-slides.png`: every slide of the deck with its speaker notes (from the slides PDF).
- `sheet-handouts.png`: the student handouts PDF, page by page.
- `sheet-plan.png`: the printable lesson plan PDF.
- `pages-*.png`: single pages at higher resolution, when you need to read small print.
- `reply1.ndjson` (and `reply2.ndjson`): the raw reply text, if you need exact wording or quotations.
- `log.txt`, `meta.json`: timing and what happened.

Read every image before you judge. Do not judge from file names or logs.
Note: the test script clicks "Add everything to the lesson", which adds
every alternative the planner offered (all class-starter options, all exit
tickets) to the stack. Judge the stack's timing with that in mind, and say
whether that button's behaviour is itself a problem for a teacher.

## 2. The standards to review against

These come from Kevin (the product's English-teacher founder) and Brian (a
veteran teacher reviewing the product). Cite them by code.

**Kevin's rules for slides and lessons (R1 to R13):**
- R1 Think like an English teacher: a context day equips students to read this particular book (where, when, who, which words, what it looked like).
- R2 Show where on a map, starting from what students know (world, then country, then place).
- R3 Show when on a timeline, never a list of dates.
- R4 Show who: real people get their faces; main characters introduced by name before students meet them.
- R5 Define the words a student of this grade may not know, on screen, at or before first use.
- R6 Pictures from the subject's world, not decorative metaphors; no image used over and over.
- R7 Every content slide has something to look at (map, timeline, picture, document, chart); routine slides (Write, Talk, Exit) may be words only.
- R8 Connect the history or context to the book on screen (name its characters and places beside it).
- R9 No reading slide without the reading: a passage students annotate is on the slide, or the slide says exactly where to find it.
- R10 When something can't be supplied (a film still, a copyrighted passage), leave a labeled slot and say so; never substitute quietly.
- R11 Facts, dates, names and quotations must be exactly right; every picture credited.
- R12 The arc of a lesson. (1) Open on the theme in the students' own experience (always on day 1 of a unit, mostly in lessons; mid-unit may open by recalling earlier work). (2) At the start of a unit, find out what they know, briefly. (3) Then teach directly: short, punchy pieces, with key terms. (4) Then tie the text to the opening thematic question: students weigh in, and the text's treatment is set beside what they said, with individual think/write time, peer discussion, and teacher instruction.
- R13 Dual coding: every slide that teaches content pairs its words with a picture of the thing itself (not a mood).

**Brian's points:** offer options, never prescribe ("if you like..."); give framing choices; three exit-ticket options (check understanding, explain a term, ask a question); no rabbit holes; a deck's minutes must add up to the lesson; names and quotations exactly right; expert, kind, on the teacher's side; plans end with one closing question.

**Yawp!'s own values:** students write a lot (the stack shows "N% of class is writing"); the class starter and exit ticket are Yawp! writing assignments; materials are ready to print and use (student-facing language, room to write).

**General learning principles you may also cite:** clear objective and alignment (the task and the exit ticket measure the objective); cognitive load (one idea at a time, no walls of text on slides); retrieval practice; checking for understanding during the lesson; worked examples and modeling (the teacher shows how before students try: I do, we do, you do); scaffolding and access (sentence frames, vocabulary support, chunked text for struggling readers and English learners); close reading of short passages; discussion that requires evidence from the text; spacing and connection to the unit.

## 3. The review, for each lesson

Write `$CAP/<id>/assessment.md` with exactly these parts:

1. **The request** (quote it) and **what came back** (one paragraph: the plan's parts and minutes, the deck's slide count, the handout, the stack's total minutes and writing share).
2. **Scores**, 1 to 4 (1 = would not use, 2 = needs major work, 3 = usable with edits, 4 = would use tomorrow as is), each with one or two sentences of evidence (name the slide number, handout page, or plan step):
   - A. Lesson arc (R12)
   - B. The text at the center (real passages, accurate, close reading that is specific) (R9, R11)
   - C. Direct instruction: accurate, short, key terms defined (R5, R11)
   - D. Visuals and dual coding (R2, R3, R4, R6, R7, R13)
   - E. Writing: amount and quality; starter and exit ticket aligned to the objective
   - F. Checking for understanding during the lesson
   - G. Feasibility: timing adds up; deck minutes match; materials ready to use
   - H. Teacher usability: options not prescriptions; speaker notes useful; stack coherent
   - I. Access: scaffolds for struggling readers and English learners
   - **Overall**: would a strong English teacher use this tomorrow?
3. **Strengths** (up to three, specific).
4. **Problems** (the five most important, most serious first). For each: what it is, where (slide, page, step), why it matters for students, and the principle it breaks (by code or name).
5. **Factual or quotation errors** you found (check quotations and facts against your own knowledge of the text; say "none found" if none, and say how confident you are).
6. **Fixes** (three to five concrete changes to the planner, not to this one lesson, that would have prevented the problems; tag each with its principle).

Then append one line of JSON to `$CAP/scores.jsonl`:
`{"id": "<id>", "title": "<short title>", "kind": "lesson|context day|unit plan|writing lesson|poetry", "A": n, "B": n, "C": n, "D": n, "E": n, "F": n, "G": n, "H": n, "I": n, "overall": n, "slides": n, "pictures_on_slides": n, "minutes_planned": n, "writing_percent": n, "top_problem": "<one line>"}`
(use null for anything that does not apply, such as slides in a unit plan without a deck).

## 4. What to send back

When all your lessons are reviewed, reply with: the ids you ran, any that
failed and why, and for each lesson its overall score and its single most
important problem. Keep it short: the full reviews are in the files.
Do not change any code or files outside `$CAP/<your ids>/` and `scores.jsonl`.
