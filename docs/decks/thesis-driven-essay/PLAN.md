# Thesis-Driven Essay decks: the map

Brian's Teacher Training course has **7 slide decks** for the Thesis-Driven
Essay, one per lesson (Lesson 8, "Review my Essay", is optional and has no
deck). Pre-Writing is done ([PR #452](https://github.com/The-Connell-School/yawp/pull/452)).
This is the map for the other six: what is in each one, what it needs, and
the order to do them in.

Sources for each lesson live in the Teacher Training module resources
(`packages/prisma/fixtures/prod-fidelity/teacher-training-module-resources.json`):
the `.pptx`, a lesson plan PDF (most lessons), and the transcript of Brian's
training video.

## The decks at a glance

| # | Lesson | Old deck | Slides | Review slides | New slides | Lesson plan | Video | Status |
| --- | --- | --- | ---: | ---: | ---: | --- | ---: | --- |
| 1 | Introduce Students to YAWP! | Day 1 Intro to YAWP! | 13 | 0 | 13 | Yes | 17 min | To do |
| 2 | Pre-Writing | Pre-Writing | 23 | 0 | 23 | Yes | 31 min | **Done** |
| 3 | Developing a Thesis Statement | How to Write a Thesis Statement | 44 | 6 | 38 | Yes | 20 min | To do |
| 4 | Introduction Paragraph | Introduction Paragraph | 23 | 8 | 15 | Yes | 17 min | To do |
| 5 | Body Paragraphs | Body Paragraphs | 24 | 10 | 14 | Yes | 25 min | To do |
| 6 | The Conclusion | Conclusion Paragraph | 27 | 12 | 15 | Yes | 13 min | To do |
| 7 | Titling Your Essay | Titles and Formatting | 20 | 14 | 6 | **No** | 8 min | To do |
| | **Remaining** | | **151** | **50** | **101** | | | |

"Review slides" are the quiz that opens Lessons 3 to 7 (next section). "New
slides" is what is actually new in each deck, counting its YAWP! title and
closer slides.

## The big finding: a third of the work is one quiz

Lessons 3 through 7 all open with the same cumulative review quiz. Each
question is two slides: the question, then the same slide with the answer
highlighted. Each lesson adds one question to the set, so the quiz grows
from 6 slides (Lesson 3) to 14 (Lesson 7, which Brian titles "Course
Review"). That is **50 of the 151 remaining slides**, and only **6 distinct
questions**:

| First appears | Question | Answer |
| --- | --- | --- |
| Lesson 3 | What's the best way to write an essay? | c) Develop my ideas into a thesis statement and build my essay around that |
| Lesson 3 | Critical thinking is best defined as: | a) Asking questions and seeking answers about a topic in order to develop a position on it |
| Lesson 3 | Which of the following is MOST TRUE about a good thesis statement? | c) It contains observation and analysis |
| Lesson 4 | Your introduction paragraph's MAIN function is to: | e) Welcome your reader into your discussion and state the thesis |
| Lesson 5 | Which of the following would probably NOT show up in your body paragraphs? | c) Your thesis statement |
| Lesson 6 | True or False: a good conclusion restates the thesis and main ideas. | False |

**Plan:** one `quiz` layout (question on a tile, lettered options, an
optional `answer` that highlights the right one), and one shared
`REVIEW_QUESTIONS` list. Each deck says how many questions it opens with,
and the generator writes the question/answer pairs. Write the six questions
once; every deck gets them for free, and Brian's wording stays the same
everywhere. The "Suggested Conclusion Structure" slide also repeats (Lessons
6 and 7), so it becomes a shared slide too.

## What the decks share

Beyond the quiz, the same pieces come back across the course, so they should
be built once:

| Shared piece | Used in |
| --- | --- |
| YAWP! title slide and YAWP! closer slide | Every deck |
| **Critical Essay Form** diagram (`critical-essay-form.png`, already in assets) | L1, L2, L3, L5 |
| **"Bored in the USA"** sample essay (by Haley, a student): the intro, body paragraphs and conclusion appear as slide text | L1 (read it), L4 (its intro is the "Rhetorical Question" example), L5 (body paragraphs), L6 (conclusion), L7 (its title) |
| The **running example thesis**: "When schools fail to prioritize creativity in teaching, school becomes boring for both students and teachers, resulting in a lack of shared motivation, excitement, and accomplishment." | L3 (built from observation + analysis), L4 (all four example intros end with it), L5 (broken into body paragraphs), L6 (its conclusion) |
| **"What are we doing here?"** (analyze, learn a process, write a lot) | L1 and L2 |
| **House analogy** (the essay is a house tour: neighborhood = intro, foyer = thesis, rooms = body paragraphs, back to the front door = conclusion). The slide is only a title; Brian tells it from memory. | L5, L6 |
| Brian's confetti, bubbles, highlighter | Every deck (already in the renderer) |

