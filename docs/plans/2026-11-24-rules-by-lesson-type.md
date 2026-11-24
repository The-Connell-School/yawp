# The rules by type of lesson: what the test found, and draft rules for each type

*Nov 24.*
- *Eleven lessons were planned on the PR #997 preview, one of each type: novel, play, poem, short story, speech, memoir, Socratic seminar, nonfiction unit, argument writing, grammar and research.*
- *Each was scored against every rule in `2026-11-24-lesson-planner-rules.md`.*
- *For every rule, a reviewer also judged whether it **fits** the type, is **awkward** (it applies, but its wording is wrong for the type), or is **wrong here** (following it would make the lesson worse).*
- *Reviews and scores are in `2026-11-22-lesson-review/types/`.*

## What the test showed

**Overall average: 2.55 of 4.** By type:

| Type | Score |
|---|---|
| Novel | 3 |
| Play | 2 |
| Poem | 3 |
| Short story | 2 |
| Speech | 3 |
| Memoir | 2 |
| Seminar | 3 |
| Unit | 2 |
| Argument writing | 3 |
| Grammar | 3 |
| Research | 2 |

No type scored 4.

**About half the rules are universal.** They fit every type they apply to:
- facts and quotations exactly right (R11);
- define the words (R5);
- check during the lesson (S6);
- minutes that agree (S9);
- teach what was asked (S3);
- tell what can be known, ask what can be interpreted (R29);
- model first (S4);
- Brian's points (B1–B8);
- Yawp!'s values (Y1–Y3);
- the reply rules (R14–R17);
- not slow (R19).

**The context and world rules belong to texts that have a world.** R1–R3, R8 and R20–R22 fit the novel, play, story, memoir and nonfiction unit.
- **Wrong** for the argument, grammar and research lessons, and for a seminar after a finished novel. Followed there, they produce decoration and detours.
- **Out of proportion** for a single poem or speech. A close-reading period should spend under ten minutes on context, and a map or timeline earns its place only when place or time is part of the meaning.

**The theme rules fit literature, and nonfiction needs its own words.**
- **Literature:** R26–R32 fit the novel, play, story and poem as written.
- **Nonfiction:** for a speech or memoir, the reviewers asked for *the issue* and *the author's claim* instead of *topic* and *theme*. An author who states the argument outright can be quoted saying so. What stays the students' to find is how the argument works and whether it succeeds.
- **Skill lessons:** R28 ("never tell") was **wrong** as worded. A grammar or argument lesson has to state its rule and its success criteria. *Fixed:* the rule is now scoped to interpreting texts.

**The picture rules need a different visual for skill lessons.** In argument, grammar and research lessons, dual coding (R7, R23) means the model paragraph with its moves color-coded, the sentence with its clauses marked, or the source itself with its author, date and address. It never means a stock picture: the argument deck had a "debate" stamp. In a seminar, the slides are the questions, and pictures compete with them.

**Some rules apply but are worded only for literature:**
- **The lesson arc (R12)** says "thematic topic" and "bring in the text". For writing, it should open on the students' experience of the move and bring in a model.
- **Words and access (S5)** speaks of "verse and dialect". For writing and research it means frames, a partly done model, a shorter source and a partner check.
- **Exit tickets (B3):** "explain a term" drifted into "explain what *Fair is foul* means", with a set answer.

**Bugs the test found, fixed since (PR #997):**
1. **The Douglass unit map didn't build.** Its day cells were too long, so the teacher saw "This unit map didn't build." Long cells are now trimmed instead.
2. **Argument and grammar lessons were labeled "Quotations not checked"** for the example sentences Yawp! wrote. The line now appears only when a work is read.
3. **The research deck had an author's face on its title slide.**
4. **The theme rule now names two things the decks did:**
   - a cast slide that tells what each character wants (Macbeth);
   - a twist revealed before it's read ("The Necklace").
5. **The narration filter now catches "is in the public domain, so…".**

**Still open from this test:**
- **The research lesson invented a source** ("California Dreaming… Dr. Maria Sandoval"). An invented citation in a lesson on evaluating sources teaches the opposite of the objective.
- **The speech lesson mislabeled ethos and logos.**
- **The memoir handout was out of order,** with parts missing.
- **The poem had no glossed words.**
- **The novel lesson had no passage in students' hands.**
- **Three lessons ran over 50 minutes.**
- **The class-starter library (see the question below).**

## Draft rules for each type

Each is short and checkable, drawn from the reviewers' proposals and kept only where more than one lesson needed it, or where the reason was strong. They are labeled by type.

### Literature: novel, play, short story, poem
- **L1 Meet the people first.** Before the first read, the main characters are introduced by name, title and relationship ("Mathilde; her husband, Loisel; her friend, Mme Forestier"), never by what they want or are like.
- **L2 Hear it.** A poem is heard at least twice before any analysis. A play is cast and spoken aloud. The lesson says how this text's lines sound (the witches' four-beat chant, not a general note on blank verse).
- **L3 Short texts whole.** A short story or poem in the public domain is printed whole, with paragraph or line numbers, from a named translation when it is translated.
- **L4 No spoilers.** No plot turn (a twist, a death, an ending) is on a slide or in a prompt before students have read it. *(Now in the instructions.)*
- **L5 Name the device, ask its effect.** Form and devices are taught directly. What they do to the meaning is always asked.
- **L6 Proportion.** A single poem or story gets at most ten minutes of context. A map or timeline appears only when place or time is part of the meaning.

