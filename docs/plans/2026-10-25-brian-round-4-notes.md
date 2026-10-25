# Yawp! lesson planner: round 4 notes (Oct 25, 2026)

**From:** Brian. **For:** Kevin, to hand to Claude Code in the repo.
**Tested on:** preview `pr-723` (code `swift-falcon-6020`), the "CRUNCH" build. Test lesson: "Sinners in the Hands of an Angry God," Day 2 of the English 10 unit "Age of Reason/Enlightenment."

## How to use this file

Unzip this folder where Claude Code can read it and tell it:

> Read HANDOFF.md, look at every image in `reference/`, and open the two mockups in `design/`. Build items 1 through 8 in our codebase. For item 7, explain how saving works today before you change anything. Use the mockups only as a visual reference. Ask me before changing anything not listed here.

This file adds to the earlier handoffs (Oct 24 stack and library spec, Oct 25 round 3). If they disagree, go with this file.

## Reference files

| File | What it shows |
|---|---|
| `reference/01-student-share-purple-box.png` | Student share link: the purple box lists "What actually moves people" and "Exit ticket" |
| `reference/02-admin-share-lesson-summary.png` | Admin share view: "Class: Not specified" |
| `reference/03-print-it-for-class.png` | Print it for class panel, with "Get everything in one packet (PDF)" at the bottom |
| `reference/04-send-this-lesson-checklist.png` | Send this lesson panel: the "What they get" checklist to copy for the packet |
| `reference/05-rebuild-slides-message.png` | The planner's message after "Rebuild the slide deck" mentions the Lounge |
| `reference/06-saved-status-and-library-buttons.png` | "Lesson set · saved," "In my library," "My library" |
| `reference/07-library-tiles-current.png` | Library home today: tiles blend into the background |
| `design/1-library-home/LibraryHome.dc.html` | Mockup: library home with light tiles that lift on hover |
| `design/2-unit-view/UnitView.dc.html` | Mockup: a unit opened, with contents and day tabs |

To view a mockup, serve its folder (for example `python3 -m http.server`) and open the `.dc.html` file. The values to copy are in the inline styles and the `<style>` block. Each folder has its own README.

---

## Assignment types

### 1. Exit Ticket: new wording rule

Many generated exit tickets end with this pattern:

> "Write it the way you would explain it to someone who missed class today — not the definition you were given, but what you actually understand it to mean. Write as much as you can, and go further than your first sentence — the more you explain your thinking, the more this is worth. Don't worry about polish. This is about what you understand, not how neatly you say it."

Stop using the "someone who missed class" and "not the definition you were given" language.

**a) "Explain it in your own words" exit tickets** end with exactly:

> "Keep it conversational, in your words, and write as much as you can — the more you can explain your thinking, the better. Don't worry too much about polish. This is about what you understand, not writing perfectly."

Example, before and after:
- Before: "In your own words, explain how Edwards uses reason and emotion together to persuade. Write it the way you would explain it to someone who missed class today — not the definition you were given, but what you actually understand it to mean. Write as much as you can…"
- After: "In your own words, explain how Edwards uses reason and emotion together to persuade. Keep it conversational, in your words, and write as much as you can — the more you can explain your thinking, the better. Don't worry too much about polish. This is about what you understand, not writing perfectly."

**b) Other exit tickets don't get "write as much as you can."** Not every exit ticket is a "more" situation:
- **"What questions do you still have?"** exit tickets: just ask the question. No length push.
- **Quick understanding checks** that ask for a specific answer: ask for the answer. No length push.

A short "don't worry about polish" note is fine on any exit ticket, since exit tickets are rarely, if ever, graded on grammar, syntax or polish. By default, exit tickets shouldn't be scored on those either.

Put these rules in the Exit Ticket type's generation rules (prompt template or system prompt), not in one lesson.

### 2. Default points: Class Starter and Exit Ticket open at 20

When a teacher creates a Class Starter or an Exit Ticket assignment, it currently defaults to 100 points. Default both to **20 points**. Teachers can still change it. Other types keep their current defaults.

---

## Share pages

### 3. Student share link: list assignments by type (`01`)

