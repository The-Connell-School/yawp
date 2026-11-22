# The picture editor: a subject for every teaching slide, and a second look

Nov 22, 2026 (night). Kevin: "okay let's build a detailed build plan for that
and then execute." This carries out steps 1 and 2 of what the live preview
runs called for (see the night status in
`2026-11-22-pictures-on-every-teaching-slide-plan.md`), and sets up step 3.
Paths are relative to `services/web-app/app/` unless they start with a
top-level folder.

## Why

On the second live *Howl* run, 14 slides: the timeline, the notes slide and
the person slide had pictures; **five big-idea statements had none**. The
planner asked for a picture on two of them, and named subjects with no usable
picture ("Postwar America"). On *The Grapes of Wrath*, pictures that passed
every rule were still wrong (a 1932 film poster, the novel's cover for three
characters, a hibiscus for Rose of Sharon). Each was caught by a rule written
after the fact.

Two gaps, two fixes:

1. **Coverage depends on the planner remembering to ask, and asking well.**
   Fix: after the reply, a small fast model reads the deck and names the
   subject for every teaching slide that has none (the *picture editor*).
2. **Wrong pictures are caught one rule at a time.** Fix: before a found
   picture is kept, the same small model looks at it beside the slide's words
   and keeps it or not (the *second look*, D4 in the plan). It also writes the
   alt text from what is actually in the picture.

## The model

Claude Haiku 5.5 (`claude-haiku-5-5`): $0.10 per million input tokens, $0.50
per million output, reads images. Asked at `effort: "low"` for speed. Set by
`LESSON_PLANNER_PICTURE_MODEL` (default `claude-haiku-5-5`); the value `off`
turns both calls off without a deploy.

Expected cost per deck, to be checked on the eval runs:

