# Lesson Planner bot test: the presentation builder

Nov 19, 2026. Ten scripted "bot teachers" used the Lesson Planner on the
preview for PR 996 (main plus the deck studio, every review flag on, the live
model the previews use). Focus: building and changing slide decks. Screenshots
are in `artifacts/lesson-planner-bot-test/`.

> **Later the same day:** findings 2, 3 and 4 and the studio chat's four
> problems were fixed and checked again on the preview. The results are in
> "After the fixes" at the end. The findings below are as first written.

## What the bots did

- Ten lessons, grades 6 to 12, 40 to 90 minutes: Of Mice and Men, King's
  Letter, a first thesis lesson for English learners, "Harlem", "The
  Lottery" (asked in four words), Sudan before Season of Migration, comma
  splices, counterclaims, Douglass, judging sources.
- Each asked for a lesson, then "Build the slide deck for this lesson" (the
  planner's own suggestion), and most asked for one change to the deck.
- 31 planner turns in all, sent the way the page sends them, timed in the
  browser. Every deck was then opened in Present and each slide measured for
  text that does not fit its box. Three decks were downloaded as PowerPoint
  and PDF.
- Eight requests went to the deck studio's "Ask Yawp!" with the same decks.

## Headline numbers

| | Result |
| --- | --- |
| Lessons that ended with a valid first deck | 10 of 10 |
| First decks that needed the second "repair" pass | 10 of 10 |
| Time to a lesson plan | median 57 s (45 to 88) |
| Time to a first deck | median 68 s (53 to 115) |
| Of that, the repair pass | median 20 s (13 to 52) |
| Time for a change to a deck in the chat | median 49 s (19 to 110) |
| Requests for quiz questions that produced a real quiz | 0 of 3 |
| Decks with text visibly cut off in Present | 2 of 13 |
| PowerPoint download | about 0.6 s |
| Slides PDF | about 0.4 s |
| Present, time to load | 2.7 to 3.1 s |
| "Ask Yawp!" in the studio | 5 of 8 right, 2 to 10 s each |

## How the presentation builder works

1. The teacher's message goes to `/api/domain/lesson-planner`. The planner
   gets a long system prompt (the kit's deck rules are about 9 KB of it), the
   last 80 messages, and lookup tools (class starters, Lounge materials).
2. The model writes its whole reply in one call, not streamed. A deck is a
   fenced block of JSON inside the reply.
3. The reply is checked (`validateSlideDeck`). If the deck fails, the JSON
   and the errors go back to the model once (`repairSlideDeck`) and the
   corrected deck replaces it.
4. The reply is stored. The page draws the deck from the JSON: Present, the
   card in the chat, PowerPoint and the PDFs all use one layout
   (`layoutKitV4Slide`).

## Findings, most important first

### 1. Every deck is written twice

All ten first decks spent 13 to 52 seconds after the model had finished
writing and before the reply arrived. The only thing that runs in that gap
is the repair pass, and it runs only when the first deck fails validation.
Plan turns, which have no deck, show no gap.

- It adds about 20 seconds to every deck (a third of the wait).
- It counts as a second request against the teacher's 40-an-hour limit.
- When it fails, the teacher gets no deck (finding 2).

I could not see why the first drafts fail: the reason is recorded only in
the LLM log (`deckFailure`, feature `lesson-planner-deck-repair`). The top
two or three reasons from production would say what to fix at the source,
in the prompt or by accepting what the model writes.

### 2. Asking for quiz questions breaks the deck (3 of 3)

- **King's Letter:** the model wrote `"layout": "quiz"`. That is not a
  layout, the repair failed too, and after 110 seconds the teacher saw
  "This deck didn't build. Ask for it again — say 'rebuild the slide deck,
  shorter'". Shorter would not have helped.
- **"Harlem" and Douglass:** the deck came back, but the quiz questions were
  ordinary writing prompts with "A) B) C) D)" typed into the text. No
  choices, no answer slide.

Cause: the v4 and v4.1 instructions list "quiz" beside the real templates,
`LAYOUT_ALIASES` has no entry for it, and the repair's own rules do not
mention `choices`. The same request in the studio's chat produced a proper
quiz both times, because it is told a quiz is any slide with choices.

### 3. The progress line is wrong for most of the wait

"Writing the lesson" is sent after the model has finished writing
(`route.ts`, line 736). So the teacher watches the last lookup, for example
"Looking through the Teacher's Lounge", for 40 to 80 seconds, and "Writing
the lesson" for a moment at the end. When there is no lookup, "Thinking
about your lesson" stays for the whole wait. Nothing appears on screen
until the full reply is done.

### 4. Text cut off on slides

- **A long word in a panel headline.** "Foreshadowing hunt" is drawn as
  "Foreshadowin". `panelHeadline` picks the size from the headline's length,
  not its longest word (the title slide already checks the longest word).
- **A poem.** The excerpt slide for "Harlem" loses its first line ("What
  happens to a dream deferred?") off the top and clips its last line. The
  passage's size is chosen by word count; a short poem with eleven lines
  does not fit.

Six other slides measured 4 pixels over; nothing is visibly lost on them.
I did not open the PowerPoint files to see how they draw these two slides.

### 5. Where first decks miss the kit's own rules

| Rule | Decks that missed it |
| --- | --- |
| Title slide: title of 3 words or fewer | 4 of 10 |
| Title slide: subtitle of 5 words or fewer | 4 of 10 |
| Never the same template twice in a row | 4 of 10 |
| 8 to 12 slides for 50 minutes | 3 of 10 (all over) |
| Prefer the new layouts | 2 of 10 |
| A discussion question of 18 words or fewer | 2 of 10 |
| No label that v4.1 drops ("Hold this") | 1 of 10 |

All ten opened with title then agenda and closed with the exit slide.
Minutes on the slides were within 4 of the period in 9 of 10.

A vocabulary slide written on request listed four terms; the slide draws
three, so "Independence" was silently left off.

### 6. The same painting, again

Of eight decks with a painting, three used The Great Wave (King, Douglass,
counterclaims). One teacher got it on two lessons in a row, which the
instructions say not to do.

### 7. Getting to a lesson

- A sixth-grade lesson on thesis statements, with grade, length and class
  described, got one line back: "What are you reading with them?" with no
  suggested answers. Asked for the deck, it asked the same thing again. A
  skills lesson with no text has no good answer to that question.
- "lesson on The Lottery" got the same question with useful choices.
- "Add a slide with the key vocabulary" got a question back (where, and
  which terms) instead of a slide. Reasonable, but it is another wait.

### 8. Exit ticket cards (Kevin's screenshot)

Reproduced. At a 1440-pixel window the three cards are 272 pixels wide: the
headers wrap and "Main points of the lesson" leaves its text a column about
three words wide. On a narrower window it becomes one letter per line.

## "Ask Yawp!" in the deck studio, with the live model

| Request | Result |
| --- | --- |
| "Cut the slide that matters least." | Removed one slide and said which, 3.6 s |
| Pointing at a question: "Make this shorter and simpler." | Only the question changed, 10.5 s |
| Pointing at the title: "Shorter." | Only the title changed, 4.6 s |
| "Add a quiz question after slide 6 … then the answer" | A real quiz question and its answer slide, 7.3 s |
| "Add a check for understanding" (a suggestion button) | A real quiz question and answer, 10.4 s |
| "Fewer words on every slide" (a suggestion button) | "I couldn't make that change", 10.6 s |
| "Can you add a photo of Langston Hughes to slide 1?" | "I couldn't make that change" instead of saying why, 2.2 s |
| "Move the exit slide so it comes right after the agenda." | Refused: "the exit slide belongs at the end" |

To fix in the studio's chat:

- **A question and its answer slide were not next to each other.** Both
  times the second new slide landed one slide late: the model counted the
  slide it had just added.
- **One of the two suggestion buttons fails.** A change to every slide is
  the likely cause (a partial slide, or an answer the reader turned down);
  the server does not record why.
- **It refuses a clear request** because the kit's rules say the exit slide
  is last. The deck is the teacher's.
- **A request it cannot do** gets the generic line rather than its reason.

Also seen in the studio: four to six slides in every deck have a title that
is not drawn on the slide (big idea, write, look, quiz, exit). Those titles
show only in the slide list and can be changed only under "More options".

## What worked well

- Every lesson ended with a deck that opens, presents, and downloads.
- The decks read like a teacher's: specific to the text, with speaker notes
  on every slide (138 to 343 characters on average) and timings that add up.
- Changes that were made were made faithfully: "cut to 6 slides" gave 6,
  "tighten every slide" cut the words on slides by 17 percent, "rebuild for
  30 minutes" gave 7 slides and 28 minutes.
- Exports are fast.

## Not tested

- Production: this was a PR preview, on the model previews are set to use.
- A teacher's own uploaded deck, building a deck from the stack page, unit
  plans, class-data lookups, Run the show, sharing.
- More than two teachers at once, phones, Firefox.
- Whether the facts on the slides are right.

## After the fixes (same day, same preview, same bots)

Fixed on the branch and checked again with the live model:

| Finding | Before | After |
| --- | --- | --- |
| 2. Quiz requests break the deck | 3 of 3 came back as a deck that would not open | 2 of 2 new requests gave a deck with real quiz slides (4 and 2 of them); the third bot's earlier broken deck now opens as written |
| 3. "Writing the lesson" | Sent after the writing was done | Sent about 6 seconds in; "Checking the slides" shows when a deck is being repaired |
| 4. Text cut off | "Foreshadowin", and a poem missing its first line | Both slides measured again: nothing clipped |
| Studio chat | 5 of 8 requests right | See below |

The studio chat, the same eight requests:

- "Fewer words on every slide" now applies: 11 slides changed in 9.8 s.
- A quiz question and its answer slide land next to each other.
- "Move the exit slide" is done, with a line saying what it costs.
- A request it cannot do (a photo of Langston Hughes) says why.
- Pointed edits still change only the part pointed at.

What the second pass turned up:

- **A long quiz choice ran under the next choice** (the MLK deck, a choice of
  two lines). Fixed: a row is as tall as its choice, and a slide of long
  choices steps down a size until they fit.
- **"Add a check for understanding" got a question back** ("Which part of
  the lesson should the check follow?") once the chat was told to stop
  guessing. Fixed in the prompt: it asks only when it cannot tell which slide
  is meant, otherwise it chooses and says what it chose.
- **The first progress line arrives late.** "Thinking about your lesson"
  reaches the browser together with the next line, about 6 seconds in:
  something between the app and the browser holds the first line back. Not
  fixed.
- Compare slides' headlines measure 4 pixels over their box. Nothing is
  visibly cut. Not changed.

Still open from the list above: finding 1 (every deck written twice; the
reasons are in the production log's `deckFailure`, which the preview does not
expose), 5, 6, 7 and 8.

