# Lesson Deck Kit v3, the lesson plan spec, and handouts

Source: Brian's emails of Oct 21 and `YAWP_Lesson_Deck_Kit-2.pdf` (Deck spec v3,
Lesson plan spec v1, the Color, Type and Art boards, and the example deck).
The kit's canvas link and its `lesson-plan/` folder (`lessonplan.js`,
`body.spec.js`) sit in another organization and could not be opened from
this session. The PDF carries the full spec, including the plan's data
model, so the generator here is built from that.

Builds on the gallery deck from Oct 20
([`2026-10-20-lesson-planner-brian-run-3-report.md`](./2026-10-20-lesson-planner-brian-run-3-report.md)),
which implemented spec v1.

## Brian's notes, organized

### A. Slide decks (Deck spec v3)

| # | What changed | Where it lands |
| --- | --- | --- |
| A1 | **Georgia + Arial only.** Georgia is never bold; size and italic carry the hierarchy. They ship with PowerPoint and appear in Google Slides, so a deck moves between them without reflowing. | Present, Run the show, the deck editor and PowerPoint |
| A2 | **Type scale.** Title 112px (84pt), section 78, headline 51–54, prompt 46–68 by length, mode 34–37 italic, numerals 82 (steps) / 37 (years) / 27 italic (agenda), body Arial 23–27, detail 18–21 stone, chip Arial bold 17 in a 1.5px pill, running head Arial bold caps 13 +16%. pt = px × 0.75. | Same |
| A3 | **Prompt sizing.** 12 words or fewer at 68px, up to 24 at 54, up to 40 at 46; over 40, split the slide. | Renderers and planner rules |
| A4 | **Deck colors.** Two or three per deck, sampled from its painting, each darkened to at least 4.5:1 on paper. The first is the primary (theme accent and the accent wall). Mode words and accents rotate through them, and color can code parts (the three parts of a thesis). Deck colors are for type 24px and up, numerals, rules and color coding; never body text. | Deck data, art library, renderers, planner |
| A5 | **Mode words only when they do a job.** Use one when the task changes (*Look. Write. Read. Talk.*), to mark the process (*Step 2. Combine.*), to flag something to keep (*Know this.*), or to close (*Before you go.*). Skip it when it repeats the headline, is decoration, or sits on a divider, a big question or a continuation slide. Write it as an instruction (*Know this.* not *Know.*). About a third of slides; never two in a row that do the same thing. The agenda's is *Today's program*, which replaces its headline. | Renderers (rules) and planner |
| A6 | **Color, not highlighting.** Mark words with colored text; a correct quiz answer gets a soft color band behind its row. | Renderers, new quiz slots |
| A7 | **No lesson, day or slide numbers** in titles or running heads ("Pre-Writing", not "Lesson 2: Pre-Writing"). | Running head, planner |
| A8 | **Size content to the space** (balance it; never add content to fill), **no filler lines**, and **prompts never give away the answer**. Check the conventions you teach (current MLA). One idea per slide; 40 words on paper slides, 30 on Write and Look. | Planner rules, renderers balance |
| A9 | **Dividers name the writing-process step**: *Step 1.* pre-writing, *Step 2.* thesis, *Step 3.* introduction, *Step 4.* body paragraphs, *Step 5.* conclusion, *Step 6.* title and format. | Divider template, planner |
| A10 | **Neutral walls**: paper (white for a photo or handout), at most one accent wall, no tan or beige grounds. Pine only for writing, ink only for looking at art. No more than one dark slide in a row, one in four overall; never the same template twice in a row. | Renderer rhythm (already enforced), planner |
| A11 | **The twelve templates**, each with its slots and limits (title, agenda, steps, discuss, big idea, write, notes, divider, read along, look, excerpt, exit), laid out as in the example deck. | Renderers, schema, planner |
| A12 | **Art**: one work per lesson by theme; it appears on the title plate, running-head swatch, big-idea strip, divider and exit thumbnail, plus the optional Look slide, at most three large appearances; never text on the art; always credited; a tagged library with themes, rights, focal point and pre-sampled colors; pre-cropped to its box. | Art library, renderers, assets |
| A13 | **PowerPoint and Slides build**: 13.333 × 7.5 in; only rectangles, 1px lines, circles and pills; no shadows, gradients or transparency (on dark grounds, hairlines in solid #4A5C59 on pine or #3A3936 on ink); images pre-cropped; every word a real, editable text box. | PowerPoint export |
| A14 | **Reference table** of the eight finished Critical Essay decks and their art and colors. | Art library (colors), report |

### B. Teacher lesson plans (Lesson plan spec v1)

| # | What | |
| --- | --- | --- |
| B1 | **Section order**: kicker ("YAWP! LESSON PLAN · UNIT"), title + subtitle (same as the deck), info lines (*Step*, *Slide deck*, *Platform*), Overview (shaded box, lesson-color bar), Goals ("Students will…" / "The teacher will…" table), **Standards covered** (empty bordered box, "[ Add the standards this lesson covers ]"), Materials (always names the deck and yawp.school access), Lesson steps. | |
| B2 | **Steps**: phases (*Before class · Opening activity · The lesson · Writing activity · After class*, only when the lesson has distinct parts); steps numbered straight through, number in italic lesson color then a short bold serif title (2–6 words); a **Slides** line naming the deck slides to have up (by headline, never numbers); sub-steps as real lists (a., b. in the lesson color; i., ii. in gray); one or two callouts per lesson; script quotes; "Optional:" in italic; answers in parentheses. | |
| B3 | **Type and color**: Georgia and Arial; the deck's primary color; ink #1B1B1B, body #2E2B27, stone #6F6A63, rule #D8D0C1, callout fill #F7F4F0, header fill #E9E3D9; title 26pt, subtitle 13, section 15, step 12, body 10, info 9, footer 7.5. | |
| B4 | **The file**: .docx, US Letter, 0.75in margins; built-in heading styles, real list numbering, the page number as a field; headings and step titles kept with the text after them; tables in fixed twip widths with clear shading; colored text, never highlighting. Footer "… Writing Program \| [Lesson] lesson plan \| Page N". | |
| B5 | **Data model**: one record per lesson (`accent, kicker, title, subtitle, footer, meta, body[]` with callout, h2, twoCol, standards, bullets, phase, step, quote blocks; inline `**bold**`, `*italic*`, `~~HEX\|colored~~`). | |

### C. Handouts

| # | What |
| --- | --- |
| C1 | No board yet. Until there is one, a handout follows the lesson plan's fonts and colors. Brian offers to write a handout spec if the planner will make them (it does). |

### D. Process

| # | What |
| --- | --- |
| D1 | **Replace** the planner's slide deck instructions with this version. |
| D2 | Brian sent several emails; the kit is now the single place for deck, plan and handout design. |

## Decisions (defaults taken; flag any to change)

- **One flag for the kit.** `lesson_planner_deck_gallery` becomes "the Lesson
  Deck Kit": with it on, decks follow spec v3, the lesson plan (with plan
  export v2 on) follows the plan spec, and handouts take the plan's type and
  color. Off, nothing changes. It stays off in production and on in previews.
