# Yawp! lesson planner: round 5 notes (Oct 26, 2026)

**From:** Brian. **For:** Kevin, and Claude Code in the repo.
**Tested on:** preview `pr-723`. Test lessons: a Day 2 *Common Sense* lesson (English 10, Period 3) and a lesson I set on Oct 25 and reopened on Oct 26.

## Read this first

Several items here were already in the round 4 notes (Oct 25), marked **REPEAT** below. They didn't make it into the build. This round, please don't just hand the file to Claude Code: **check each item yourself in the preview** before calling it done. Every item ends with a **Verify** line saying what to look for.

To start Claude Code:

> Read HANDOFF.md, look at every image in `reference/`, and open both mockups in `design/`. Work through the items one at a time. After each one, tell me which files you changed and how to check it in the preview. Use the mockups only as a visual reference. Ask me before changing anything not listed here.

This file adds to the earlier handoffs. If they disagree, go with this file.

## Reference files

| File | What it shows |
|---|---|
| `reference/01-class-link-purple-box-and-prompt.png` | Class link: the purple box lists two assignments, but the prompts section shows only the Class Starter |
| `reference/02-substitute-plan-steps.png` | Substitute plan: the Class Starter reads as a discussion step |
| `reference/03-missed-class-student-outline.png` | Missed-class page: no step types, and "To catch up on the Yawp!…" at the end. Its white card on the cream background is the look the library tiles need |
| `reference/04-missed-class-writing-prompt.png` | Missed-class page: only the Class Starter prompt is shown |
| `reference/05-unit-view-TARGET-design.png` | **The target:** the unit view from the Claude Design mockup |
| `reference/06-lesson-set-21-hours.png` | "Planned in 21 hr" for a lesson that took about 20 minutes |
| `reference/07-ready-for-class-button.png` | The "This lesson is set" button |
| `design/1-library-home/` | Mockup: library home with white tiles |
| `design/2-unit-view/` | Mockup: a unit opened, with contents and day tabs |

To view a mockup, serve its folder (`python3 -m http.server`) and open the `.dc.html` file. The values to copy are in the inline styles and the `<style>` block.

---

## Library

### 1. White tiles (REPEAT, round 4 #8)
The unit tiles and the "Lessons on their own" rows are still not white. Keep the shadow and the hover lift; those are great.
- Tile background: `hsl(48 100% 99.0196%)` (near white) on the page background `hsl(46.6667 36% 95.098%)`
- Resting shadow: `0 1px 2px rgba(28,26,23,.06), 0 4px 12px -4px rgba(28,26,23,.10)`
- The white card in `reference/03` shows the contrast we want.

**Verify:** on the library home, every tile and row is clearly white against the cream page.

### 2. The unit view should match the design
Opening a unit still doesn't look like the Claude Design mockup. It's boxier and less refined. Rebuild it to match `reference/05` and `design/2-unit-view`:
- The "Unit at a glance" panel: lesson and draft counts, writing minutes and %, and the "Writing minutes, day by day" bar chart
- The contents list down the left, with drafts marked
- Day tabs with dates across the top
- The lesson card: a thin colored bar for the run of show, step rows with type chips and Writing tags, and actions at the bottom (Rework in the planner, Duplicate, Move to another unit)
- Use the mockup's type sizes, spacing and colors

**Verify:** put the preview and the mockup side by side. They should look like the same page.

---

## Assignments

### 3. Exit Ticket wording (REPEAT, round 4 #1)
Exit tickets still use the old language. From the missed-class page: *"explain in your own words the single most effective rhetorical move in Common Sense — not a definition, but what you actually understand it to mean. Write as much as you can, push past your first sentence, and don't worry about polish."*

- Drop "not a definition / what you actually understand it to mean," "someone who missed class" and "push past your first sentence."
- Exit tickets that ask students to **explain something in their own words** end with exactly: *"Keep it conversational, in your words, and write as much as you can — the more you can explain your thinking, the better. Don't worry too much about polish. This is about what you understand, not writing perfectly."*
- Exit tickets that ask for **a question** ("What do you still have questions about?") or **a specific answer** (a quick understanding check) don't get "write as much as you can." A short "don't worry about polish" is fine.
- Exit tickets aren't graded on grammar, syntax or polish by default.
- Put this in the Exit Ticket type's generation rules, not in one lesson.

**Verify:** generate three new lessons. Every exit ticket follows these rules, and none contains the old phrases.

### 4. The prompt must be editable in the assignment builder
When I created the exit ticket assignment, I couldn't edit the prompt in the assignment builder. Teachers must be able to edit the prompt text before creating any assignment.