## Layouts

The Pre-Writing renderer has 13 layouts (title, section, statement, steps,
photo, quote, prompt, figure, compare, example, grid, timer, equation). The
remaining decks need **6 more**:

| New layout | For | Decks |
| --- | --- | --- |
| `quiz` | A review question with lettered options; `answer` highlights one | L3–L7 |
| `ordering` | A list to put in order, and the same list revealed in order (the "general to specific" opener) | L4 |
| `oa` | Observation on one tile, analysis points on another, and (optionally) the thesis they combine into underneath | L3 (slides 26–32) |
| `thesis-parts` | A thesis with each part highlighted in its own colour, and the parts listed as numbered body paragraphs | L5 (slides 17–18), L3 (slide 43) |
| `passage` | A long passage (a sample intro, body paragraph or conclusion) with the thesis in italics or highlighted, and a label | L1, L4, L5, L6 |
| `closer` | The YAWP! logo slide Brian ends most decks with | L3–L7 |

Everything else maps onto a layout that already exists.

## Deck by deck

### Lesson 1: Day 1 Intro to YAWP! (13 slides)

The first day: a game, who Brian is, what "yawp" means, a sample essay,
and signing up for the site. Brian's video is 17 min; the lesson plan is
one page.

| Old slides | Content | Hybrid layout |
| --- | --- | --- |
| 1 | YAWP! title | `title` |
| 2, 5 | 2 Truths and a Lie: the rules, Brian's three statements, then "Your turn" | `compare` (Truths / Lie) and `statement` |
| 3, 4 | "I am Brian Connell" with two personal photos (Brian and his twin as kids; Brian in the 1990s) | `photo`, **see question 1** |
| 6 | YAWP! divider | `section` |
| 7 | Whitman: "I sound my barbaric yawp over the roofs of the world." | `quote` |
| 8 | Why do we write? (three reasons) | `steps` |
| 9, 10 | Sample essay "Bored in the USA" and class discussion questions | `section` + `steps`, or `passage` for the intro |
| 11 | Critical Essay Form | `figure` (asset already exists) |
| 12 | What are we doing here? | `steps` (same slide as Pre-Writing 2) |
| 13 | Screenshot of the Welcome exercise in the old editor | `figure` with a **new screenshot** |

**Screenshots to take:** the sign-in page, "Create an account", the student
dashboard, and a new document in the "Welcome to YAWP!" course. The Student
Sign-up Process PDF in the resources shows the old flow (teacher class code,
email link); it needs checking against today's free-tier join flow before
we put it on a slide.

**Notes source:** lesson plan (4 steps) plus the video, which has the full
two-truths routine and the "why do we write" discussion.

### Lesson 3: How to Write a Thesis Statement (44 slides, 38 new)

The biggest deck and the heart of the course. After the quiz and an
elephant-photo warm-up, Brian defines observation, analysis, and how they
combine into a thesis; then a second half on cutting the verb "to be".

