# Review brief: Kevin's rules R14 to R25

You are reviewing lessons and a unit map that Yawp!'s lesson planner (a tool for high school English teachers) just produced on a test preview. A teacher named Kevin wrote these rules after testing it himself today. Judge each run against the rules that need a human eye. A script has already measured the rest; its numbers are in `auto.json` (one entry per run, by `id`). Use them, and say where you disagree with them.

All paths are absolute. `RULES=/tmp/claude-0/-home-user-yawp/7190eb60-e4b8-57dd-a60c-4c9a3ff6fa16/scratchpad/cap/rules`.

For each run folder you are given (`$RULES/<id>/`), look at these, reading every image before you judge:
- `1-reply.png`: the reply as the teacher sees it (tall; read it all).
- `sheet-slides.png`: every slide of the deck as printed, with speaker notes.
- For the unit: `unit-card.png` (the unit map) and `page.png` (the whole page).
- `reply.md` if present, or the reply inside `reply1.ndjson` (the last line's `payload.reply`), for the exact words.

## The rules to judge

- **R14 Lesson first, caveats last.** Does the reply open on the lesson (or the unit map), with notes for the teacher, such as "Quotations not checked", at the end?
- **R15 No narration.** Does the planner narrate its own process anywhere ("I have everything I need", "I'll write the prompts myself", "Let me build")?
- **R16 No wall of text.** Is the reply easy to scan? For the unit: at most two sentences before the map, with the questions as a short list after it.
- **R17 Notes that are real.** Is every note under "Check before class" something to act on? Is any note wrong, or one that says it isn't an error?
- **R18 A unit at a glance** (unit only). Does each day show its title, minutes, activity icons and reading on one line, with the long text behind "Details"? Can you tell what students do each day in two seconds?
- **R20 The right places on the map.** Is the place the text is set in pinned? Is any pin in the wrong place, or any place "not on the map"?
- **R21 Timelines with pictures.** Do the timeline's events carry pictures, visible on the whole line (the printed slide)? Are they pictures of the events themselves?
- **R22 Show the world.** If the text's world is far from students (ancient Greece, the 1920s, a war, 1963 Birmingham), is there one slide showing it in several pictures? Are they the right pictures?
- **R23 Memorable, not only clear.** Would students remember this deck? Count the content slides (not title, agenda, write, talk or exit) that carry a picture of the thing itself, a diagram, a map, a timeline or a marked passage. Is any picture decoration (a mood, a metaphor, a stock image)?
- **R24 Quote only a real text.** Is any long passage of a work in copyright, including a modern translation of an old work (Fitts and Fitzgerald's *Antigone*, Fagles' or Fitzgerald's *Odyssey*), printed from memory? Is a labeled slot used where the text is missing? Name the translation if you recognise it.
- **R25 Tell the teacher what was checked.** Does a lesson that quotes say at the end what its quotations were checked against? Does the unit map have no such line?

Score each applicable rule **pass**, **partial** or **fail**, with one sentence of evidence you saw yourself (quote the slide or the reply). Say **n/a** when a rule does not apply (a unit has no deck; a poem lesson may have no timeline).

Then give an **overall** for the run (1 = would not use, 2 = needs major work, 3 = usable with edits, 4 = use it tomorrow), and the **one change that would most improve it**.

## What to return

Write `$RULES/<id>/review.md` for each run: a short table (rule, score, evidence) and the overall. Then answer with one JSON line per run, nothing else:

`{"id": "...", "R14": "pass|partial|fail|n/a", ..., "R25": "...", "overall": 3, "top": "the one change"}`

Do not change any code or run any planner request. Read only.