The purple box lists assignments by a shortened prompt ("What actually moves people") or a generic label ("Exit ticket"). List them by type instead:

> **These writing assignments from class are available to complete in Yawp!**
> - Class Starter
> - Exit Ticket
>
> Open Yawp! to write them

Use the same type names as the headings on the prompts below the box. Apply this to every share view that has this box (student, family, substitute).

### 4. Admin share view: show the class, and label the steps by type (`02`)

- The lesson summary says "Class: Not specified," but this lesson was created for one of my classes. Show the class name and period the lesson is attached to. Only show "Not specified" if the lesson really has no class.
- The first step ("What actually moves people") should be identified as the **Class Starter**. Label every step by its type in this view, like the stack does.

Everything else on the admin page looks great. Don't change it.

---

## The stack page

### 5. "Print a packet for class" with a checklist (`03`, `04`)

Keep the individual downloads exactly as they are (Lesson plan, Slide deck and Student handouts, each with Word / Google Docs / PDF, plus Present / Edit / Rebuild for slides).

Replace the "Get everything in one packet (PDF)" link with a button: **Print a packet for class**. Clicking it opens a checklist, styled like "What they get" in Send this lesson:

- [x] Lesson plan
- [ ] Slide deck *(off by default; slides take up the most pages)*
- [x] Student handouts

When Slide deck is checked, show **Slides per page: 2 / 4**. Four means a 2×2 grid of tiles on each sheet; two is the current layout. Default to 4 so the packet stays short. Apply the same option to the Slide deck PDF download.

Then a button produces **one document** with the checked items in stack order. PDF is required. Add Word and Google Docs if it's easy. The goal: teachers can skip the slides and still print everything else in one go.

### 6. Rebuild slides: fix the message (`05`)

After "Rebuild the slide deck," the planner says "The deck lives in your lesson stack rather than the Lounge…" Teachers don't need to hear about the Lounge here. Replace it with:

> "Here you go: new slides based on your revised stack. Everything's updated and ready to go!"

### 7. Saving: make it clear where work goes (`06`)

What I saw: the lesson seems to autosave every so often, the way Google Docs does. I never clicked the library button and navigated away, and the lesson was already in the unit I'd created it for. That's great, but a teacher can't tell this from the page:

- "Lesson set · saved": saved to where?
- "In my library" looks like a button but reads like a status. "My library" is a small link next to it.
- Nothing warns you before you leave, and nothing tells you where to find the lesson again.

**First, explain to Kevin how saving works today:** what autosaves, when, and where; and what "In my library" / "Save to library" does that autosave doesn't.

Then make it impossible to lose work or lose track of it:
- The status says where it's saved, e.g. "Saved to English 10 › Age of Reason/Enlightenment · 2 min ago." It links there.
- One clear, button-sized library control, either "Save to library" (before) or "In your library ✓" (after). No look-alike pairs.
- If anything isn't saved yet, warn before the teacher leaves the page.
- An easy way back: for example, "Recent lessons" or "Keep planning" at the top of the library and on the planner home.

---

## Library

### 8. Lighter tiles (`07`, `design/1-library-home`)

Right now the unit tiles and "Lessons on their own" rows are like camouflage against the background. Make them lighter so they stand out. Keep the current shadow and the hover lift; those are great. Values from the mockup:

| | Value |
|---|---|
| Page background | `hsl(46.6667 36% 95.098%)` |
| Tile / row background | `hsl(48 100% 99.0196%)` (near white) |
| Border | `1px solid var(--border)`, radius `10px` |
| Resting shadow | `0 1px 2px rgba(28,26,23,.06), 0 4px 12px -4px rgba(28,26,23,.10)` |
| Hover / focus | `transform: translateY(-2px)`; border `hsl(51 8% 68%)`; shadow `0 2px 4px rgba(28,26,23,.06), 0 14px 28px -8px rgba(28,26,23,.20)` |
| Transition | `transform, box-shadow, border-color 160ms ease`; none with `prefers-reduced-motion` |

The unit view mockup (`design/2-unit-view`) uses the same near-white background for its panels (Unit at a glance, Contents, the lesson card). Match it there too.