| Old slides | Content | Hybrid layout |
| --- | --- | --- |
| 1 | YAWP! title | `title` |
| 2–7 | Review quiz (3 questions) | `quiz` ×6 (shared) |
| 8, 9 | Elephant in a street in North Bengal: what do you see? then the caption | `photo` ×2 (same pattern as Pre-Writing's Fallen Man); new asset `elephant.png` |
| 10 | Quick review: what do we need before we can write? | `statement` |
| 11 | Critical Essay Form | `figure` |
| 12 | Great thesis statements lead to great essays | `statement` |
| 13 | All of your pre-writing… (narrowing) | `steps` or `statement` |
| 14 | "Develop a Thesis Statement" divider | `section` |
| 15, 16 | Focal point; wording your thesis (one sentence, O + A, specific) | `statement`, `steps` |
| 17–22 | "Observation": definition and three examples, then all three together | `statement`, `statement` ×3, `steps` |
| 23–25 | "So what?"; "analysis" definition | `statement` ×3 |
| 26–28 | Add analysis (observation + analysis points) ×3 | `oa` ×3 |
| 29 | Writing activity: write your own O + 2–4 points of A | `prompt` |
| 30–32 | Combine O & A to form a thesis ×3 | `oa` with thesis ×3 |
| 33 | Observation + Analysis = Complex Thesis | `equation` (already built) |
| 34, 35 | Don't start without a thesis; Thesis review (3 rules) | `statement`, `steps` |
| 36 | YAWP! divider (second half) | `section` |
| 37–40 | Avoid the verb "to be": example, change, before/after | `statement`, `example`, `compare` |
| 41–43 | But wait, there's more: weeding the garden; the thesis grows | `statement`, `example`, `thesis-parts` |
| 44 | WHOA, DID YOU SEE THAT? | `statement` |

**Screenshots to take:** the editor on the "Thesis Statement" step with an
observation and analysis points typed in, for the writing activity (slide
29), and the Tutor's feedback on a draft thesis if the local tutor can run.

**Notes source:** lesson plan (detailed, including the "revise wordy
theses after class" step) plus a 20-minute video.

### Lesson 4: Introduction Paragraph (23 slides, 15 new)

| Old slides | Content | Hybrid layout |
| --- | --- | --- |
| 1 | YAWP! title | `title` |
| 2–9 | Review quiz (4 questions) | `quiz` ×8 (shared) |
| 10, 11 | Put 7 terms in order (city, continent, …) and the reveal | `ordering` ×2 |
| 12, 13 | Put 5 sentences in order (Iron Man) and the reveal | `ordering` ×2 |
| 14 | Now that you have your thesis, you can begin | `section` |
| 15, 16 | "The Introduction": function (welcome the reader, prepare them for the thesis) | `section`, `statement` |
| 17 | Four introduction styles | `steps` (4 tiles) |
| 18–21 | Example intros: story, rhetorical question, quotation/fact, definition | `passage` ×4 |
| 22 | Writing activity: choose a style and begin | `prompt` |
| 23 | YAWP! closer | `closer` |

**Screenshots to take:** the editor on the "Introduction" step.

**Notes source:** lesson plan (with the "don't tell them the ordering
rule" trick and the first-person "I" policy note) plus the video.

### Lesson 5: Body Paragraphs (24 slides, 14 new)

| Old slides | Content | Hybrid layout |
| --- | --- | --- |
| 1 | YAWP! title | `title` |
| 2–11 | Review quiz (5 questions) | `quiz` ×10 (shared) |
| 12 | Critical Essay Form | `figure` |
| 13–15 | "Supporting Paragraphs" divider; everything must support the thesis; the thesis tells you where to go | `section`, `statement` ×2 |
| 16 | The example thesis | `quote` or `statement` |
| 17, 18 | Break your thesis into its parts; these become your body paragraphs | `thesis-parts` ×2 |
| 19 | Basic structure of a body paragraph (transition, topic sentence, support, conclusion) | `steps` or `grid` |
| 20 | "Read Sample Essay" divider | `section` |
| 21–23 | Sample essay intro + body 1, body 2, body 3 (with the thesis parts colour-coded) | `passage` ×3 |
| 24 | "House Analogy" divider | `section`, **see question 3** |

Also in the resources: a "Citing / Integrating Quotations" handout
(.docx). Not on any slide; worth a one-line pointer in the notes.

**Screenshots to take:** the editor on the "Body Paragraphs" step, ideally
with the Tutor's "break your thesis into parts" response visible.

**Notes source:** lesson plan (detailed, including the "not every thesis
has 3 parts, avoid teaching the 5-paragraph essay" warning) plus a 25-minute
video with the full house analogy.

### Lesson 6: Conclusion Paragraph (27 slides, 15 new)

| Old slides | Content | Hybrid layout |
| --- | --- | --- |
| 1 | YAWP! title | `title` |
| 2–13 | Review quiz (6 questions, ending with True/False and "FALSE!") | `quiz` ×12 (shared) |
| 14 | "Conclusion Paragraph" divider | `section` |
| 15, 16 | Myth: restate the thesis / Fact: that makes you seem like an alien | `compare` or `quote` ×2 (Brian used purple quote slides here) |
| 17 | Reassess the word: an ending; a deduction from available information | `steps` |
| 18, 19 | What deductions can you draw? If your essay is about a problem, discuss solutions | `statement` ×2 |
| 20, 21 | Pro-tip: begin with a rhetorical question; Haley's question | `statement` with sticker, `quote` |
| 22, 23 | "Perhaps…": the word, and the example | `statement`, `passage` |
| 24 | Suggested conclusion structure (5 steps) | `steps` (shared with L7) |
| 25 | The full sample conclusion | `passage` |
| 26 | "House Analogy" divider | `section` |
| 27 | YAWP! closer | `closer` |

**Screenshots to take:** the editor on the "Conclusion" step.

**Notes source:** lesson plan (short) plus the video, which has the
"graceful exit" half of the house analogy.

### Lesson 7: Titles and Formatting (20 slides, 6 new)

The smallest amount of new content, but the whole quiz.

| Old slides | Content | Hybrid layout |
| --- | --- | --- |
| 1 | YAWP! title | `title` |
| 2 | "Course Review" divider | `section` |
| 3–14 | Review quiz (all 6 questions) | `quiz` ×12 (shared) |
| 15 | Suggested conclusion structure | `steps` (shared with L6) |
| 16 | "Titling Your Essay" divider | `section` |
| 17, 18 | Give your essay a title: the colon-title, three examples, how the two halves work | `statement` + `steps` (one tile per example title) |
| 19 | "Putting it All Together" divider | `section` |
| 20 | Finishing touches: clean up, title, formatting (12pt, left-aligned, single-spaced, space between paragraphs) | `steps` or `grid`, **see question 4** |

**No lesson plan exists for this lesson.** Notes would come from the
8-minute video only (which covers titles well: "the cherry on top", "never
'English Essay' or 'My Paper'").

**Screenshots to take:** a finished essay in the editor with a centered,
italic title, and the Submit button.

## Order and sizing

Do them in course order, so each deck can reuse what the previous one
built:

| Order | Deck | Size | Why |
| --- | --- | --- | --- |
| 1 | **Lesson 3: Thesis Statement** | Large | Most new slides (38) and 3 new layouts (`quiz`, `oa`, `thesis-parts`). Once the quiz exists, every later deck is smaller. |
| 2 | **Lesson 4: Introduction** | Medium | 15 new slides; adds `ordering` and `passage`. |
| 3 | **Lesson 5: Body Paragraphs** | Medium | 14 new slides; reuses `thesis-parts` and `passage`. |
| 4 | **Lesson 6: Conclusion** | Small | 15 new slides, no new layouts. |
| 5 | **Lesson 7: Titles** | Small | 6 new slides, no new layouts, no lesson plan. |
| 6 | **Lesson 1: Day 1** | Small, but needs decisions | 13 slides, no quiz; waits on the questions below about Brian's photos and the sign-up flow. |

For scale: Pre-Writing (23 slides, the renderer built from scratch) was
the biggest single piece of work. Lesson 3 is about the same size again.
Lessons 4 to 7 together are roughly one more Pre-Writing. Lesson 1 is
quick once its questions are answered.

## Decisions (Kevin, 2026-10-12)

1. **Brian's personal slides** stay as they are. The speaker notes tell
   teachers to make their own version using Brian's as the model, or to
   delete the slide.
2. **Sign-up** shows the current free-tier join flow.
3. **House analogy** becomes a slide a teacher can actually use, not a
   title they have to tell from memory.
4. **Finishing touches** is written for the YAWP! editor, not Google Docs.
5. **One PR** for all seven decks (#452).

## Questions that were settled above

1. **Brian's personal slides (Lesson 1, slides 2–4).** "I am Brian Connell"
   with his childhood and 1990s photos, and his own two-truths-and-a-lie
   statements. Other teachers will present this deck. Options: (a) keep
   them as Brian's, since this is his training course; (b) make them a
   "Meet your teacher" template with placeholder photo tiles and a note
   telling the teacher to swap in their own. **Recommendation: (b)**, with
   Brian's version in the speaker notes as the example.
2. **The sign-up flow (Lesson 1, slide 13 and the Student Sign-up Process
   PDF).** The PDF describes the old flow (teacher class code like
   `PAYNE2`, email link). Which flow should the deck show: that one, or
   the current free-tier join link? Needs confirming before screenshots.
3. **House analogy (Lessons 5 and 6).** Brian's slide is only a title. Put
   his words from the video on the slide (neighborhood → foyer → rooms →
   back to the door), or keep it a title and leave the words in the notes?
   **Recommendation:** a `steps` slide with the four stops, words in notes.
4. **Finishing-touches formatting (Lesson 7, slide 20).** "12pt, black,
   left-aligned, single-spaced" reads like Google Docs instructions. Does
   it apply in the YAWP! editor, or should the slide say "delete your
   pre-writing, add a title, click Submit"?
5. **One PR per deck, or all in #452?** One PR per deck keeps each review
   small (one `.pptx`, one content file, maybe a layout or two). All in
   #452 keeps the generator in one place. **Recommendation:** one PR per
   deck, each branched from #452 until it merges.
