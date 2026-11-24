# Review: unit (three-week nonfiction unit, Douglass's Narrative, grade 11, ending in an argument essay)

Request: "Build a unit plan for 11th grade: a three-week nonfiction unit on Frederick Douglass's Narrative, 50-minute periods, ending in an argument essay." 113 s. Files: page.png and reply.md (no unit-card.png).

**The teacher sees no map.** page.png shows the prose before and after the map, then "This unit map didn't build. Ask for it again…". The `yawp-unit` JSON in reply.md is valid, but `unitId` is null. The likely cause, from reading `unit-plan.ts` (read only): each day's `students` cell is capped at 220 characters and trimmed only up to twice that. The planner wrote 300–469-character cells (days 1, 8, 10, 13 and 14 are over 440), so the whole map fails to parse. The content below is scored as written, but none of it reached the teacher.

## 1. Scores

### The shape of a lesson
| Rule | Score | Evidence |
|---|---|---|
| R12 | pass | Day 1: "What does it mean to be free?" plus a class starter; "What do you already know about slavery…?"; direct teaching of the timeline, map and vocabulary. |
| R29 | pass | History, vocabulary and rhetorical terms are taught directly; meaning is asked about ("what is Douglass arguing about what those songs meant?"). |
| S3 | partial | Three weeks, nonfiction, an argument essay, as asked. But the essay's counterargument (required in the Day 9 pre-write) is never taught. |
| S9 | pass | 15 × 50 minutes. |
| B1 | pass | "If you'd prefer a more focused or fixed prompt, say so". |
| B2 | partial | Day 14 spends a whole period on titles and MLA; Days 5 and 6 both centre on the Covey fight. |

### Theme and thematic topic (here: the author's argument)
| Rule | Score | Evidence |
|---|---|---|
| R26 | partial | Topics are named ("knowledge and power, silence and voice, identity and freedom"), but objectives state claims: "argue that ignorance is a tool of oppression". |
| R27 | pass | Day 1 opens on a question; every day opens on an experience question ("When is it right to fight back?"). |
| R28 | partial | Day 3 buildsTo: "Knowledge vs. ignorance is the Narrative's central argument". Day 4 objective: "Identify Douglass's argument about literacy as the path to freedom". The map states the argument students are meant to find. |
| R30 | partial | "What does Douglass argue in Chapters II–III…? Make a claim and back it with one moment from the text"; no tentative wording. |
| R31 | pass | The essay claim is the student's own; each Short Response says "Make a claim". |
| R32 | partial | Rule text: "Nonfiction gets the same treatment for the author's argument". There is no tracker of Douglass's argument across days. Each class starter is new rather than returning. Day 9 mines old entries, and Day 15 asks "what did Douglass argue, and did it work?". |

### The words of the text
| Rule | Score | Evidence |
|---|---|---|
| R9, S1 | n/a | Map level; Day 6 says "Distribute the passage (public domain, printable in full)". |
| R11 | fail | Day 4 puts "Auld's speech against teaching Douglass to read" in Chapter VII; it is in Chapter VI. Chapters IV–VI are never assigned. A fact check ran (factsCorrected 1, factsFlagged 1), but the teacher is told nothing. |
| R24 | pass | Public domain, as the reply says. |
| R25 | n/a | Nothing quoted. |

### What the slides show
| Rule | Score | Evidence |
|---|---|---|
| R1 | pass | Day 1 plans the context before the text: "timeline of Douglass's life and the antebellum period; map of the Chesapeake region". |
| R2 | pass | A Chesapeake map is planned for Day 1. |
| R3 | pass | A timeline is planned for Day 1. |
| R4–R8, R20–R23 | n/a | No slides at map level. |

### Writing
| Rule | Score | Evidence |
|---|---|---|
| Y1 | pass | A daily starter, four Short Responses, a pre-write, a body paragraph, the introduction, a draft and the essay. |
| Y2 | partial | Starters every day; an exit ticket only on Day 1. |
| B3, S5 starters, Room to write | n/a | Map level. |

