# Lesson Planner, Brian's run 4 (Oct 22)

Source: Brian's summary after a full session. He planned The Catcher in
the Rye, chapters 1–4, for two classes, and reopened an older library
lesson. His full notes did not come through with the summary, so this
plan works from the summary alone.

## The items, the cause, the plan

| # | Brian's note | Cause found | Plan |
| --- | --- | --- | --- |
| 1 | One input mode per turn: "What's the text, and where are you in it?" came with buttons for "where" only | The prompt asked for whole-answer buttons on intake turns, and nothing stopped a typed question from sharing a turn with buttons | Prompt rule: a question the teacher must type goes alone, with no buttons or controls. Ask for the title first, on its own; then where the class is in it, with buttons |
| 2 | Every numbered step can be added to the stack; Closing can't, so it never reaches the run of show | A Closing that offers three exit tickets is a "choice" step. Since Oct 22 a choice step has no Add of its own, and picking a ticket filed only the ticket | The option picked carries its step's minutes (one of three tickets under "Closing (5 min)" files as 5 minutes), so the lesson adds up to its period. Filing the step as well was tried and dropped: a "Class starter (8 min): Pick one" step became a near-empty second card and counted its minutes twice |
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

## Brian's detailed notes (session log, Oct 22)

The session log arrived after the summary. Its raw notes file
(`2026-10-22-two-class-lesson-raw-notes.md`) did not, so this works from
the log. Items done above are marked "above".

### Must fix

| # | Note | Done |
| --- | --- | --- |
| 1 | One input mode per turn | Above (prompt rule) |
| 2 | Every numbered step stackable; the lesson totals 45 of 50 | Above. Every step now also shows a state: a choice step says "Pick one below to add it", then "In the stack" |
| 3 | Drag handles | Above. Dragging a step also no longer pushes the cards down under the pointer (the drop slots keep their size) |
| 4 | Back to the run of show after creating an assignment | Above. "Same scroll position" is not kept; the page opens at the top |
| 5 | Share emails: confirm preview, guarantee production, on-screen sent/failed, examples | Above, plus a three-state result: **sent**, **preview** (no email from a preview) or **failed** (red, with the link to send yourself). Examples: `2026-10-22-lesson-emails.png` |
| 6 | One writing number, listed by step name | Above. The meter, the shared pages and the summary read "From Class Starter · Exit Ticket" (what students write) |
| 7 | What counts as writing; older lessons re-tagged on open | Above. Writing is worked out each time a stack loads, so older lessons count paper writing as soon as they open |
| 8 | Yawp! everywhere, before NCTE | Above, plus: capitals no longer turn the name into YAWP! (kickers, running heads, eyebrows and slide labels in the app, the kit plan PDF and Word file, and PowerPoint), the kit kicker reads "Yawp! LESSON PLAN", the LTI line item is "Yawp! essay", and the planner and share rewrites are told the rule. The logo is unchanged |
| 9 | The sub gets the actual slides | Above (slides on the page), plus **Present the slides** full screen from the sub's page |

### Should fix

| Note | Done |
| --- | --- |
| Two classes: "The same lesson for both classes" first, then never asked again | The intake card asks it once, with the same lesson chosen; the planner is told never to ask again |
| Voice: no "not X, but Y", staged contrasts or aphoristic closers | The planner rule quotes Brian's five examples. Every share rewrite has the same rule |
| Receive every contribution warmly | The planner rule, in Brian's terms: wherever students share, one or two kind sentences; correction only when something crosses a line |
| A loading indicator that visibly moves | The progress label's "…" is three moving dots (still for anyone who asks for reduced motion) |
| "Assignment created" once created | The run-of-show card says "Assignment created"; its detail keeps "Created in Yawp! · Open". The chip itself can't be a link (it sits inside the card's toggle) |
| Slides by audience | The sub can present them. Everyone else sees them on the page and can print or save it as a PDF |
| "These writing exercises are available to students as assignments in Yawp!" only for created steps | Done, listing those steps by name |
| Family page: "Today in class, students…" | In the family rewrite |
| Student page: never "Hey!"; purple prompts clickable | "We missed you in class." A prompt made in Yawp! opens Yawp! in a new window. It opens the student's Yawp! home, not the assignment itself (see questions) |
| Admin page: Download PDF / Print | "Print or save as PDF" on every shared page |
| Decks use the full brand; no slide numbers | Done earlier (Lesson Deck Kit v3, Oct 21) |
| "Draft saved" vs "Save to my library"; a library link | Done on the stack page |
| Stack: lesson order, a time on every item, a running total | The panel beside the chat shows minutes on every piece and the total. New pieces already go in lesson order (Oct 20) |

### Questions Brian raised, answered from the code

- **Library "Empty" on every item: a bug.** The library counted only whole
  kept replies (the old way to stack), not pieces filed from the chat.
  Fixed: it counts the pieces (the deck aside) and shows the class.
- **"Built in 51 min"** is clock time from the lesson's first message to
  "Set the lesson", including any time away. It is not active time.
- **Draft titles stay the first prompt.** A lesson is named from its first
  plan's heading. If that heading was generic ("Lesson Plan") it stayed
  on the first message for good. Fixed: while the name is still the first
  message, a later plan names it.
- **"ELA / Secondary Literature" and "Do Now".** The admin rewrite made
  them up. Every rewrite now uses the class name and step names as given.
- **Live mode and projection.** "Open the slides on the projector" opens a
  synced slides window, for a second display. Mirrored, the class sees the
  teacher's screen, so there is now "This screen is on the projector",
  which hides notes and the clock.
- **Step 1 showed slide 3.** Run the show picks the slide a deck marks for
  the step, else one whose title shares two of the step's words, else the
  step's place after a title slide. An agenda slide, or an early slide
  sharing words with the step, gives slide 3. Not changed without seeing
  the deck.
- **The empty first bubble** did not reproduce here.