- **Brand in mixed case stays "Yawp!"** (main's Oct 20 sweep), so the plan
  footer reads "Yawp! Writing Program" and the exit button "Open Yawp! →
  Exit ticket". All-caps lines ("YAWP! LESSON PLAN") read the same either
  way. *Question for Brian: the kit writes "YAWP!" in mixed case.*
- **Fonts on screen and in PDFs.** Word and PowerPoint name Georgia and
  Arial (as the spec says). In the browser, Georgia and Arial come first,
  with Gelasio and Arimo (open fonts with the same metrics) behind them for
  machines without them, such as Chromebooks. PDFs embed Gelasio and Arimo,
  since Georgia and Arial cannot be redistributed.
- **The slide deck writing rules apply to every deck**, not only the gallery
  look: no lesson or day numbers, no filler, never give away the answer,
  check conventions, one idea per slide. The prompt version is bumped.
- **Art.** The library carries the spec's fields (themes, rights, focal
  point, colors). The Turner gets the colors of the Conclusion deck (rust
  #9C4A22, slate #3F5A73, ochre #7D6118) and pre-cropped versions for each
  box. The other seven works in the reference table need images: museum
  hosts are blocked from the build environment.
- **Quizzes.** No quiz template is in the twelve, so a discuss slide can
  carry `choices` and an `answer`; the answer's row gets the soft band.
- **The plan's step titles** come from the plan summary (one cached model
  call per stack, as now), which now also writes a 2–6 word title for each
  step and marks optional ones.

