# Kevin's rules R14 to R25: the test, Nov 23

Page with the grid and slides: https://claude.ai/artifact/89Ns2K6AFXGWNNtM77hqzs

## How the test was run

- **The requests:** seven lessons and one unit, sent to the PR #997 preview on Nov 23 and chosen to exercise R14–R25:
  - *Antigone*, *The Odyssey* Book 9, *Macbeth* 1.3, "Dulce et Decorum Est" and *Their Eyes Were Watching God*;
  - context days on *The Great Gatsby* and King's "Letter from Birmingham Jail";
  - a three-week *Of Mice and Men* unit.
- **The scoring:**
  - A script measured what can be measured: where the caveat sits, narration, sentences before the map, seconds per request, places found, pictures on timeline events, world slides, and slides with something to look at.
  - Two reviewers judged the rest from the slides and screenshots.
- **The fixes:** where the reviewers and the script disagreed, the reviewers were right twice. I fixed each problem the test found and pushed it before writing this. Those fixes are listed below, and none has been re-tested yet.

## What the test found

**The reply now reads right:**
- **Caveats come last** (R14): the quotation line and the notes are at the end in every lesson. Three lessons (*Antigone*, the *Odyssey*, "Dulce") still opened with a sentence about their source text ("…is in the public domain, so I can quote it directly"); that's now filtered too.
- **No "not an error" notes** remain (R17).
- **The quotation line** appears on every lesson that quotes and never on the unit map (R25).
- **Narration** (R15) is mostly gone. The reviewers found three new phrasings the filter missed ("I'm using F. Storr's 1912 translation…", "is in the public domain, so I can quote it directly", "Now for the deck:"). All three are now filtered.

**The unit map didn't come first on the page** (R14, R16: fail). The reply put the map second, but the page always drew it under every paragraph. Fixed: the page now draws the lead-in, the map, then the rest.

**A lesson lost its whole deck.** The *Odyssey* reply typed 6,911 blank spaces after "Heroic reason:" and ran out of room. The cause was my own wording in the planner's instructions about blank writing lines. Fixed three ways:
- clearer wording;
- a guard that cuts a runaway;
- a second call that writes the deck from the lesson's plan when slides were asked for and none came back.

**Pictures and worlds are still the weak part:**
- **World slide** (R22): only *Gatsby* had one. Six lessons where students needed to see the world (ancient Greece, the Western Front, Eatonville, Birmingham in 1963) had none. The planner doesn't choose a world slide unless the topic is obviously a world.
- **Timeline pictures** (R21): failed in four of five timelines. Two reasons:
  - *Antigone*'s timeline was events inside the story, which have no pictures.
  - The picture checker turned down right pictures. In the King lesson it refused King's own portrait and Birmingham. The report now records its reason, so the next run will show why.
- **Memorable decks** (R23): only *Gatsby* (8 of 9 content slides with something to look at) and *Macbeth* passed. *Antigone*, *Their Eyes* and King's letter were mostly words.

**The words are still not reliably real** (R24, partial in three of eight):
- **Antigone:** the handout was labeled "F. Storr translation, 1912" but isn't Storr; it's close to Jebb, partly from memory.
- **Odyssey:** the passages labeled "Butler" are from memory ("Odysseus", where Butler writes "Ulysses").
- **King's letter:** the opening is misquoted, and the reply told the teacher it was public domain. That claim is now forbidden.

This is the clearest evidence yet for "text first": the planner should name the passage, and Yawp! should print it from the source, never from memory.

**Maps** (R20): Thebes, Eatonville, Atlanta and Washington were all found.
- **Missing:** the Somme, Craiglockhart and Flushing. All three are now added.
- **Gatsby:** East Egg was pinned on the wrong peninsula.
- **Dulce:** "Craigie Hospital" appeared again; it should be Craiglockhart, and this is the third round it has come back.

**Speed** (R19): the unit took 94 seconds, and lessons took 120–204 seconds; 4 of 8 runs were over the limit. A timed lesson splits its 118 seconds like this:

| Stage | Time |
|---|---|
| Lookups | 10 s |
| The planner writing the lesson (about 19,000 characters, deck included) | 94 s |
| Checks | 6 s |
| Pictures | 8 s |

About 80% of the wait is the writing, so speeding up the other steps barely matters.

## Fixed since the test (pushed to PR #997, not yet re-tested)

1. The unit map is drawn where the reply puts it.
2. No more `&nbsp;` runaways, and a lost deck is rebuilt from the plan.
3. The three narration phrasings above are filtered.
4. Places added: the Somme, Craiglockhart, Passchendaele, Gallipoli, Flushing and Washington, D.C. (however it's written).
5. The quotation line says when Yawp! couldn't get its copy of a text, instead of saying it doesn't have it.
6. No "Picture to add" note under a person's own portrait.
7. The King lesson's false public-domain claim is forbidden.
8. The unit map has no "Starter" chip on every day, and no repeated day count.

## Still open, in order of size

1. **Text first:** passages printed from the source by reference, never from memory. This is the biggest gap and the one the test shows most clearly.
2. **Speed:** two options.
   - Stream the lesson to the teacher as it's written. That would cut the felt wait from about two minutes to about fifteen seconds.
   - Try a newer model on the same request and compare quality and time. That's your call, since it changes cost.
3. **Pictures:** find out why the checker refuses right pictures (now logged), and nudge the planner toward a world slide when the setting is far from students.
4. **Owen's poems:** Gutenberg refuses the preview server, so the texts should be stored in the repo.
