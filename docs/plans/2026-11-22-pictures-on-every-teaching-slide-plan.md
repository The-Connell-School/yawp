# A picture on every teaching slide: where we are, and the plan

Nov 22, 2026. Source: Kevin, on a 1950s America context deck for *Howl* that
came back with a facts slide, a timeline and a statement about the Beats, and
no pictures: "We need to consider the learning principle of dual encoding …
pictures would really facilitate remembering here. Where are we at with
meaningfully incorporating salient pictures on the fly? … make a detailed
plan to solve that problem once and for all."

This plan replaces phase 2 of `2026-11-21-slides-that-teach-build-plan.md`.
Paths are relative to `services/web-app/app/` unless they start with a
top-level folder.

## Status, Nov 22 (evening)

Kevin: "ok I like your plan … build that." Built on
`claude/context-tools-timeline-map` (PR #997), behind
`lesson_planner_found_pictures`, each part test first.

Built:

- **D1, in part.** A facts slide (`notes`), a big idea and each timeline
  event can hold a picture, and the kit draws it beside the words (Present,
  the studio, PowerPoint and the PDF, through the existing picture element).
  A people slide and a picture slide already could.
- **D2.** Slides, events and people say what they want
  (`"wants": { "subject", "shows" }`). The planner is told to ask on every
  teaching slide. The `find_pictures` tool is no longer offered.
- **D3, rung 3 (and a first cache, rung 2).** `resolveDeckPictures` asks
  Wikipedia for each subject's lead picture (free licenses only) and the
  files' credits: two requests for a whole deck, then the downloads together.
  A picture kept for a subject is copied for the next lesson that wants it.
- **"No picture is better than a wrong one"**, without a vision model yet:
  maps, logos, files too small to project and subjects with no free picture
  are left empty, and a town's lead picture is kept only when its file is
  named for the town. A picture slide whose picture is not found becomes its
  question.
- **D5, in part.** Pictures are found after the planner's reply, inside a
  nine-second limit, and a failure leaves the deck as written. (Not yet in
  the background with the deck already open.)
- **Counting, in part.** One log line per deck: wanted, filled, reused,
  empty by reason. No page for it yet.

Measured live, Nov 22, on eleven subjects from the 1950s deck: 0.98 seconds;
five filled (Sputnik, the Korean War, Ginsberg, Disneyland, and a wrong one
for Levittown, since fixed by the town rule); six empty (two with no free
picture, two too small, and the *Howl* first edition twice, unavailable).
An earlier lookup of twenty subjects returned nineteen lead pictures in 0.36
seconds.

Found along the way:

- **Wikimedia limits anonymous servers hard.** From the build machine, API
  requests were refused (HTTP 429) for minutes at a time between successes.
  The code sends a contact address and, when `WIKIMEDIA_ACCESS_TOKEN` is set,
  a token. A free token is needed before this can be relied on; whether the
  preview host is limited the same way is not known yet.
- **The 20th century is thin**, as expected: no free lead picture for Brown
  v. Board, Kerouac or Corso.

Not built yet: pictures on `define`, `statement` and `excerpt` slides; the
vision check (D4); other sources (the Library of Congress first); the
background fill; the studio's alternates and "not this one"; S3; packs; the
counting page; the R13 lint.

## 1. Where we are (as of the morning of Nov 22)

Short answer: the plumbing exists, and the part that makes the right picture
show up on a slide does not.

| Piece | State |
|---|---|
| Storing a found picture with a lesson, with its credit, license and source | Built (PR #997) |
| The credit shown on every screen, in PowerPoint and in the PDF | Built |
| License filter: public domain, CC0, CC BY, CC BY-SA only | Built |
| The planner's `find_pictures` tool (Wikimedia Commons search) | Built, behind `lesson_planner_found_pictures`; never seen working on the preview |
| A picture on a facts, big-idea, words or timeline slide | **Not possible.** Only `picture` and `person` slides can hold one |
| A guarantee that a teaching slide gets a picture | **None.** The planner searches only if it chooses to |
| A check that the picture shows what the slide is about | **None.** Only the license is checked |
| A source that answers reliably | **No.** See below |
| A way to know how often pictures are found | **None.** Nothing is counted |

Why the 1950s deck had no pictures. Three causes, each checked on Nov 22:

1. **The slides had nowhere to put one.** "The postwar boom" (a `notes`
   slide), the timeline and the Beats statement (`big_idea`) are layouts with
   no picture slot. Even a perfect picture of Levittown could not have gone on
   the slide that talks about Levittown.
2. **Finding a picture is left to the planner.** It is a tool the model may
   call. Nothing requires it to, and nothing fails when it does not. (Whether
   it called it on this deck is unknown: the preview's logs can't be read from
   the build machine.)
3. **The one source is unreliable, and unselective when it answers.**
   - Commons' search refused requests from the build machine in bursts all
     weekend (HTTP 429 on the first request of the day, HTTP 200 a minute
     later). A shared server address is throttled as one client. The preview
     host is likely treated the same way.
   - When it answered, the first results were often not the thing. The Commons
     category "Giuseppe Garibaldi" opens with a bust and three photographs of
     an Italian Navy aircraft carrier named after him. "Levittown, New York"
     opens with a Kmart liquidation sale and a schoolhouse sign. Today's code
     would take the first three with an open license.

## 2. The principle: dual coding

**R13 (new rule). Every slide that teaches content pairs its words with a
picture of the thing itself.** Students remember what they both read and see
(Paivio's dual coding; Mayer's multimedia principles). What that means on a
slide:

- **The picture shows the referent, not a mood.** Levittown from the air for
  the Levittown fact; Ginsberg reading for the Beats. No decoration: a picture
  that does not carry the idea costs attention (Mayer's coherence principle).
- **Words and picture sit together**, on the same slide, side by side
  (contiguity), and the words get shorter when a picture carries part of the
  load.
- **One idea, one picture.** A timeline shows each event's own picture as that
  event comes into focus.
- **A wrong picture is worse than none.** When Yawp! is not sure, the slide
  gets a labeled slot that says what belongs there.
- **Routine slides are exempt**: agenda, write, talk, exit.

*Check:* on a context day, at least 85% of teaching slides carry a picture,
and each picture's record says what it shows.

## 3. The design: five decisions

**D1. A picture is something any teaching slide can have, not a kind of
slide.** `notes`, `big_idea`, `define`, `statement`, `excerpt` and each
timeline event gain an optional picture. The kit lays the slide out with the
picture taking a third to a half and the words reflowing beside it. A timeline
shows a small picture at each event and the focused event's picture large.

**D2. The planner says what it wants; Yawp! gets it.** No tool call. In the
deck itself, a slide carries a request:

```json
"wants": { "subject": "Levittown, New York", "kind": "place",
           "shows": "the rows of identical houses from the air", "when": "about 1950" }
```

After the reply, Yawp! fills every request, the way it already finds every
map pin (`resolveDeckPlaces`). The model never writes an address or a credit,
and it spends no extra rounds or time. A teaching slide with no request fails
the deck lint and gets one repair turn.

**D3. Find by subject first, search last.** Each request goes down a ladder
and stops at the first rung that holds:

1. **A curated pack** for the text being taught (section 5): hand-checked.
2. **The shared cache**: a picture any deck already found for this subject and
   no teacher rejected.
3. **The subject's own picture**: the lead image of its Wikipedia article and
   its Wikidata image. For "Giuseppe Garibaldi" that is his portrait, not the
   aircraft carrier. (Not yet tried: the build machine can't reach
   wikipedia.org.)
4. **Collection search**, several sources asked together: the Library of
   Congress (strong on American history: the Dust Bowl, Levittown, the FSA
   photographs), Smithsonian Open Access, the Met, Europeana, Openverse, and
   Commons search.
5. **A labeled slot** for the teacher.

**D4. A second look before a picture goes on a slide.** For rungs 3 and 4, a
small vision model is shown the best four candidates with the slide's words
and the `shows` line. It picks one or none, and it screens for: the right
subject (a general, not a ship), legible when projected, and fit for the
grade (no graphic violence or nudity; atrocity photographs are never placed
automatically, only offered to the teacher). It also writes the alt text from
what is actually in the picture.

**D5. Pictures never hold up a lesson.** The deck opens the moment the
planner's reply lands, with slots where pictures are coming. Requests are
filled in the background, together, each on a short timeout, and the pictures
appear on the open deck within seconds. A request that fails becomes a slot.
(The Nov 21 timeout came from doing this inside the planner's turn.)

## 4. What it runs on

- **Proper access to the sources.** A contact address in every request and a
  registered Wikimedia API token (signed-in clients are not throttled as an
  anonymous shared address), an api.data.gov key for the Smithsonian, and
  client credentials for Openverse. The Library of Congress and the Met need
  none. The preview and production hosts must be allowed to reach each.
- **A shared picture cache** (`PictureCache`): subject, kind, source, license,
  credit, source page, size, the vision verdict, how often used, how often a
  teacher removed it. Shared across schools: it holds only openly licensed
  pictures. A teacher's own uploads never go in it.
- **Files in S3, not in the database.** Found pictures are stored today as
  bytes in a Postgres row per lesson: fine for a first slice, wrong for a
  cache every school reads.
- **A queue with per-source limits and backoff**, so one busy source never
  slows the rest.
- **Counting.** For every deck: requests made, filled at which rung, left
  empty and why. One admin page shows it. "Where are we" becomes a number.

## 5. Curated packs for the texts teachers actually teach

Search will never be as good as a picture a person chose. For the most-taught
texts, a pack of 12 to 20 pictures each: the author, the setting, the period,
the key events and objects, the first edition. Each records what it shows and
which idea it belongs with. The pipeline proposes them; Kevin or Brian
approves each in an admin page (keep, swap, drop). Start with the twelve
texts of the eval set, then the next thirty by how often they are planned.

Film stills are not in packs (copyright). Those stay a labeled slot the
teacher fills from their own files.

## 6. The teacher stays in charge (deck studio)

- Click any picture: the other candidates, "use my own", or remove.
- "Not this one" removes it and lowers it in the shared cache.
- A strip lists the pictures Yawp! found, each with its credit and a link to
  its source page.
- A slot says exactly what belongs there ("Add a still from the 1963 film:
  the ball").

## 7. Build order

Each phase is behind `lesson_planner_found_pictures`, written test first, and
ends on the eval set of twelve context days (the texts in the Nov 21 plan,
plus *Howl*).

| Phase | What | Size | Done when |
|---|---|---|---|
| 0 | Measure. Count requests and results on the preview; register the accounts; allow the hosts; run the eval set for a baseline | 1–2 days | We know today's fill rate (expected near zero) |
| A | Pictures on every teaching slide (D1): schema, kit layouts, PowerPoint, PDF, studio swap | 3–4 days | A teacher's own picture can go on a facts, big-idea, words and timeline slide |
| B | Requests in the deck and the background resolver (D2, D5), ladder rungs 3 and 4 with Wikipedia, the Library of Congress and Commons (D3), the cache and S3 | 5–6 days | Decks fill without a tool call, and no lesson waits |
| C | The second look (D4): subject, legibility, grade, alt text | 3 days | No aircraft carriers: wrong-subject picks under 10% on the eval set |
| D | Curated packs for the twelve eval texts, with the approval page (alongside B and C) | 1 week, mostly review time | Every pack approved by Kevin or Brian |
| E | Deck lint for R13, the counting page, more sources | 2–3 days | The gate below holds |

About three to four weeks of build, with Kevin's and Brian's review time in
phase D.

**"Solved" means**, on the eval set:

- at least 85% of teaching slides carry a picture (100% for a text with a
  pack);
- at least 90% of those are judged the right picture by Kevin or Brian;
- no lesson fails or waits on pictures;
- every picture shows its credit.

## 8. What this will not solve

- **The 20th century is thinner than the 19th.** Open pictures of Ginsberg
  exist; the famous photographs of Kerouac are in copyright. Packs and slots
  cover the gap, and the planner should say so.
- **Film stills** are never automatic.
- **A wrong picture can still get through.** The second look, the teacher's
  review and the counting page keep it rare and visible; they do not make it
  impossible.
- **Cost.** One small vision call per requested picture, and storage. To be
  measured in phase 0 before phase C is built.

## 9. Decisions needed

1. **A contact address and accounts** for Wikimedia, api.data.gov and
   Openverse (free). Who owns them?
2. **A vision model looking at candidate pictures**: an added cost per deck.
   Go ahead on the understanding that phase 0 prices it first?
3. **The first packs.** The twelve eval texts, or a different twelve?