| Call | Input | Output | Cost |
|---|---|---|---|
| Picture editor | ~2,500 tokens (the deck's teaching slides) | ~400 | ~$0.0005 |
| Second look | ~12 pictures × ~1,600 + 1,500 text ≈ 21,000 | ~800 | ~$0.0025 |

About a third of a cent per deck, beside the planner turn itself (Sonnet,
roughly 30,000 tokens in and 8,000 out: about 20 cents).

Both calls go through `getLLMCompletion` (logged, attributed, metadata-only
payload logs, no fallback to another provider). They are **not** counted
against the teacher's hourly planner requests (`reservePlannerAi`): that cap
counts turns, it would cut a teacher's lessons per hour to a third, and its
message would quote a number of requests the teacher never made. Both calls
happen only inside a turn that was already admitted, so they are bounded by
it.

## 1. The picture editor (`picture-subjects.server.ts`)

**What it reads.** The deck's title and unit, then each *teaching slide with no
picture and no request*: `notes`, `big_idea`, `look`, `discuss` (the first
"what do you know" slide is often about a concrete thing), `picture`. For each:
its number, layout, title and words (body, facts, question, follow-up), at most
400 characters. Routine slides (title, agenda, write, read, quiz, exit, divider)
and slides that already ask are left out. Timeline events and people already
ask for themselves (the night fixes).

**What it is asked.** For each slide, the exact title of the English Wikipedia
article about the concrete thing the slide is about — a person, place, event,
object, building or work of art — whose picture would help a student remember
it; or `null` when the slide is about an idea, the students, or the lesson
itself. Rules in the prompt, from the runs:

- The specific thing, never a general topic ("Levittown, New York", not
  "Suburb" or "Postwar America").
- Real people, places and events. A character in a novel has no photograph:
  name the real thing the slide points at, or `null`.
- Not the film of the book being taught.
- A short `shows` line: what the picture should show.

**What comes back.** JSON: `{"slides": [{"slide": 6, "subject": "Levittown,
New York", "shows": "rows of identical houses from the air"}]}`. Read
leniently (the first JSON object in the text), checked with zod; anything
else is ignored. A slide number that is not one of the slides asked about is
ignored.

**Where it goes.** Each subject is written into the deck as that slide's
`wants` (the planner's own field), so the studio and any later pass see what
was asked. Then the existing lookup runs as before.

**Limits.** One request, 5 seconds. Failure, timeout or `off`: the deck goes on
with what the planner asked for.

## 2. The second look (`picture-check.server.ts`)

**Where.** Inside `resolveDeckPictures`, between the downloads and keeping the
pictures: download everything first, look once, then keep what passed.
Pictures reused from the shelf were kept before and are not looked at again.

**What it sees.** One request with every new candidate: the picture (base64,
the 1,280-pixel rendering already downloaded) and, for each, the subject asked
for, the `shows` line and the slide's words.

**What it is asked.** For each picture: does it show the subject itself (a
portrait of the person, the place, the event, the object; a book's cover only
for the book; a film's poster only for the film)? Would it read when projected
in a classroom (not a page of small type, not a blank or tiny detail)? Is it
fit for the grade (no graphic violence, gore, nudity; never an atrocity
photograph: those are only ever the teacher's choice)? And one plain sentence
of alt text describing what is actually in it.

**What comes back.** JSON: `{"pictures": [{"n": 1, "keep": true, "alt": "…"},
{"n": 2, "keep": false, "why": "a film poster, not the dust storms"}]}`. A
kept picture's alt text replaces the file's description. A picture turned down
is counted empty with the reason `not the thing`.

**If the look fails, nothing it did not see is kept** (changed after the
eval, below: the first design kept unchecked pictures, and on the *Night*
deck a look that ran out of time let the Auschwitz selection-ramp photograph
onto the opening slide). Pictures go to the look four at a time, side by
side, 10 seconds each, so one slow answer costs only its own four. With the
model `off`, the rules alone decide, as before.

**Under the model, a fixed rule:** an article, description or file about the
Holocaust, a genocide, a massacre, a lynching or the dead is never placed
automatically (`for the teacher`), and is never even downloaded. The editor
is told to give no subject for such a slide. A file whose credit says its
copyright is disputed is skipped.

**Limits.** Batches of four, 10 seconds each. At most twelve pictures, as now.

## 3. Time

Today the picture step has a 9-second limit after the reply. With both calls:
the editor (≤ 5 s, typically ~1.5 s), the lookup (typically ~1 s), downloads
and the look (≤ 8 s, typically ~3 s). The whole step gets a 16-second limit;
a typical deck adds about 6 seconds to a turn that takes about 150. Moving the
whole step after the deck opens (D5) remains the next speed fix.

## 4. Counting

The log line per deck gains: subjects named by the editor, pictures looked at,
turned down, unchecked. The preview's logs cannot be read from the build
machine, so the eval below reads the decks themselves.

## 5. Build order (each test first)

| # | What | Done when |
|---|---|---|
| 1 | `getLLMCompletion` passes `outputConfig` through as `output_config` | Test: the request carries `output_config: {effort: "low"}` |
| 2 | Picture editor: which slides, the prompt, reading the answer, writing `wants` | Tests: routine and already-asking slides are not sent; a good answer becomes `wants`; nulls, unknown slide numbers and junk are ignored; a failure leaves the deck as it was |
| 3 | Second look: the request (images and words), reading the verdicts, alt text | Tests: turned-down pictures are never kept and are counted; kept ones carry the model's alt text; a failure keeps the rule-checked pictures and says unchecked |
| 4 | `resolveDeckPictures`: download all, look once, keep what passed | Existing tests still pass; new: the look sees every new candidate and none of the reused |
| 5 | Route: the editor before the lookup, the look inside it, the 16-second limit, the log line | Route tests pass; a model failure never fails the turn |
| 6 | Eval on the preview | See below |

## 6. The eval

Six context days planned live on the preview after the deploy: *Howl*, *The
Grapes of Wrath*, *The Leopard*, *Frankenstein*, *The Great Gatsby*, *Night*
(the last tests the atrocity rule). For each: the deck's JSON and every slide
in Present. Counted per deck:

- teaching slides (notes, big idea, look, picture, timeline, person, map,
  define), and how many carry a picture (a map counts; a timeline when most
  events have one; a person slide when one person does; define never yet);
- pictures shown, and how many are the wrong thing (judged by eye here, then
  by Kevin);
- seconds from send to deck.

The bar from the plan is 85% of teaching slides pictured and 90% of pictures
right. Tonight's baseline from the second *Howl* run: about 40% pictured.

## 7. Next (step 3, not in this build)

A second source for subjects whose Wikipedia picture is missing or unusable:
the Library of Congress (free, no key; strongest on American history and the
FSA photographs), its results going through the same second look. To be
decided on the eval's numbers: if most empty slides are American history,
build it next.

## Eval, Nov 22 (afternoon): six context days on the preview

Run live after the build (commits `d1eb46c`, `e453ed8`). The first run
showed the second look answering and none of its answer being read; reading
was fixed (a schema for the answer, a lenient reader, the answer kept in the
log) and all six were run again.

| Deck | Teaching slides pictured | Wrong pictures on a slide | What kept the rest bare |
|---|---|---|---|
| *Howl* | 3 of 7 (43%) | none | Levittown's lead picture is a county map; the Beat Generation photo was turned down by the look (one man, not the group) |
| *The Grapes of Wrath* | deck lost | — | three slides without a title, and the repair turn ran out of time: fixed, a slide takes its layout's heading |
| *The Leopard* | 2 of 6 (33%) | none | two words slides (no place for a picture); 1 of 5 timeline events found |
| *Frankenstein* | 4 of 6 (67%) | none | the words slide; an abstract big idea |
| *The Great Gatsby* | 3 of 7 (43%) | none | two words slides; the people are fictional (rightly empty) |
| *Night* | 4 of 5 (80%) | **one, serious**: the Auschwitz selection ramp, on "What do you already know?" | the look ran out of time and unchecked pictures were kept: fixed, above |

Across the five decks that built: **16 of 31 teaching slides (52%)**, against
about 40% before the editor. The editor named a subject on 2–3 slides per
deck and left the rest empty on purpose ("a discussion prompt about
responsibility": no real thing stands for it). The look turned down a WWI
combat photo for "1918: the war ends", a different Byron poem's title page,
the *Frankenstein* title page (small type), a city aerial for the Six Gallery,
and one man for "the Beat Generation", and wrote alt text for every picture.

Calls: the editor ~2.5 s (about 1,000 tokens in, 200–500 out), the look
3–7 s for four to seven pictures (4,000–14,000 in, 450–1,200 out). Both well
under a cent per deck.

What the numbers say comes next, by the slides they would fill:

1. **More than one candidate per subject.** Most empty slides have a good
   subject whose Wikipedia lead picture is missing or unusable (Levittown,
   timeline events). Offer the look the article's other pictures too, and let
   it pick one or none.
2. **A picture on the words slide (D1).** Two of the six decks had two words
   slides each, and the slide has no place for a picture.
3. **The Library of Congress** for American subjects (Levittown, the Dust
   Bowl, the 1920s), through the same look.
4. **The silent repair turn.** On *The Leopard* the browser lost the
   connection during the minute-long repair pass (the lesson was saved; the
   teacher saw "That lesson did not come back"). The stream needs a heartbeat.