## The plan

Tests first in each phase (unit for domain, e2e for the UI), one commit per
change, everything behind the kit flag.

### Phase 1. Deck data and rules (domain)
1. `deck-colors.ts`: contrast ratio, darken-to-4.5:1, a deck's colors from
   `deck.colors`, then the art's colors, then the legacy `accent`; the
   primary; rotation per slide; `~~N|text~~` and `~~#HEX|text~~` color marks.
2. `deck-art.ts`: medium, collection, rights, focal point, colors, and a
   crop per box; the Turner's colors and crops.
3. `slide-deck.ts`: `colors` on the deck; `processStep` (1–6), `choices`,
   `answer`, `button`, `course` and excerpt `tasks` on slides.
4. `deck-gallery.ts`: the mode word rules (A5, A9), *Today's program*,
   *Know this.*, prompt sizing 68/54/46 (A3), running head without lesson or
   day numbers (A7), at most three large art appearances (A12), solid dark
   hairlines (A13).

### Phase 2. Renderers
5. HTML canvas (Present, Run the show, the editor): Georgia/Arial, the v3
   scale, each template laid out as the example deck (title plate with wall
   label and course line; agenda with roman numerals; steps in columns with
   big numerals and a minutes pill; discuss with the pill and a TRY stem;
   write with routine and minutes; notes timeline and facts; divider; read
   along in two columns; look with seconds and follow-up; excerpt with the
   sheet on the left; exit with the Yawp! button and the plate), deck
   colors, quiz bands.
6. PowerPoint: the same, in Georgia/Arial at px × 0.75, pre-cropped art,
   pills and solid hairlines, mode + headline + body in one text box where
   they stack.

### Phase 3. The planner
7. Replace the gallery deck instructions with spec v3 (templates and
   limits, mode word rules, deck colors and color coding, writing-process
   dividers, quiz answers, art choice by theme, rhythm).
8. Add the deck writing rules for every deck (A7, A8). Bump the prompt
   version. Deck repair keeps the new slots.

### Phase 4. The lesson plan
9. `kit-plan.ts`: the plan spec's data model, built from the stack, the
   plan summary and the deck (same title, subtitle, color and slide names;
   phases from step types; the Slides line from each slide's step).
10. `kit-plan-render.server.ts`: the .docx generator to spec (B3, B4), and a
    PDF of the same plan.
11. The plan summary also writes short step titles and marks optional
    steps; its cache key changes with the kit on.

### Phase 5. Handouts
12. Handout PDFs (the student handout and step handouts) take the plan's
    fonts (Gelasio and Arimo standing in) and lesson color with the kit on.

### Phase 6. Check and ship
13. E2E for the deck templates, mode words, colors, quiz band, running head,
    the plan download and its contents, and the handouts; the full planner
    suites; typecheck; CI unit files.
14. Re-record the guide's gallery clip with the recorder; update the guide
    copy for the kit.
15. Report-out, push to PR 437, update its description.

## Status (Oct 21)

All 15 steps are done and on PR 437. The changes from the plan:

- The PDF plan is drawn directly from the same data model, rather than
  converted from the Word file.
- Phases come from step types: class starter is the opening, Daily Pages
  and practice are writing, and the lesson's closing or exit ticket is
  the closing. Phase labels appear only when a plan has more than one.
- A step's SLIDES line comes from the deck's `step` marks. A deck built
  before the marks existed gets no SLIDES lines.
- The plan summary marks optional steps and writes short titles. A cached
  summary is rewritten once when the kit is on.
