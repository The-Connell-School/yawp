# Lesson Planner: Brian's run 6 (Oct 23, new version)

Brian's notes: `Lesson-Planner-test-2026-10-23-new-version.md`. Three items. What he
wants kept: "Ask the planner" on the stack, and the new-piece card it shows
(type, title, minutes, full description, "+8 min", Hide / + Add).

Starts from `main` after PR 437 landed (#721).

## 1. Library: make it look much cooler

**Notes:** Folders, My Lesson Library and Drafts are the same beige rows with the same
buttons. The design specs are in the Design canvas and handoff package Brian
shared with Kevin and Bryant.

**Status: waiting on the package.** It is not in the repo, the session's uploads,
Kevin's Gmail or Drive, or his claude.ai artifacts. Building a design without it
would be a guess Brian already has an answer to.

**Plan, once it arrives:**
1. Read the package. Map each spec (sections, cards, folder look, Drafts, buttons, empty states) to `app/routes/app.lesson-planner_.library/route.tsx`.
2. Keep what works: folders, Move to…, drag into a folder, rename, delete. Keep every `data-testid` so the run 5 tests still hold.
3. Restyle section by section, behind the stack v3 flag the folders already use.
4. Screenshot each section at desktop and phone width and compare with the canvas.
5. Add e2e checks for anything new the design adds (counts, covers, sorting).

## 2. Build the slide deck right in the stack

**What happens now:** the stack's "Build the deck" and "Rebuild" (Take it to class)
and "Build slides for this lecture" (a lecture step) link to the chat with
`?build=deck`. The chat sends the request and builds the deck there. A deck asked
for in "Ask the planner" comes back as "That's one for the planner".

**Why not the stack chat's own model call:** that call is a short JSON edit. A deck
needs the planner's full turn: the deck kit rules, the stack's contents, the deck
repair pass and the gallery templates. So the stack runs that same turn.

**Plan:**
1. The planner API takes `surface=stack`. Both of the turn's messages are saved
   with that surface. They show in the Ask panel's history, and in the chat as one
   compact line ("On the stack" / "Deck built on the stack").
2. Ask panel: a line that asks for slides or a deck ("build the slide deck",
   "make slides for the lecture") runs the planner turn instead of the stack
   command. It shows the planner's progress label while it works.
3. The reply's deck shows in the panel as a deck card, like the activity card: title,
   slides, minutes, the first slides as a preview, **Preview** (Present, and its
   Close comes back to the stack) and **+ Add to stack**. With a deck already in the
   stack, the button says **Replace the deck in your stack**. A hand-edited deck asks
   first, as filing does everywhere else.
4. "Build the deck", "Rebuild" and "Build slides for this lecture" open the panel on
   Ask the planner and start the build there. No more trip to the chat.
5. Behind stack v3, like the rest of the stack page. The v2 stack page is unchanged.
6. Tests:
   - unit tests for the deck-request check and the surface on saved messages
   - e2e with a stubbed planner turn: build in the stack, preview, add, and the deck
     is in Take it to class without leaving the page

## 3. Close returns you to where you opened it

**What happened:** a deck opened from the chat, then X, landed on the stack. Present's
Close always goes to the stack.

**The rule:** opened from the chat, Close goes to the chat. Opened from the stack, Close
goes to the stack.

**Plan:**
1. One helper, `lesson-return.ts`: the places (`chat`, `stack`, `show`), reading
   `?from=`, and the href for each. The deck editor's `deckEditorReturnTo` and the
   assignment page's `lessonBackHref` (`?back=stack`) use it too, so there is one
   rule.
2. Every opener says where it is:
   - chat deck card: Present and Edit get `from=chat`
   - stack: Present, Edit and Handouts get `from=stack`
   - Run the show: its Present gets `from=show`
3. Every viewer's Close or Back uses it:
   - Present: Close
   - deck editor: Back, and where Save goes
   - handouts: Back to your lesson
   - Run the show: Exit show and "Back to your lesson"
   - Yawp! assignment: Back to your lesson
   With no `from`, each keeps today's place, so old links still work.
4. Tests: unit tests for the helper. E2e: Present opened from the chat closes to the
   chat, opened from the stack closes to the stack, and the deck editor likewise.

## Status

- [ ] 1. Library design: waiting on the design package
- [ ] 2. Deck in the stack
- [ ] 3. Close returns to where you opened it
