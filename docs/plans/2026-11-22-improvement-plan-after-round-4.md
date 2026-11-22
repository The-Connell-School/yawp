# Lesson Planner: improvement plan after round 4 and the new lessons

*Nov 22. Based on the 25 current reviews: round 4 of the original thirteen lessons, and twelve lessons the planner had never been tested on. Scores and reviews are in `docs/plans/2026-11-22-lesson-review/round-4/` and `new-lessons/`.*

## Where things honestly stand

- **The trend is real but modest.** The original thirteen went 2.38 → 2.77 over four rounds, and the twelve new lessons scored 2.58. No lesson has scored 4 ("use tomorrow as is") in any round.
- **Most of the gain came from fixing breakage, not from better teaching content.** Feasibility rose 0.54 (stacks add up, decks build, lessons arrive). The text at the center rose 0.14 in four rounds and has been flat since round 3 (2.31). On the new lessons it is 2.25.
- **What is already good, and should be left alone:** the lesson arc (3.0–3.3), the writing (3.15–3.33), checks for understanding (about 3.0) and teacher usability (3.0). Reviewers praise the think-alouds and speaker notes in most lessons.
- **The scores have soft edges.** Each round had different AI reviewers and one run per lesson. A single lesson moving one point is noise. No human has scored any of these lessons yet.

## What the reviews say is wrong, by how much evidence there is

### 1. The words of the text are not reliable (the top problem in 11 of 25 lessons)

This is the biggest problem, and my fixes so far have only partly worked.

- **Without the text, the planner invents.** *A Raisin in the Sun*'s "Act 1" quotations come from Acts 2 and 3. King's letter gained a sentence he never wrote. Hughes's key line is misquoted. *Night*'s closing quotation is credited to the wrong source.
- **Even with the text in hand, errors get through.** The check verified 5 to 43 quotations per lesson and corrected up to 6. But it leaves alone anything it cannot match, and that is where invented lines live. *The Scarlet Letter* handout kept a fabricated line, with the book in hand and 2 quotations marked "unverified".
- **Slides and handout can disagree.** Dickinson's slides used the 1890 edited text; the handout used her own.
- **Passages are cut without saying so.** *Pride and Prejudice*'s handout claimed the full chapter and left out its last paragraph.
- **Two close-reading lessons had no text at all** (the *Odyssey*, *Their Eyes Were Watching God*).

**Why my approach has hit its limit.** I built checking after the fact: the planner writes from memory, then code compares and patches. That catches misquotes of real lines. It cannot catch a line that was never in the book, and it cannot supply a passage the planner did not write.

**What I would do instead: text first.**
- Before the planner writes, fetch the text (public domain) or use the teacher's pages (your PDF idea), and give the planner the actual passage to build on.
- The planner names the passage by reference ("chapter 2, from 'The door of the jail' to 'her bosom'"). The system prints the exact words on the slide and the handout, from one source.
- With no text available, the planner quotes nothing from that work. It describes, cites the page, and leaves the labeled slot with "Add your pages".

This replaces three patches (quotation correction, the true-lines step, part of the repair pass) with one rule: quoted words always come from a source, never from memory. Size: large, about two days. It is the one change I am confident moves the text score.

### 2. Unit plans have broken reading schedules (3 of 3 units, every round)

- **1984:** Part One out of order, Part Two chapters 9–10 before 7–8, Room 101 never assigned. It has been wrong in all four rounds, differently each time.
- **Of Mice and Men:** chapter 5 never assigned.
- **Animal Farm:** Boxer debated before the chapter where he dies.

A prompt rule will not fix this; the planner cannot reliably count chapters across 15–20 days. A code check can: a table of chapter counts for the most-taught works, and a check that every chapter is assigned once, in order, and that no lesson runs ahead of the reading. What it finds goes back to the planner to fix. Size: medium. Confidence: high.

### 3. Pictures: four rounds of work for half a point (1.50 → 2.00; 1.73 on new lessons)

About 17 of 25 reviews say the deck has few or no useful pictures, and about 14 say a named author or person has no face. Here I do not know the cause well enough to propose a build.

