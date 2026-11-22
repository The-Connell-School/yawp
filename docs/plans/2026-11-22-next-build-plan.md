# Lesson Planner: build plan for the next round

*Nov 22, after round 3 of the 13-lesson test. Overall went 2.38 → 2.31 → 2.54; no lesson yet scores 4. The reviews are in `docs/plans/2026-11-22-lesson-review/round-3/`.*

Each item below gives:
- **Why:** what the reviewers found, with the lessons.
- **Build:** the steps.
- **Where:** the files.
- **Done when:** the tests and the measure.
- **Principle:** the teaching rule or learning principle it serves.
- **Size:** S is under 2 hours of work, M is about half a day, L is a day or more.
- **Risk:** what could go wrong.

Pick by number; the options are at the end.

---

## 1. Fix it, don't flag it: a repair pass for errors the lesson relies on

**Why.** In round 3, four lessons shipped errors the planner's own checks had found:
- **Gatsby:** "one of the few honest people" is taught as Chapter 1 when it closes Chapter 3.
- **Mockingbird:** Harper Lee's birth year and "Scout is 8 in 1933" are wrong.
- **Things Fall Apart:** the protectorate is dated 1901 (it was 1900), and the Igbo homeland is put "in the Niger Delta".
- **Dulce:** Owen is said to be 22 (he was 23).

Today a correction is made only when the bad words can be swapped one for one. When a lesson is *built* on the error (a think-aloud, a slide and the Short Response prompt), the error is only listed under "Check before class".

**Build.**
1. After the quotation check and the fact check, collect what is left: flagged facts and quotations in the wrong chapter.
2. If there are any, make one more model call (Sonnet 5.5, 25 s limit). It gets the reply and the list and returns edits as JSON: `[{find, replace, why}]`. Each `find` is an exact span of the reply; it may cover a whole sentence, a slide's field or a prompt.
3. Apply the edits with the same safety rules as the fact check:
   - exact matches only;
   - JSON-escaped inside the deck;
   - never inside a code-fence line;
   - never over a quotation already checked against the source text.
4. Run the quotation check again on the result, so a repair cannot bring in a new misquote.
5. "Check before class" then lists only what could not be repaired.
6. Log the counts (repaired, left) in the `checks` line.

**Where.**
- New `domain/lesson-planner/lesson-repair.server.ts` and its test.
- `routes/api.domain.lesson-planner/route.ts`, after the fact check.
- `fact-model.server.ts`, as the pattern for the model call.

**Done when.**
- Fixtures from round 3 come back repaired: the Gatsby reply has no "Chapter 1" claim for the line, and the Mockingbird slides have Lee born in 1926.
- No repaired deck fails to build.
- In the next round, "flagged but left on the slide" goes from 4 of 13 to 0 or 1.

**Principle.** Exactly right (R11). A wrong fact learned first keeps shaping students' thinking after it is corrected.

**Size:** M. **Risk:** a repair could change a teaching choice. It is told to change only the listed errors, and every edit is a span we can check.

---

## 2. The true lines, kept as verse, on slides and handouts

**Why.** All five verse lessons had the same faults:
- **Dulce:** the slide drops lines 15–16 and 23–24 with no ellipsis, and the verse runs as prose with slashes.
- **Odyssey:** two passages that are not next to each other are spliced together without an ellipsis.
- **Hamlet and Romeo and Juliet:** the handouts have no line numbers, though the teacher's model says "line 6".
- **Macbeth:** the read-aloud passage is on no slide.

**Build.**
1. When the work's text is in hand (the quotation check already fetches it), take each excerpt slide's passage. Find its first and last lines in the source, and put the true lines between them in the slide's body, one line each.
2. Where the planner left lines out, keep them out but mark the gap with "[…]" on its own line. Never silently.
3. Draw the passage's line breaks on the slide. The kit already splits the passage on line breaks to size it; the change is to keep them in the drawn text.
4. Number lines on the handout:
   - For a play, put every fifth line number in the margin, counted from the line the planner cites ("1.3.130"). When the planner gives no line, count from 1.
   - For a poem, count from 1.
