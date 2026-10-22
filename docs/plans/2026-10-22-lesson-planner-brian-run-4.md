# Lesson Planner, Brian's run 4 (Oct 22)

Source: Brian's summary after a full session. He planned The Catcher in
the Rye, chapters 1–4, for two classes, and reopened an older library
lesson. His full notes did not come through with the summary, so this
plan works from the summary alone.

## The items, the cause, the plan

| # | Brian's note | Cause found | Plan |
| --- | --- | --- | --- |
| 1 | One input mode per turn: "What's the text, and where are you in it?" came with buttons for "where" only | The prompt asked for whole-answer buttons on intake turns, and nothing stopped a typed question from sharing a turn with buttons | Prompt rule: a question the teacher must type goes alone, with no buttons or controls. Ask for the title first, on its own; then where the class is in it, with buttons |
| 2 | Every numbered step can be added to the stack; Closing can't, so it never reaches the run of show | A Closing that offers three exit tickets is a "choice" step. Since Oct 22 a choice step has no Add of its own, and picking a ticket filed only the ticket | Picking an option under a step with words of its own files that step too, in one request. Taking out the last option takes the step out |
| 3 | Drag handles in the stack don't work; the arrows do | (a) A card was only a drop target "before" itself, so dragging one place down did nothing. (b) Between cards there was no drop target for a step, and the "+" insert button overlaps the edge of each card | `movedToSlot`: a drop on a card's top half goes before it and on its bottom half after it. While a step is dragged, every gap is a "Drop here" slot. The slots open just after the drag starts, so changing the page can't cancel it |
| 4 | After creating an assignment, "back" should go to the run of show, not the chat | "Back to your lesson" always went to the chat | Create links from the stack carry `back=stack`, and the assignment page's back link follows it. Links from the chat still go back to the chat |
| 5 | Share emails (sub, admin) didn't arrive from the preview. Preview mode? What does each email look like? | Yes. On a PR preview, email is logged and reported as sent, but never delivered. The page still said "Sent to …" | The send result says whether an email really went out; a preview says "No email went out from this preview" and gives the link. Each audience gets its own email (subject, a line on what it is, button). Previews of all four: `docs/plans/2026-10-22-lesson-emails.png` |
| 6 | One writing-time number from the stack (admin page said 29% and 20%). Starters, exit tickets, Daily Pages, thesis essays and paper reflections all count | 20% was the stack's number. The admin rewrite was asked for "how much of the period is writing" and made up 29%. Writing counted only Yawp! assignments and tagged types, so prose writing steps (an exit ticket on paper, a written reflection) did not count | The admin rewrite no longer reports a share, and any sentence in a rewrite that puts a percentage on writing is dropped. Writing counts class starters wherever they are filed, plus steps whose words say students write: exit ticket or slip, quick write, journal, written reflection, "students write", thesis, Daily Pages |
| 7 | Yawp! everywhere, site-wide | Many user-facing strings said "Yawp" | Sweep user-facing strings to "Yawp!": the Reporter, admin notices, the sign-in code email, brand alt text, the classroom report. Not changed: code identifiers, headers, test names, LTI gradebook line items (an LMS may match on the label), and Whitman's "barbaric yawp" |
| E1 | Voice: no "not this, but that" | — | Prompt rule |
| E2 | Receive every student contribution warmly | — | Prompt rule: scripted responses to a wrong or partial answer name what is right first; never a flat "no" |
| E3 | Slides by audience on the share pages | Shared pages listed slide text in boxes | The slides are drawn as the teacher presents them (gallery, tile or plain). Sub: slides with what to say under each. Student: the slides. Family and admin: the slides as an option, off by default |
| E4 | How does Run the show work if a teacher projects their laptop screen? | It assumes two screens: the teacher's view on the laptop and the slides in a second window on the projector. Mirrored, the class would see the teacher's notes and clock | "This screen is on the projector" (class view) hides the notes, the clock and the times, and shows the step and its slide large. Remembered on the device |

## Order of work

Tests first in each step; one commit per change.

1. Items 2, 3, 4 (the stack and its links).
2. Items 6 and 5 (writing time, email).
3. E3 and item 7 (share slides, the Yawp! sweep).
4. Item 1, E1, E2 (prompt; version `2026-10-22-review-v1`).
5. E4 (class view).
6. e2e spec `teacher.lesson-planner-run-4.spec.ts`, the full planner suites, typecheck, push.

## Status (Oct 22)

All done and on PR 437. Notes:

- **No new flag.** Each change fixes behavior behind the flags that already
  hold it (stack v2/v3, share, run show). The prompt change takes effect
  with the new prompt version.
- **Writing detection reads the step's words.** A step that only mentions
  writing ("students write their names on the board") would count. That is
  rare in a plan, and counting paper writing is what Brian asked for.
- **Email on the preview.** Mail still does not go out from PR previews;
  that is how previews are set up. Brian can test real delivery on demo or
  production, or read the four emails in the image above.
- **Room view is for one screen.** With two screens, keep Run the show on
  the laptop and open the slides on the projector, as before.
