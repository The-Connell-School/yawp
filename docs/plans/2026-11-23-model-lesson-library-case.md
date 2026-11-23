# The case for a model-lesson library

*Nov 23. For Kevin and Brian. Kevin's idea: co-create model lessons and unit plans, keep them in a library on the site, have the planner study them before it writes, and add to the library over time with both of your approval.*

## The short answer

**Yes, I think it's worth building.** A library of model lessons is the most likely way to get from "usable with edits" to "use it tomorrow", and nothing we have built so far has done that. I would start with one model and a test, not the whole library, because it is unproven and it costs your time.

**It won't fix wrong quotations and facts.** That is still the biggest single problem, and it needs a different fix ("text first"). The library is for the teaching craft: how a lesson is paced, taught, checked and supported. Craft is the gap between a 3 and a 4 once the words are right.

## Where the planner is today

25 lessons, planned live on the preview and scored by AI reviewers against Kevin's rules, Brian's points and general learning principles (1 = would not use, 2 = needs major work, 3 = usable with edits, 4 = use it tomorrow). Full grid: https://claude.ai/artifact/1BMj4rNiwTVVyTsF9ze1E9

- **Average overall 2.60. 15 of 25 lessons are usable with edits, and none scores 4.** No lesson has scored 4 in any of five rounds.
- **Only 13 of the 222 part-scores are 4s.** No lesson earns a 4 for direct instruction, for access, or for visuals.

| Rubric part | Average | 4s | What holds it back, in the reviewers' words |
|---|---|---|---|
| A. Lesson arc | 3.08 | 4 | Opens in students' lives; often never returns to the starter |
| E. Writing | 3.16 | 5 | Strong; one prompt where three were asked for |
| H. Teacher usability | 3.00 | 1 | Good notes; the printed plan is too thin for a substitute |
| F. Checking for understanding | 2.92 | 1 | Good listen-fors; nothing checks the reading itself |
| C. Direct instruction | 2.60 | **0** | Terms never defined on screen; the mini-lesson gives away what pairs are about to find |
| G. Feasibility | 2.48 | 1 | 58 minutes built for 50; materials the task needs are missing |
| I. Access | 2.48 | **0** | No glossary; long unbroken passages |
| B. The text at the center | 2.36 | 1 | Invented or misplaced quotations; no passage at all |
| D. Visuals | 2.27 | **0** | Being worked on separately |

### Two real examples

**Dickinson, "Because I could not stop for Death" (scored 3, "a high 3").** The arc is right: a starter about something frightening that felt calm, a first read with circling and underlining, a modeled "analysis move", pair work, a written response. The speaker notes coach the teacher well. What keeps it from a 4 is craft: *"holding back some of the stanza-by-stanza explanation so the pairs have something left to find"*, plus a glossary for Gossamer, Tippet, Tulle and Cornice. The mini-lesson explains all four phrases the pairs are then asked to analyze.

**"Letter from Birmingham Jail" (scored 2).** The design is sound: a starter about being told to wait, a timeline, a map, a modeled move on a real passage, then pairs each taking one charge. But *"the lesson's central activity cannot run from these materials"*: no passage of the letter is supplied, two clergymen quotations sit under the wrong charge, and *"the strategy names students must supply are never taught."* The first two problems are about text, which the library won't fix. The third is craft, which it would.

## Why I think models will work where rules haven't

**The rules have hit a ceiling.** The planner's instructions are now about 1,290 lines. Rules already in them are followed about half the time:
- "Offer three exit tickets": 6 of 25 lessons still had one.
- "Gloss hard words": most lessons had no glossary.
- "Minutes add up to the period": two lessons were still built for 58 minutes in a 50-minute class.
- "Never answer with only a question": two lessons did exactly that.

Each new rule competes with everything already there.

**A model shows everything at once.** It shows how long a mini-lesson really is. It shows that the teacher models one phrase and leaves three for the pairs. It shows where the glossary sits on the handout, how a hinge question reads, and how the closing returns to the starter. A rule can say "don't give away the analysis". A model shows what that looks like on slide 9.

**It is how teachers learn too.** A new teacher learns more from a colleague's best lesson than from a list of principles (the worked-example effect). The library applies the same idea to the planner.

**The scores point at the same gap.** Where the planner is weakest after the words themselves (direct instruction, access, feasibility) are exactly what a complete model lesson shows and a rule describes badly.

## What the library would be

