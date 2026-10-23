# NCTE Booth Video: Brian's notes on version 3

Brian's second round of notes (Oct 23), on version 3 of the booth video. One
plan per note. All changes are to the recorder in
`services/web-app/scripts/booth-video/`; the app itself does not change.

## 1. Callout cards that float

**Note.** The white explanation boxes should be pure white so they stand out
from the tan app, with a 3D shadow so they seem to hover above the screen.

**Plan.**
- Card background `#FFFFFF` (it was the app's warm off-white).
- A layered, soft shadow (a tight contact shadow plus a wide ambient one) and a
  slight lift as it appears, so the card reads as floating above the page.

## 2. The lesson stack's exact palette

**Note.** Use the exact palette of the lesson stack for the highlight box and
the title cards; the current colors look less attractive.

**Plan.**
- Take the colors straight from the stack's step types
  (`step-types.ts` on the Lesson Planner branch): blue `#5E7DB8` / `#DCE4F2`,
  teal `#3E9A84` / `#D5EBE5`, purple `#7B4FB0` / `#F4EEF9`, pink
  `#C2577F` / `#F6DCE6`, gold `#C99A3E` / `#F3E3C8`, green `#6E8F3C` /
  `#E3E9D4`, with their text colors. No lightened or invented shades, and no
  coral (it reads as orange).
- Each section owns one of them: its title card, and the highlight box, callout
  eyebrow and chapter pill while that section plays.
- Title cards: the section's tint as a full-bleed ground (no tan), the accent
  on the big numeral, and the stack's typefaces (Bricolage Grotesque for
  headings, Instrument Sans for text) instead of Roboto.

## 3. "Sent to every student in the class"

**Note.** Don't show the class's documents after the assignment is created.
Click Create Assignment, say "Sent to every student in the class," and the next
screen is Maya opening her class and finding the assignment.

**Plan.**
- Section 1 ends on the Assignment Builder page right after Create Assignment,
  with that caption. No class page.
- Section 2 opens on Maya's dashboard; she opens her class, the assignment is
  highlighted, and she opens it.

## 4. Less tan and orange

**Note.** Move away from tan and orange as the go-to.

**Plan.** Covered by 1 and 2, plus: the caption bar uses the stack's ink
(`#1C1A17`), the opening and closing cards stay pine with no orange accents
(the URL and kicker take the stack's mint and gold tints), and the cursor's
click ring takes the section color. The app's own screens are unchanged.

## 5. Highlight first, then create

**Note.** Flip the order: first highlight the exit ticket and say "Writing steps
become Yawp! assignments," then show the teacher creating it.

**Plan.** Callout on the exit ticket's card, then open it, Create Assignment,
back to the lesson; the card's "Assignment created" chip shows without a second
callout.

## 6. The slide deck uses the art

**Note.** The deck isn't using the art. Use the most recent slide deck spec.

**Plan.**
- The most recent spec in reach is Deck Kit v3 (`YAWP_Lesson_Deck_Kit-2.pdf`,
  implemented on the Lesson Planner branch per
  `docs/plans/2026-10-21-lesson-deck-kit-v3.md` there). Nothing newer is in the
  repo, Drive or Gmail.
- Under v3 the art comes from the deck's `art` field; the scripted deck didn't
  set it. The deck now hangs Turner's *The Fighting Temeraire* (the library's
  painting; its themes, "the old giving way to the new" and "progress and its
  cost," suit *Fahrenheit 451*), takes its colors from the painting as v3
  requires (rust, slate, ochre), and uses the templates where the art appears:
  title plate, divider (Step 4. body paragraphs), big-idea strip, a Look slide,
  and the exit thumbnail, at most three large appearances.
- The video presents the title, the divider and the Look slide.

## 7. "The less I like our Claude orange"

No action asked. The video's own chrome no longer uses orange. Whether the
app's accent changes is a brand decision for Brian and Bryant.

## Follow-ups (not changes to the video)

- The art library has one painting; v3's reference table names seven more that
  still need images. Real decks only get art when a lesson suits the Turner.
- Brian wants the Lesson Planner on the demo site for the interns. That means
  turning the Lesson Planner branch's flags on for demo once the branch is
  merged (or deploying it there); it's a decision for Kevin and Bryant.

## Order of work

1. Overlay and cards (notes 1, 2, 4).
2. Recorder: hand-off (3) and create order (5).
3. Deck with art (6); validate it with the branch's own parser.
4. Full re-record against the latest Lesson Planner branch, frame QA,
   republish to the same download link.