- **The lookup fails on pictures that exist.** Owen's portrait is public domain, and the deck still said "Yawp! could not find one it could use". The same happened for King and Hurston. I have not diagnosed why (license filter, article lead image, timeout). That diagnosis comes first; it is a few hours.
- **Some of the gap may be the rubric, not the product.** A close-reading slide whose content is the passage itself may not need a picture. Your rule R7 exempts routine slides; whether an excerpt slide counts is your call. Reviewers currently mark it down.
- **If the lookup cannot be made reliable,** a small curated shelf is the dependable route: for the 40 or so most-taught works, a hand-checked author portrait, setting and period images. That is editorial work more than code.

I would not tune the picture editor's instructions again until the lookup failures are understood.

### 4. The fact check is a noisy instrument

Across the 25 lessons it flagged 51 facts, the repair pass fixed 40 and left 9 for the teacher. That sounds good, but:

- Reviewers still found known-wrong facts on slides in roughly a third of lessons.
- In about 6 lessons the teacher's note was itself wrong or confusing: it called a wrong chapter placement "correct", said "Not an error; ignore", and (in round 3) claimed 1984's Part One has six chapters.

The cause is structural: it is a second model checking from memory, so it adds its own errors. I have not measured how many of its flags are right. Before investing more, I would score its 51 flags against the reviews (half a day). If precision is poor, the honest fix is to shrink it: act only on facts verifiable against a source, and show the teacher fewer, surer notes.

### 5. Smaller problems with clear evidence

| Problem | Evidence | Fix | Size |
|---|---|---|---|
| A deck promised and never produced | 1 of 25 (Poe); partly fixed by the runaway-blank cut | Rebuild a missing or cut-off deck from the plan | S–M |
| Slide minutes per section differ from the plan's steps | About 15 of 25 (totals now match) | Each slide carries its step; minutes come from the step | S–M |
| The stack shows "—-minute period" and ticks "Fits the period" at 0 minutes | 7 of 25 | Two small bugs | S |
| Writing share counts reading and discussion as writing | 4 of 25 | Count writing steps only | S |

### 6. Fixes made after the tests, not yet verified

These shipped after the lessons that exposed them were run, so no round has confirmed them: ruled lines for room to write (about 12 of 25 reviews), runaway blanks, the two-part subtitle counted as a step, stanza numbering, finding the book on a second turn, painting talk, background fetching of texts. They need one verification run before anything else is built on top.

## Things I would not do now, and why

- **More prompt rules.** "Offer three exit tickets" and "gloss hard words" are already in the planner's instructions, and 6 of 25 lessons still had one exit ticket and most had no glossary. "Never answer with only a question" was there when the planner answered with only a question. The instructions file is about 1,270 lines; new rules are followed about half the time. Anything that must be true needs a code check or a slot the system fills, not another sentence.
- **Four model lessons at once (the library).** I still think it could help, and it is the most plausible route to a 4. But it is unproven and costs your time. I would write one exemplar (a verse close reading), run the same lessons with and without it, and only then write more.
- **More rounds on the same thirteen lessons.** We have tuned against them four times. New rounds should rotate in unseen lessons, as the twelve did.
- **More passes after the reply.** A lesson now takes a median 141 seconds, up to 213, and about ten steps run after the planner writes. Two of my patches caused regressions (round 2, and the vanished writing space). Text first would remove passes rather than add one.

## Questions only you and Brian can settle

1. **Human calibration.** Would you and Brian each score five of these lessons, blind, on the same rubric? If your scores disagree with the AI reviewers', the plan should follow yours. I think this matters more than any build item.
2. **The intake question.** When a request already gives grade, length and text, the planner still asks "which class?". That is Brian's intake design working as written. Keep it, or skip the question when the request is complete?
3. **The printed plan.** Brian asked for a short plan (a summary per step). Reviewers in 14 of 25 lessons say a substitute could not teach from it. Keep it short, or add a full version?
4. **Pictures on excerpt slides.** Required, or is the passage the thing to look at?

## The order I would work in

1. **Verify** the untested fixes: one run of about eight lessons, half old and half unseen. (Half a day.)
2. **Text first**, with the teacher's pages as its second source. (About two days.)
3. **Unit reading check.** (Half a day to a day.)
4. **Diagnose** the picture lookup and the fact check's precision. Decide the builds from what that shows. (One day.)
5. **The small fixes** in section 5. (Half a day.)
6. **One exemplar**, tested with and without. (Half a day, plus your review.)

If you and Brian do the calibration scoring in parallel, the next full round can be measured against your judgment and not only the AI reviewers'.