### Access and care
| Rule | Score | Evidence |
|---|---|---|
| S5 | fail | No note on reading 1840s prose, no route for struggling readers, and Day 5's homework is Chapters VIII–X in one night (Chapter X alone is the longest chapter). |
| S7 | fail | The Narrative includes the whipping of Aunt Hester, sexual abuse, the killing of Demby and a slur (in Hugh Auld's inch/ell line in Chapter VI), with no care note anywhere in the unit. |
| Pictures fit | n/a | No pictures. |

### Units
| Rule | Score | Evidence |
|---|---|---|
| S8 | partial | It names the final task ("A thesis-driven argument essay…"), but there is no rubric. Counterargument is required before it is taught. Day 1 does not introduce the text ("Reading: None"). The pace is uneven: IV–VI are skipped, VIII–X are assigned in one night, and the whole book is done by Day 8. |
| R18 | fail | The map did not render: "This unit map didn't build." |
| R32 | partial | See above. |

### How the reply reads
| Rule | Score | Evidence |
|---|---|---|
| R14 | partial | Opens on a caveat ("…is in the public domain, so passages can be quoted and printed in full") before the map. |
| R15 | partial | That opening sentence says what the planner has. |
| R16 | fail | Auto counts 4 sentences before the map. In the UI, with no map, everything runs together as one block of prose. |
| R17 | pass | Nothing denies being an error. |
| B7 | pass | Clear and collegial. |
| B8 | partial | "Does the arc feel right?" in the bullets, then "Want to refine or edit any part of this?": two questions. |
| R19 | pass | 113 s (limit 120). |

## 2. Fit for a nonfiction unit

- R12 **fits** for Day 1.
- R26 **awkward**: for nonfiction the pair should be "the issue / the author's claim about it". "Thematic topic" pushes the planner toward fiction words ("identity and freedom") when the unit's real spine is an argument.
- R27 **fits**.
- R28 **awkward**: Douglass often states his argument outright ("You have seen how a man was made a slave; you shall see how a slave was made a man"). For nonfiction the rule should forbid telling how the argument works and whether it succeeds, not quoting what the author plainly claims.
- R29, R30, R31 **fit**.
- R32 **fits** and already names nonfiction, but it needs a concrete tool (an argument tracker), or the planner substitutes "mine your old entries".
- R1, R2, R3 **fit**: the Eastern Shore, Baltimore and the free North are part of the argument, so the map and timeline belong on Day 1.
- R20, R21, R22 **fit** once days are built (1830s Baltimore, the shipyards).
- S7 **fits**, and is essential for this text.
- S8 **fits**; its "Day 1 introduces the text" should allow a context day only if it ends on the first page.
- R16, R18 **fit**: the cap on day cells is what broke this map, so the prompt and the parser should agree on it (one short line per day, as the failure message itself says).

## 3. Proposed rules for nonfiction units

1. A nonfiction unit keeps a running argument tracker. Each reading day, students log the author's claim, the evidence, and the appeal to the audience of the time, and before drafting they turn it into their own statement of the argument.
2. A unit on a whole book assigns every chapter (or says which are skipped and why), at a pace a class can keep, about 15–20 pages a night.
3. A nonfiction unit sets the text in its historical moment with at least one primary source from that time (for example the Garrison preface, the Fugitive Slave Law, or a contemporary review), so students judge the argument against the audience it had to move.

## 4. Overall

**2 — needs major work.** As written, the sequence is thoughtful: the prefaces as the credibility problem, then literacy, Covey and the Appendix, then a writing arc built on Yawp! lessons. But the teacher received no map at all. Beyond that, Chapters IV–VI are skipped, a key scene is placed in the wrong chapter, there is no care note for a text full of violence and a slur, and there is no rubric.

**Top change:** write each day's cell as one short line, under the 220-character limit, so the map actually builds. Then fill the reading gaps (IV–VI) and add the care note.