**Verify:** create a Class Starter and an Exit Ticket from the stack, change a word in each prompt, and confirm the change shows up in the student's assignment.

---

## Slides

### 5. Let teachers edit the deck after it's built in the chat
Building the deck in the planner sidebar works great. Once it's built, the teacher also needs an **Edit** option right there, not just Add to lesson / PowerPoint / Present.

**Verify:** build a deck in the chat, click Edit, change a slide, and see the change.

### 6. "Add it" adds the deck. It doesn't reopen the chat.
After building a deck, I closed the chat. The Print it for class panel said I'd built the deck but hadn't added it yet, with an "Add it" button. Clicking it reopened the chat sidebar, where I had to click "Add to lesson." Clicking **Add it** in the panel should add the deck to the lesson right away, with no detour back to the chat.

**Verify:** build a deck, close the chat, click Add it. The deck is added, and the chat stays closed.

---

## Share pages (substitute, student, family, admin, colleague)

### 7. Follow the stack's structure everywhere
Every version of the lesson (substitute plan, missed-class student page, family view, admin view, colleague view, the PDF) should be outlined with the **same step names and types as the stack**:
- If the stack says Class Starter, the heading is **Class Starter**.
- If it says Class Discussion, the heading is **Class Discussion**.
- If it says Exit Ticket, the heading is **Exit Ticket**.

Use them as the headings in both the outline and the prose for every audience.

**Verify:** for one lesson, open each share view next to the stack. The steps and their types match, in order.

### 8. Substitute plan: send students to Yawp! for the writing (`02`)
The sub plans are awesome. I love the voice, and they're clear and organized. But the Yawp! writing assignments read like "Step 2" and "Step 4," and the Class Starter even says "then we'll hear a few responses," so a sub could think they're supposed to lead a discussion. For every step that's a Yawp! assignment (Class Starter, Exit Ticket, Daily Pages, etc.), tell the sub plainly:
- This is a writing assignment in Yawp!
- Have students open Yawp! and find the **Class Starter** (or **Exit Ticket**, etc.)
- How long they have to write

**Verify:** a sub reading only the plan would know to send students to Yawp! for both the Class Starter and the Exit Ticket.

### 9. Missed-class student page: label the steps, show every prompt (`03`, `04`)
- Label the steps by type, so the student understands that class opened with a **Class Starter** in Yawp! and ended with an **Exit Ticket** in Yawp!
- Delete "To catch up on the Yawp!…" That step is the **Exit Ticket**; call it that.
- The writing prompts section shows only the Class Starter. Show **every** Yawp! writing assignment from the lesson (here, the Class Starter and the Exit Ticket), each with its type heading and its "Write it in Yawp!" link. Use "The writing prompts" when there's more than one.

**Verify:** the outline, the purple box and the writing prompts section all list the same assignments, by type.

### 10. Class link: the purple box and the prompts must match (`01`) (partly a REPEAT, round 4 #3)
The purple box lists two assignments ("When rules stop making sense" and "the single most effective rhetorical move in Common Sense"), but "The writing prompt" below shows only the Class Starter. I love how clearly the Class Starter is labeled there. Do the same for the Exit Ticket.
- Purple box: list assignments by type (Class Starter, Exit Ticket), not by shortened prompt.
- Prompts section: every assignment, with a type heading and a "Write it in Yawp!" link.

**Verify:** same as item 10, on the class link.

---

## Setting the lesson

### 11. "Set this lesson," with a celebration (`07`)
- The button reads **"This lesson is set"** before the teacher has clicked it, which sounds like it's already done. Change it to **"Set this lesson."**
- When the teacher clicks it, celebrate. **This is the one place in the product for sparkles:** a burst of confetti in that corner of the page, plus a short text animation that scrolls or pops: **"Hear me yawp, hear me yawp, hear me yaaaaaawp!"** A little dopamine for finishing a lesson.
- Keep it short (a couple of seconds) and don't block the page. If a teacher has Reduce Motion turned on in their device settings (`prefers-reduced-motion`), show the yawp line without the confetti.

**Verify:** click Set this lesson. Confetti and the yawp line play once, then the page settles into the set state.

### 12. "Planned in" should count real working time only (`06`)
I worked on a lesson for about 20 minutes on Oct 25 and set it. On Oct 26 I reopened it, edited for a minute and set it again. The panel now says **"Planned in 21 hr, from first message to set."** Count only the time the teacher actually spent with the lesson open and active, not the clock time since the first message. Idle time with the tab open shouldn't count either.

**Verify:** set a lesson, come back the next day, make one edit and set it again. "Planned in" goes up by a minute or two, not a day.