- **A small, edited set,** one or two models for each kind of lesson English teachers plan most:
  - close reading of a poem;
  - close reading of prose;
  - a scene from a play;
  - a context day before a book;
  - a discussion or seminar;
  - a writing skill;
  - rhetoric or nonfiction;
  - a unit plan.
- **Each model is complete:** plan, slides, handout, exit tickets. **Each is annotated:** a short note on each part saying why it is that way, tied to the principle behind it ("the teacher models one phrase and leaves three: R11, I do / we do / you do"). The notes are what let the planner carry the pattern to a different book instead of copying the content.
- **The planner gets one model per request,** the one closest to what the teacher asked for, given to it before it writes. It is not a tool the planner may choose to open: tools, like rules, get skipped.
- **Public-domain texts where possible,** so the models' own quotations are exact and nothing copyrighted is stored.
- **It sits beside what the planner already reads:** Brian's writing lessons, the Teacher's Lounge materials, and the teacher's own saved lessons.

## How it grows, with both of your approval

1. **A candidate comes in** from one of three places:
   - a lesson you write together with Yawp!;
   - a high-scoring test lesson that one of you corrects up to a 4;
   - later, a lesson a teacher used, rated highly and edited.
2. **It is annotated** with why each part is the way it is.
3. **Both of you approve it.** One approval is not enough.
4. **It is tested before it goes live.** The test lessons of its kind are planned with and without it, and it goes live only if scores do not fall and the planner does not copy it.
5. **It is versioned and can be retired** when a better one comes along. The library page shows each model's status (candidate, approved, live, retired), who approved it and when.

**The fastest start uses what we already have.** Several test lessons are close: Dickinson (verse close reading), the personal narrative lesson (writing skill, three 4s), *Frankenstein* (prose close reading) and *To Kill a Mockingbird* day 1 (context day). Taking one of these up to a 4 is quicker than writing from a blank page.

## Risks, honestly

| Risk | What could happen | How we would handle it |
|---|---|---|
| Copying | Every poem lesson opens with "think of something frightening that felt calm" | Annotations name what is specific to the work; an automatic check flags wording copied from the model; the test looks for it |
| Sameness | Every lesson of a kind has the same shape | One or two models per kind, with notes saying which parts are fixed and which vary |
| Slower, costlier lessons | A model is several thousand words added to every request; a lesson already takes about 2.5 minutes | One model only, trimmed to plan and notes, with prompt caching. Measured in the test |
| Your taste, frozen | The library reflects two teachers | Small and edited; anything can be retired; later, teachers' best-rated lessons can be nominated |
| Your time | Each model takes real work to write and approve | Start from the near-4 test lessons; one model first; build the rest only if the test says so |
| It doesn't move the scores | Wasted effort | The test is designed to find that out after one model, not eight |

## The test before the build

1. **One model:** a close reading of a poem, starting from the Dickinson lesson and taken to a 4 with Kevin. About 2–3 hours of Kevin's time. It is the kind of lesson we test most (Dickinson, "Dulce", "Mother to Son", the *Romeo and Juliet* Prologue, the *Hamlet* soliloquy, the *Macbeth* aside).
2. **Plan those six lessons twice with the model and twice without** (24 lessons), scored by reviewers who do not know which is which. About a day of my time.
3. **Decide:**
   - *Go:* direct instruction, checking, feasibility and access rise by at least 0.3 on average, nothing falls, the planner doesn't copy the model, and lessons are no more than about 20 seconds slower.
   - *Stop:* none of that happens. We will have spent one model and a day.
4. **If it works,** build the library: storage, the approval page, choosing the right model for each request, and the copy check. About 2–3 days. Then add one model per kind, at a pace you set.

## How it fits with the other work

The library and "text first" fix different things, so they don't compete:
- **Text first:** quotations are printed from a real source, never from memory. This fixes part B and the wrong-quotation problem behind most "needs major work" scores.
- **The library** fixes parts C, F, G and I, which separate a 3 from a 4.

I would run the one-model test now, because it is cheap, and build text first alongside it.

## What we need from Brian

1. Agreement to run the test.
2. The list of lesson kinds (above), or his changes to it.
3. The two-person approval rule: nothing joins the library without both of you.
4. Whether his writing lessons should be the first writing-skill models, since the planner already reads them.

## What I'd recommend asking Brian alongside this

The scores above come from AI reviewers. Before the test, it would help if you and Brian each scored five of these lessons blind on the same rubric. If you disagree with the reviewers, the test should be judged by your scores, not theirs.
