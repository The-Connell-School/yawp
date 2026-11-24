# Review brief: the lesson planner's rules, by type of lesson

You are reviewing lessons that Yawp!'s lesson planner (a tool for high school English teachers) just produced on a test preview, one per type of lesson: a novel, a play, a poem, a short story, a speech, a memoir or essay, an argument-writing lesson, a grammar lesson, a research lesson, a seminar, and a unit map.

The point of this review is not only to score each lesson. It is to find out **how well each rule fits each type of lesson**, because Kevin (the product's English-teacher founder) suspects some rules need versions for specific types (fiction against nonfiction, reading against writing, and so on).

All paths are absolute. `T=/tmp/claude-0/-home-user-yawp/7190eb60-e4b8-57dd-a60c-4c9a3ff6fa16/scratchpad/cap/types`.

**Read the rules first:** `/home/user/yawp/docs/plans/2026-11-24-lesson-planner-rules.md`. Cite rules by their codes (R1–R32, S1–S9, B1–B8, Y1–Y3).

For each run folder you are given (`$T/<id>/`), read everything below before you judge, and read every image fully:
- `reply.md`: the reply's exact words.
- `1-reply.png`: the reply as the teacher sees it.
- `sheet-slides.png`: every slide, with its speaker notes. A unit has `unit-card.png` and `page.png` instead.
- `auto.json` in `$T`: a script's counts, one entry per run by `id`.

## For each run

1. **Score every rule that applies**: pass, partial or fail, with one line of evidence you saw (quote the slide or the reply). Group the rules as the rules file does:
   - the shape of a lesson;
   - theme and thematic topic;
   - the words of the text;
   - what the slides show;
   - writing;
   - access and care;
   - units;
   - how the reply reads.

   Write **n/a** when a rule cannot apply, such as a map in a grammar lesson.
2. **Judge each rule's fit for this type of lesson.** For every rule you scored, say:
   - **fits**: the rule is right for this type as written;
   - **awkward**: it applies but its wording is wrong for this type, and say how;
   - **wrong here**: following it would make this type of lesson worse, and say why.
3. **Propose type-specific rules.** What would a strong English teacher want for this type of lesson that no rule covers? At most three, each in one sentence, as a rule.
4. **Overall**, 1 to 4 (1 = would not use, 2 = needs major work, 3 = usable with edits, 4 = use it tomorrow), and the one change that would most improve the lesson.

Write `$T/<id>/review.md` with all four parts.

## What to return

Answer with one JSON object per run, one per line, and nothing else:

`{"id": "...", "type": "novel|drama|poem|story|speech|memoir|argument writing|grammar|research|seminar|unit", "overall": n, "scores": {"R12": "pass", ...}, "fit": {"R12": "fits", "R27": "awkward: ...", ...}, "new_rules": ["...", "..."], "top": "the one change"}`

Do not change any code. Do not make requests to the preview. Read only.