5. Give a reading slide whose passage is in the source the passage itself, so it becomes an excerpt slide. Above the slide's limit (700 characters), split it over two slides.

**Where.**
- `quotation-check.server.ts` (find the span; it already finds verse passages).
- `slide-deck.ts` (excerpt body).
- `deck-kit-v4.ts` (draw the line breaks).
- `markdown-blocks.ts` and `lesson-pdf.server.ts` (line numbers).
- `handout-passage.ts`.

**Done when.**
- The Dulce, Hamlet and Macbeth fixtures produce excerpt slides whose text equals the source lines, with breaks.
- Handouts number every fifth line.
- Reviewers stop reporting silent cuts.

**Principle.** No reading slide without the reading (R9). Close reading needs the exact words, and students need to find the line the teacher names.

**Size:** L. **Risk:**
- Gutenberg's text for a play has stage directions and speech prefixes. A passage keeps the speaker's name on its own line, the way an edition prints it.
- Line numbers counted from the planner's citation are only as good as the citation, so a passage with no citation counts from 1 and says so.

---

## 3. The writing students get is the writing the lesson is about

**Why.** In Macbeth, "Add everything" filed the generic library prompt "What ambition costs" as the Short Response, not the prompt about the aside the lesson builds to. The class starter on the slide also differed from the one filed.

**Build.**
1. In `keepAllPlan`, when a step offers several writing prompts, file the one written for this lesson first: a Short Response with no library `id` over one with an id. Class starters keep the planner's first option, since they are meant to be general.
2. After filing, set the deck's write slides to the prompt that was filed: the class-starter slide shows the filed starter, and the Short Response slide shows the filed prompt.

**Where.**
- `reply-pieces.ts` (`keepAllPlan`).
- `file-reply-pieces.server.ts`.
- A small deck edit when filing (the deck in the stack is already rebuilt from the reply).

**Done when.**
- The Macbeth fixture files the aside prompt.
- In every fixture, the starter on slide 3 is the starter in the stack.

**Principle.** Alignment: the task and the exit ticket measure the objective.

**Size:** S. **Risk:** low.

---

## 4. Handouts ready to print: room to write, and hard words glossed

**Why.** Six of 13 handouts had questions with no space under them ("answer in the space below" with no space). Hard words went unglossed in Macbeth (the aside), Dulce ("ecstasy", "lime", "guttering") and Romeo and Juliet. Their Eyes had an invented vocabulary word.

**Build.**
1. In the handout PDF, put ruled lines under every question that has none:
   - a numbered or lettered question, or a line ending in "?";
   - four lines by default, eight after "explain" or "paragraph".
2. A passage of verse or of prose from before 1900 gets a "Words to know" box beside it. The planner writes it, and the prompt already asks for glosses.
3. A check after the reply: a handout with a passage and no "Words to know" is sent to the repair pass (item 1) for three to six glosses, taken from words that are in the passage.
4. Gloss words must occur in the passage, so no invented ones.

**Where.**
- `lesson-pdf.server.ts`, the step and kit handout renderers.
- `build-system-prompt.ts`.
- The new repair pass, if item 1 is chosen.

**Done when.**
- Every question in every round-3 handout fixture prints with lines.
- Every verse handout has glosses drawn from its own words.

