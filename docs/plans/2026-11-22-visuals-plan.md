# Visuals: the plan

*Nov 22. Visuals is the weakest dimension in every round of testing (1.50 → 2.00 on the original thirteen lessons, 1.73 on twelve new ones). This plan is based on a diagnosis of the 25 current test decks, live data from the preview, and the research on pictures and learning.*

## What the research says

- **Words plus the right picture beat words alone.** This is Mayer's multimedia principle and Paivio's dual coding, and it is the reason for Kevin's rule R13.
- **The kind of picture matters more than having one.** Carney and Levin's review (2002) sorts pictures by what they do. Decorative pictures do not help, because they share no content with the text. Pictures that represent the thing help. Pictures that organize or interpret (maps, timelines, diagrams of structure) help more.
- **Decoration costs learning.** Mayer's coherence principle: removing extraneous material improved learning in 18 of 19 tests (median effect 0.86). Interesting but irrelevant "seductive details" lower retention and transfer.
- **Pointing at what matters helps.** Signaling (highlighting the essential words) improved learning in 26 of 28 tests (median effect 0.70).
- **Graphic organizers help comprehension,** by roughly 0.5 to 0.9 across meta-analyses, more for struggling readers, and more when students complete them themselves.

The effect sizes are mostly from Mayer's own reviews, which run larger than independent ones. The direction is consistent across sources.

**What this means for Yawp!:** a literature lesson needs fewer "photos about the topic" and more of three things: true pictures of the work's world, diagrams of how the text is built, and marks on the passage itself. A picture that is only a metaphor (a gilded picture frame for "frame narrative") is worse than none.

## What is actually going wrong (diagnosis)

Across the 25 current test decks, 45 of 295 slides had a picture. Of about 80 pictures asked for, about half were not found. I had the preview report the reason for every miss, and checked each failed subject's lead picture on Wikipedia.

| Cause | Examples | Share of misses |
|---|---|---|
| **The size rule rejects old portraits.** Lead pictures under 480 pixels wide are refused. Portraits from before 1950 are often small scans. | Wilfred Owen (333 px), Zora Neale Hurston (408), Edwin Booth as Hamlet (361), Anne Hutchinson (330) | about a quarter, and nearly all the missing author faces |
| **A general subject has a general picture.** The article for a category shows whatever its editors chose. | "Gas mask" shows a 2000s rescue team; "Tenement" a modern Scottish block; "Porch" Chartres cathedral; "Regency era" a bust of George IV; "Nigeria" a flag | about a third |
| **The same subject asked for twice in one deck.** One gets the picture, or neither does, or the picture repeats. | Owen, Hurston, Austen, Hamlet, each asked for twice | about one in eight |
| **Art of a scene is refused.** The checker never keeps an illustration of a fictional character, so the famous paintings are turned away. | Ford Madox Brown's *Romeo and Juliet*, Fuseli's Lady Macbeth | a few per Shakespeare deck |
| **Timeline events searched by phrase.** | "Owen killed", "Novel published", "Wright's critique" | about one in six |
| **No free picture exists.** | *Things Fall Apart*'s cover (in copyright) | few |

Things that are not the problem: rate limits, timeouts and the checker running out of time. None of the misses came from those.

Three more findings, from the decks themselves:

- **Nobody asks for the author.** The King lesson had pictures of Paul the Apostle and Lincoln, and none of King. No title slide (21 of them) has a picture.
- **Wrong-world pictures get through.** A Buckingham Palace state coach for Dickinson's carriage, a gilded frame for a frame narrative, Hemingway on a narrative-writing slide.
- **Close-reading slides have nothing to look at but could.** 42 excerpt and read slides, none with any visual treatment of the passage.

## The design: the right kind of visual for what the slide is doing

| The slide is about | The visual | Source | Status |
|---|---|---|---|
| Where | A map | Drawn by Yawp! | Exists |
| When | A timeline | Drawn by Yawp! | Exists |
| Who wrote it | The author's face, on the title slide | A vetted list, then Wikipedia | **New** |
| What the world looked like | A true picture from the work's time and place | A vetted kit for each most-taught work; then Wikipedia; then a Commons search judged by the checker | **New and fixed** |
| A scene from the work | The well-known painting or engraving of it | The kit; the checker now allows art of a scene | **Fixed** |
| How the text is built | A diagram: the parts of a sonnet or speech, a story inside a story, who wants what | Drawn by Yawp! | **New** |
| What to notice in the passage | The key phrases highlighted on the excerpt, in the colors of the tasks | Drawn by Yawp! | **New** |
| An idea, a routine, the students | Nothing. Words only. | | Rule kept |

## The builds

**1. Fix the lookup.**
- The size floor drops to 320 pixels, so old portraits pass. The checker still judges whether a picture reads when projected.
- One picture per subject per deck, and no picture on two slides.
- When the lead picture fails, a second try: a search of Wikimedia Commons using what the slide says the picture should show, with the checker choosing among the results or refusing them all.
- The checker's rules change: art of a scene (a painting, an engraving, a first-edition illustration) is kept when the subject is that work or scene. A picture must come from the work's world and time. A metaphor is refused.

**2. Vetted picture kits for the most-taught works.** For about 45 works, a hand-written list: the author, and five to eight pictures of the work's world, each with what it shows and when to use it (*Macbeth*: Fuseli's witches, James I, *Daemonologie*, Glamis Castle). Every entry is checked against Wikipedia by script: the article exists, its lead picture is free and large enough. The picture editor chooses from the kit first.

**3. The author on the title slide.** The title slide gets the author's portrait (or, for a context day, the kit's lead picture). It is set by code, so it does not depend on the planner remembering.

**4. Diagrams drawn by Yawp!.** A new `diagram` slide with three kinds, drawn from boxes and text so they work in Present, PowerPoint and PDF:
- **Parts:** a strip of blocks sized by length, each labeled with what it does (a sonnet's three quatrains and couplet; a soliloquy's movements; the parts of a paragraph).
- **Frames:** boxes inside boxes, for a story inside a story (Walton, then Victor, then the creature; Janie telling Pheoby).
- **Cast:** a card for each character with who they are and what they want (the Youngers and the insurance check).

**5. The passage, marked.** An excerpt slide can name up to four phrases to highlight. They are drawn in the deck's colors, matched to the tasks beside them ("Circle" in one color, the phrase in the same color).

**6. The planner's and editor's instructions** are rewritten around the table above: which visual for which job, specific subjects over categories, and never a metaphor.

## How we will know

- **Counts, from the server:** pictures wanted, found, and the reason for each miss, now reported with every lesson.
- **Targets:** every lesson on an author shows the author; at least 8 of 10 pictures asked for are found; no picture is used twice in a deck; every lesson on a poem, speech or frame narrative has a diagram or a marked passage.
- **A test:** the same lessons run again with fresh reviewers, scored on the same rubric, with the slides shown.

## What this plan does not do

- **Generated illustrations.** A drawn "scene" invents details the text does not have, and R6 asks for pictures from the subject's world. Diagrams are drawn, pictures are found.
- **Pictures on routine slides.** Write, Talk and Exit slides stay words only (R7).
- **Student-made organizers on handouts.** The research favors them, and they belong in a later round on handouts.