### Nonfiction: speech, essay, memoir
- **N1 The rhetorical situation first.** Speaker, audience, occasion, purpose and what constrained the speaker go on one slide, with pictures of the occasion. This replaces a context day's map and world.
- **N2 The issue and the claim.** Students find the author's claim and how it is made. A claim the author states outright may be quoted. How it works and whether it succeeds is asked.
- **N3 Structure before devices.** Students see the text's moves in order (a diagram) before they analyze single devices. A speech is heard spoken.
- **N4 Two voices in memoir.** Students hear the child then and the writer now, and look for where the older writer comments on the younger.
- **N5 The text in its moment.** A nonfiction unit includes at least one primary source from the time, so students judge the argument against the audience it had to move.

### Writing and language: argument, narrative, grammar
- **W1 Compose live.** Before students write, the teacher drafts an example live, thinking aloud and revising, not only analyzing a finished model.
- **W2 A short checklist.** Every writing task has at most three success criteria, and time for students to check and revise their own draft against them.
- **W3 Their own writing.** When the request says "in their own writing", at least a third of the period goes to students applying the skill to their own draft, with a before-and-after and one sentence on why the change works.
- **W4 Grammar by contrast.** A grammar lesson shows the rule through wrong-and-right pairs, with the structure marked. Its practice mixes correct and incorrect items, and it teaches when *not* to use the structure.
- **W5 The model is the visual.** The memorable form is the model paragraph or sentence with its moves marked in color, not a picture.
- **W6 Mentor texts Yawp! writes.** They are labeled as written by Yawp!, are identical wherever they appear, and contain only evidence that is accurate or clearly hypothetical.

### Research
- **RS1 Real sources in hand.** Students examine real, checkable sources (a printed page or screenshot with author, date and address), or a labeled slot for the teacher's own. Never summaries that already judge the source, and never invented books, authors or citations.
- **RS2 Lateral reading.** Students leave the page to find out who is behind it, alongside any checklist. Relevance to the student's own question is taught before it is assessed.
- **RS3 Build at once.** With no topic given, the lesson is built around a labeled slot for the class's research topic. It never opens by asking what the class is reading.

### Discussion: Socratic seminar
- **D1 A prep sheet.** Students get the questions in advance, with room to note a passage and its page for each.
- **D2 A structure to run and assess.** Inner and outer circles, or a tracker of who speaks, cites and builds, with a task for the outer circle.
- **D3 The teacher's map.** For each question, the notes list the passages students are likely to bring and one follow-up for each. The slides are the questions, without pictures.

### Units
- **U1 Every chapter accounted for.** Each chapter is assigned, or skipped with a reason, at a pace a class can keep (about 15–20 pages a night).
- **U2 A tracker across the unit.** A topic tracker for literature, an argument tracker for nonfiction (claim, evidence, appeal to the audience of the time). Students turn it into their own statement before they draft.
- **U3 Care for the whole book.** Day 1 of a unit warns of hard content anywhere in the book (the killings in *Macbeth*, the slurs and the death in *Of Mice and Men*), with respectful words to use.

## How the planner would use them

The planner's instructions are already long, and a rule that is one sentence among 1,300 lines is followed about half the time. The proposal:
1. **Recognize the type.** Code reads which type of lesson a request is, from its words: poem, novel, play, story, speech, essay, memoir, argument, grammar, research, seminar, unit.
2. **Send only that type's rules.** Only that type's rules go to the planner, as a short section after the shared ones. The rules that are wrong for a type (a world slide for grammar) are switched off for it.
3. **Check by type.** The test and its reviewers score each type against its own rules.

## A question for Kevin

**The class-starter library and R27.** 162 of the 200 prompts in Yawp!'s class-starter library are agree-or-disagree statements. Many of them are claims shaped like a theme:
- "Power corrupts—it doesn't matter who you are."
- "We need other people more than we like to admit."
- "I am the captain of my destiny."

The planner is told to search the library first, so the Macbeth, *Of Mice and Men* and seminar lessons all opened on one.

R27 as I wrote it says never to open on a theme for students to agree or disagree with. Your note was about not telling students what *the book* says. A provocative claim that students argue with may be fine by you. Should R27:
- forbid these;
- allow them when the claim isn't the book's own theme;
- or allow them freely, with the rewrite left to the planner?