**Principle.** Scaffolding and access for struggling readers and English learners; materials ready to use (Yawp!'s own value).

**Size:** M (S without the repair hook). **Risk:** pages get longer, an extra page per handout at most.

---

## 5. The right faces: every named author and person, and never the wrong one

**Why.**
- **Things Fall Apart:** Conrad's portrait sat beside "In 1958, Chinua Achebe published…", and Achebe never appears.
- **Their Eyes Were Watching God:** no Hurston; the only picture was a map that omits Eatonville.
- **The Crucible:** McCarthy has no face, and Miller's photo is used twice.
- **Dulce:** no picture in 13 slides.

**Build.**
1. The deck's author gets a picture where the deck first introduces them, by name, by the exact article title. The author comes from the request (registry or text).
2. The picture editor gets the deck's named people: anyone named on a slide's title or first line. It must give each one, once, before any other subject.
3. The second look checks the match. It already sees the slide's words. Now it is also told who the picture must be, and it rejects a portrait when the slide's subject is another person. Its prompt is in `picture-check.server.ts` (`SECOND_LOOK_SYSTEM`).
4. No picture is used twice in a deck (by file).
5. When the lookup finds none for an author, the slide gets a labelled picture slot, as today, so the teacher knows.

**Where.**
- `picture-subjects.server.ts`.
- `picture-check.server.ts`.
- `picture-lookup.server.ts`.

**Done when.**
- The Achebe and Hurston fixtures ask for their authors first.
- A test deck with Conrad's portrait beside Achebe's name is rejected by the look.
- In the next round, every lesson on an author shows the author.

**Principle.** Show who: real people get their faces (R4); a picture of the thing itself (R13).

**Size:** M. **Risk:** the second look can be wrong about faces. It is told the article the picture came from, so a mismatch is between article and slide, not face recognition.

---

## 6. Unit plans that add up

**Why.**
- **1984:** 24 days for "four weeks", Part Two Chapter 8 never assigned, the Room 101 day assigning the wrong chapters, and a flag that said Part One has six chapters (it has eight).
- **Of Mice and Men:** the Socratic seminar on the essay question came after the essays were due, and counterargument was never taught.

**Build.**
1. Read the unit's days (`unit-plan.ts` already parses them).
2. **Days:** if the request names weeks, the days must equal weeks × 5 (or the periods per week the teacher set). The check names the difference.
3. **Chapters:** a small table of chapter counts for the works most taught, copyrighted ones included:
   - 1984: 8, 10 and 6 chapters in its three parts;
   - Of Mice and Men: 6;
   - To Kill a Mockingbird: 31;
   - The Great Gatsby: 9;
   - Things Fall Apart: 25;
   - Their Eyes Were Watching God: 20;
   - The Crucible: four acts;
   - and about 20 more.

   The check: every chapter is assigned once, and in order.
4. **Order:** a discussion of the essay question comes before the essay's due date; for an argument essay, counterargument is taught before drafting.
5. Problems go to the repair pass (item 1) with the list. What it cannot fix is shown to the teacher.

**Where.**
- New `domain/lesson-planner/unit-check.ts` and a `work-chapters.ts` table.
- `route.ts`.
- `build-system-prompt.ts` (the backward-design rules exist; add the order rule).

**Done when.**
- The 1984 and Of Mice and Men fixtures are caught for every problem the reviewers named.
- After repair, the 1984 plan has 20 days covering every chapter once.

**Principle.** Units built backward from the assessment; spacing; no gaps in the reading.

**Size:** M. **Risk:** the chapter table must be right. Each entry gets a test, and the check stays silent for a work not in the table.

---

## 7. No lesson lost: find the eight-minute silence

**Why.** Two of 16 first runs in round 3 got nothing back for eight minutes, not even a progress line, then worked on retry. Romeo and Juliet's model call failed twice at about 70 s; the wider retry window now covers that case.

**Build.**
1. Send the client a first NDJSON line the instant the request is accepted. Log a one-line "accepted" record on the server, with the request id and no lesson text.
2. In the client, if no first line arrives within 30 s, abort and retry once on its own. Say "Still working…" rather than "check your connection".
3. Read the preview's server log for the two silent requests (17:30–17:50 UTC, Nov 22) to see whether they reached the server at all. If they did not, it is the platform's request queue, and the fix is 1–2. If they did, the log line in 1 shows where they stopped.
4. Show the teacher a true message when the planner fails ("The planner did not finish; trying once more…"), never "check your connection" when the connection is fine.

**Where.**
- `routes/api.domain.lesson-planner/route.ts` (the progress stream).
- `routes/app.lesson-planner/route.tsx` (the client wait, and the message at line 149).

**Done when.**
- A test proves the first line goes out before any model call.
- In the next round, no "NO REPLY".

**Principle.** Teacher trust: a tool that fails one time in eight is not used tomorrow.

**Size:** S–M. **Risk:** a client retry must not double-file a lesson. It retries only when nothing arrived.

---

## 8. The library of model lessons, written with you

**Why.** Every reviewer pattern above is easier to hold to when the planner sees a lesson that already does it. Rules describe; an example shows.

**Build.**
1. Write four exemplars with Kevin:
   - a close reading of verse (Dulce or the Macbeth aside);
   - a context day (The Crucible or Things Fall Apart);
   - a writing lesson (a defensible thesis, with a literary model);
   - a three-week unit (Of Mice and Men).

   Each is a complete planner reply: plan, deck and handout, at Yawp!'s best. I draft each from the round-3 lesson; you mark it up; I revise.
2. Store them as files in the repo (`domain/lesson-planner/exemplars/*.md`), with the kind of lesson each models.
3. The planner reads the one exemplar that matches the request (by kind: close reading, context day, writing, unit) before it writes. It is told to match the standard, not the text.
4. Later, an admin page, so you can add exemplars without a deploy.

**Where.**
- New `exemplars/` and `exemplar-for.ts`.
- `build-system-prompt.ts` (one section).
- Prompt caching for the exemplar.

**Done when.**
- The four exist and you have approved them.
- The next round's lessons of those kinds score at least as well as without them (we run both).

**Principle.** Worked examples (modeling) work for models too; and Kevin's own standard, made concrete.

**Size:** M for me, plus about 2 hours of your review. **Risk:**
- **Cost and speed:** each exemplar adds about 4k tokens to the prompt, which caching makes cheap.
- **Copying:** the planner could copy the exemplar's text. We test against that with a lesson on a different work.

---

## 9. The history on screen tied to the book

**Why.**
- **The Crucible:** Parris, Abigail and Tituba appear on the 1692 timeline but are never named as the play's characters, and Proctor only in the notes.
- **Mockingbird:** the map shades the whole United States, Alaska included, as "the American South".

**Build.**
1. On a context day, every context slide names the book's characters or places beside the history (R8), checked after the reply. A context deck with no character name on any context slide goes to the repair pass, with the list of characters the plan names.
2. **Maps:** a region ("the American South", "Igboland", "Salem Village") gets a region layer, not a country shading. The map rules already forbid shading today's country for a colony; add the same for a region of a country.

**Where.**
- `build-system-prompt.ts`.
- A small check in `deck-plan-minutes.ts`'s neighbour (`deck-checks.ts`).
- `domain/geo/places.server.ts` for the region layer.

**Done when.** The Crucible fixture names Parris and Abigail on the 1692 slides, and the Mockingbird map shades the former Confederate states only.

**Principle.** Connect the history to the book on screen (R8); show where (R2).

**Size:** S (prompt and check) to M (with the map region layer).

---

## 10. What the reply says is what was made

**Why.**
- **Mockingbird and Things Fall Apart:** the reply describes a painting (Bruegel, van Gogh) that is not in the deck.
- **Romeo and Juliet:** the plan cites slide numbers that are wrong.
- **Macbeth:** "Check before class" told the teacher to extend a correct line range.
- **Hamlet:** the soliloquy handout sat last in the stack, after the exit ticket.

**Build.**
1. After the picture step, if the deck has no painting, remove the reply's sentences that describe one. The art name is known, so this is an exact match.
2. Slide references in the plan ("slides 3–8") are recomputed from the deck. The plan's steps already match the deck's agenda (item 11 of the last plan), so each step's slides are known.
3. A handout that a step reads ("Close reading: the aside" with the passage handout) is filed with that step, not at the end.
4. Drop a "Check before class" item that contradicts the source text. This is done for quotations; extend it to line ranges the source text confirms.

**Where.**
- `route.ts`.
- `deck-plan-minutes.ts`.
- `reply-pieces.ts`.
- `check-note.ts`.

**Done when.** Round-3 fixtures have no painting described that is not drawn, no wrong slide number, and no handout after the exit ticket.

**Principle.** Teacher usability: a plan the teacher can trust line by line.

**Size:** S–M.

---

## 11. Make the test a button, and keep it honest

**Why.** Each round took about 30 minutes of setup and 45 of running, and the same 13 lessons can be overfitted.

**Build.**
1. One command runs a round: the four testers, the scores, the page with every round's grid.
2. Add three lessons we have never tested, drawn fresh each round from a list of 30 classic units:
   - *The Scarlet Letter*;
   - *Frankenstein*;
   - a Langston Hughes poem.

   The grid shows them apart, so we can see whether the gains carry to new lessons.
3. Run each lesson twice per round and average, to halve the noise of a single run.

**Where.** `scripts/lesson-review/` in the repo, not code that ships.

**Done when.** A round runs from one command.

**Principle.** Honest measurement.

**Size:** S–M. **Cost:** a round of 16 lessons, run twice, is about 2× today's token spend.

---

## Options

Name the numbers you want. My recommendation:

- **Best value next: 1, 2, 3, 7.** These are the four problems reviewers hit most: errors left in, verse cut, the wrong writing prompt, and lost lessons. 3 and 7 are small.
- **Classroom-ready materials: 4 and 10.**
- **Pictures and context: 5 and 9.**
- **Units: 6** (needs 1 for the repair).
- **The library: 8.** It needs your time for review, and it is the item most likely to move scores toward 4.
- **Measurement: 11.** Worth doing before the next round if we run several more.

Whatever you pick, I end with another round (the same 13, plus the 3 new ones if you pick 11) and the colored grid with round 4 beside rounds 1–3.

Dependencies:
- **Item 1** is used by 4 (glosses), 6 (unit repairs) and 9 (character names). Without it, those fall back to the "Check before class" note.
- **Item 2** uses the quotation check's source text, so it covers public-domain works only. For copyrighted works the slot stays, labelled.

---

## After round 4 and the twelve new lessons (Nov 22, evening)

Items 1, 2, 3 and 7 are built. Round 4 on the original thirteen: **2.77** (10 of 13 usable with edits). Twelve never-tested lessons: **2.58** (7 of 12). Lessons on texts Yawp! had in hand averaged 3.00; lessons on texts it did not have averaged 2.20 and invented quotations. Full write-up: `docs/plans/2026-11-22-lesson-review/round-4/summary.md`.

New items, numbered after the eleven above:

- **12. The teacher's own pages.** Ask once, optionally, for a PDF, photo or pasted text when the work is in copyright and the lesson reads closely. "Add your pages" in the slot fills the slide and handout and checks every quotation against it. Without the text, quote nothing from a copyrighted work. (M)
- **13. A lost deck rebuilt.** A reply with no deck, or a deck cut off, gets one built from its plan in a second call. (S–M)
- **14. One text, one version.** Slides and handout take a passage from the same source (Dickinson's 1890 edit on the slides, her own text on the handout). (S)
- **15. Minutes and writing share per step.** Each slide carries its step and that step's minutes; the writing share counts writing only. (S–M)
- **16. Three exit tickets.** Brian's ask: check understanding, explain a term, ask a question. (S)
- **17. A sub-ready printed plan.** Today's short print, plus one with every step's full directions. (S)

Recommended next: **12, 13, 5, 16.**
