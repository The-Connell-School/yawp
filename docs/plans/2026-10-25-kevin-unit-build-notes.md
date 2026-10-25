# Kevin's feedback: building a unit in the new lesson planner

Recorded on the PR 723 preview while building a unit. Each note is written as a task for Claude Code to carry out, with Kevin's own words kept underneath.

**Status:** all 12 notes collected (Oct 25). The plan to carry them out is in `docs/plans/2026-10-25-kevin-unit-build-feedback.md`.

## Notes

### 1. The class-length question should match what the teacher is building
**Area:** planner chat, intake questions

**What happened:** Kevin typed that he wanted to create a unit. The planner asked its usual intake questions: which class it's for, then "How long is the period?"

**What to change:**
- When the teacher is planning a **unit** (several days), word the length question for many days, e.g. "How long is each class period?"
- When the teacher is planning **one lesson**, keep the single-period wording.
- Decide which one it is from what the teacher asked for ("a unit", "a week", "five days", "a lesson on…"). The length question and anything else in intake that depends on it should use that wording.
- The bar: a teacher should never feel the planner misunderstood what they're making. It's a small detail, but it matters.

**Kevin's words (note 1):** "When someone says unit, it does make sense to ask how long the lesson is. But we might just need to phrase it a little differently, like, how long is each period? … We need to be wise enough and alert enough to say, okay, is the user building one period or multiple periods in a unit? And the question needs to reflect that. We don't want teachers to feel like this thing does not understand what they're trying to do."

### 2. No "code" text in the planner's replies
**Area:** planner chat replies (and anywhere the planner's words are shown)

**What happened:** Some words in the planner's replies show in a grey box in a different, code-like font. They aren't links. Examples from Kevin's screen:
- "the class starters on day 1 through 4 are written into each day's `students` field": "students" in a grey box.
- "When you build those days, each one gets its own `yawp-daily-pages` block with `kind:class-starter`": internal names, also in grey boxes.

**Why it happens:**
- The planner writes some words between backticks, the Markdown mark for code, and the chat shows those as grey code boxes.
- It also names the app's own internal formats (`yawp-daily-pages` blocks, `kind:`, the `students` field). Those are for the app, never for the teacher.

**What to change:**
- Planner replies never use inline code or code formatting for normal words. They use plain words, and bold where something needs emphasis.
- Planner replies never mention internal names: block types, fence names, field names, `kind:` values or anything like them. Say what it means for the teacher instead, e.g. "Each day gets its own Class Starter, ready to add to that day."
- Add this to the planner's prompt rules. Also add a safety net in the chat display: an inline code span in a planner reply shows as plain text. Keep the real structured cards working (the deck, exit ticket and daily pages cards are built from those blocks).
- Check the stack page's Ask the planner answers and the How it works guide for the same problem.
- The bar: teachers should feel the computer part was done for them. Nothing should make them wonder whether they need to know how to code.

**Kevin's words:** "Some text gets like grayed out … it has like a slightly different font than the rest of the text, and it looks a little computer programmy … It feels like I'm talking to Claude Code … Do I have to be someone who knows how to code to do this? … I'd like an explanation as to why it's doing that, and if it's not useful to the user, then we should get rid of it … that all feels like you're a computer scientist, not a teacher … I want to feel like we did the computer part for them."

### 3. End the unit plan with two or three questions back to the teacher
**Area:** planner chat, the unit plan reply

**What's working (keep it):**
- The unit plan's formatting.
- The overview commentary at the top.
- The way the plan itself sits in its own colored block, set apart from the chat. Brian may have thoughts on the exact color, but keep it set apart.

**What to change:**
- After the unit plan, before or beside the obvious next step (build the days), the planner asks **two or three** short questions that check the plan before any days get built.
- Keep them simple, warm and jargon-free. Never a long list, never questions for their own sake.
- Pick the questions that would change the plan most, for example:
  - "Are these the main ideas you want, broken into these days?"
  - "Do the day titles get at what you want each day to do?"
  - "Do you like how it ends, with a thesis-driven essay on a Girardian reading of *Julius Caesar*? Or would a paragraph or a close reading paragraph fit better?"
- Best as quick options the teacher can tap (like the intake questions), with a way to just say "Looks good, build the days."

**Also check:** the unit ended with a Girardian reading of *Julius Caesar*. Kevin had planned a lesson about Girard earlier, and it shows in his history. Find out whether the planner carried that over from his past lessons (the conversation memory added in Brian's run 5) or came up with it on its own. If it came from memory, that's fine, but the plan should say so in a short line ("Building on your Girard lesson…"), so it doesn't feel random. That way the teacher can keep it or drop it.

**Kevin's words:** "I love the formatting. I love, like, the overarching commentary at the top. I like the way that … the actual unit plan is colored differently … The obvious next thing to do is build this day, but there might be some questions … that we could add at the bottom. Don't add a bunch for the sake of adding questions … are these the main ideas that you want of the unit that you want broken into these days? Do you like the titles … Do you like what it ends with, a Girardian reading of Julius Caesar? … can I change this from a thesis-driven essay to a paragraph or a close reading paragraph? Don't add too many questions. Don't make it overwhelming … two or three really high-leverage, simple, non-jargony questions."

### 4. Saving a unit: make it clear the arc is kept, and show it with the unit
**Area:** planner chat (unit plan reply), library unit page
**Status:** needs a decision with Kevin (and maybe Brian) before building. Options below.

**Kevin's question:** He likes the unit plan. How does he save it? Does the unit only save when he builds a day? A teacher who likes the arc wants to know it's sealed before building days one at a time.

**What the app does today (checked in the code):**
- The unit **is** saved, as soon as the planner writes the unit plan. That moment creates a unit in the library, and the chat becomes "the chat that planned this unit".
- Each **Build this day** makes that day its own lesson inside the unit, with its own stack.
- So there are stacks for **lessons** (one per day). There is no stack for the **unit**. The unit is a container for its days.
- Brian's library design (Oct 24 handoff) also has no unit-level stack: a unit is its days, in order. It doesn't say where the unit's arc lives.

**The gaps:**
1. The teacher isn't told the unit was saved, so it feels like nothing is kept until a day is built.
2. The arc (big ideas, day titles, how it ends) lives only in the chat. On the library's unit page, before any day is built, the unit shows "No lessons yet". The plan only appears as a small "The chat that planned this unit" link.

**Options (pick before building):**
- **A. Say it, small change.** Under the unit plan, a line like "Saved to your library as *Julius Caesar*. Build the days whenever you're ready." with an **Open the unit** link. Nothing new to save, and nothing for the teacher to manage.
- **B. A + show the arc on the unit page.** The library's unit page shows the unit plan (overview, each day's title and focus, how it ends) above the day tabs. Days not built yet show as planned days with **Build this day**. Then the unit page is the home of the arc, and the chat isn't the only place to find it.
- **C. A unit-level stack.** Treat the unit like a lesson, with its own stack page. Bigger change, and it overlaps with the unit page Brian designed. Not recommended unless Brian wants it.

Leaning toward **B**: it answers "is it saved?" in the chat and gives the arc a lasting home where teachers already look. Check with Brian whether planned-but-not-built days should show in his unit page design.

**Kevin's words:** "How do I save this unit? Or does the unit not save until I build the day? … if I like what I see so far, how do I make sure I like kind of seal a bunch of this? I know that it saves in the chat. It might be worth reminding them somehow … I want to make sure that the whole, if I like the arc is saved somehow. Maybe like that's the first thing that saves in the stack … do we have stacks for units versus stacks for lessons? … I'd be curious to take a look at that before we come up with a plan."

### 5. "Build this day" should show a short line, not a wall of text
**Area:** planner chat, the message a **Build this day** click sends

**What happened:** Clicking **Build this day** on the unit map puts a big orange message in the chat, as if the teacher had typed it. It spells out the whole request in one block: the day, the title, the objective, the students line, the reading, the minutes, and "keep it inside the arc of the unit…". The teacher reads it and wonders, "Wait, what did I say?", then starts reading it to check or change it.

**Why it happens:** The button sends the day's full details as the teacher's message (`buildDayRequest` in `unit-plan.ts`). That's so the planner builds exactly the day the teacher picked, and the chat shows the whole message.

**What to change:**
- In the chat, show the click as one short line: **"Building Day 1 of *Julius Caesar*: [day title]"**.
- Keep sending the planner the full details behind the scenes, so the day is still built from the map's own words. Only what the teacher sees changes.
- Optional: a small "Details" toggle under the line shows a tidy overview of what's being built: objective, reading, minutes, one per line. Never a paragraph.
- Do the same for any other button that sends a long message as the teacher (e.g. Rework a step, Build slides for this lecture). Check them all.

**Kevin's words:** "When we click build this day … our response is this like big orange blob that kind of like writes everything out … the teacher like kind of looks and is like, wait, what did I say to build? … Is there any way we can simplify it so that it sends that direction, but that it just says like building day one of, and then has the title? … the summary needs to be like one line, or like a really neatly formatted overview of the whole thing that it's building."

### 6. The stack is the lesson: make that obvious, and stop making teachers add things twice
**Area:** planner chat cards, the Create in Yawp! flow, onboarding

Three parts. 6a is a clear fix. 6b and 6c need a decision.

#### 6a. Making something in Yawp! should add it to the lesson automatically (clear fix)
**What happened:** Kevin clicked **Create** on a Class Starter in the chat and made the Yawp! assignment. Then he still had to come back and click **Add to stack** for it to be part of the lesson. That only makes sense to someone who already has the "build a stack of pieces" mental model.

**What to change:**
- Creating an assignment from a chat card also adds that piece to the lesson's stack, if it isn't there already. The card then shows both "Assignment created" and "In the stack", with no second click.
- If the teacher later takes it out of the stack, the assignment stays made. Only its place in the lesson changes.

#### 6b. After creating it, bring the teacher back to the lesson (decide)
**What happened:** After **Create**, Kevin landed on the Class Starter assignment page and had to find his own way back to the lesson.

**Options:**
- Go straight back to the lesson (chat or stack, wherever they came from), with a short confirmation: "Class Starter created in Yawp! and added to your lesson. View it".
- Or stay on the assignment page, but with a clear **Back to your lesson** button at the top.

Leaning toward going straight back. The teacher was building a lesson, not managing assignments.

#### 6c. Help teachers understand "the stack" (decide; Kevin isn't recommending a fix yet)
**The problem:** "Add to stack" assumes the teacher knows they're building a lesson out of pieces. Kevin knows it; a new teacher won't. The planner does two jobs: hand over single resources when that's all a teacher needs, and build whole lessons and units. The stack is how the second job works, and right now it's invisible.

**Ideas to choose from (not decided):**
- **Plainer words:** call the button **Add to lesson** (or "Add to today's lesson") and the stack page "Your lesson". Keep "stack" out of what teachers see.
- **A tour that shows up at the right moment:** the home screen can't show everything, so tips appear the first time each thing happens. For example, the first card with Add to lesson ("This puts it in your lesson plan. Your lesson is built from pieces like this"), the first visit to the stack page, and the first unit map.
- **One sentence up front:** at the start of the planner, a single line, like "Ask for one thing, or build a whole lesson piece by piece. Everything you add becomes your lesson."

**Kevin's words:** "Are teachers going to know, like, what add to stack means? Do they know that they're, like, building a lesson stack? … there's going to have to be some sort of, like, a tour … they almost need a tour halfway through … the goal is to either give them individual resources within a lesson that they need or to help them build the whole lesson and the whole unit. And the stack is really the secret to that … when I click create, it brings me back to the class starter page and then I have to go back to your lesson … I just created it in Yawp and … that should trigger the stack creation for me, right? … When they build any individual piece, it has to automatically begin to create that stack for them … They created the damn thing. They want it. They want it in their lesson. And the lesson is the stack, or the stack is the lesson."

### 7. Raw formatting marks (### and **) showing in the chat
**Area:** planner chat, under the exit ticket card (Day 1 lesson)

**What happened:** Under the exit ticket there's a "Teacher notes" piece for the Day 1 lecture. Under that is something like "Subject–object model". Its text shows raw formatting marks instead of formatting: `###`, `**`, `**` and so on. It looks like a computer program. It seems to be a preview of the teacher notes shown in the chat or lesson plan view, not on the stack page.

**Likely cause (to confirm):** Some piece previews in the chat show the piece's text as plain characters, without first turning its Markdown into formatting. So headings come out as `###` and bold as `**word**`. A card that shows only the first few lines (an excerpt) can also cut a mark in half.

**What to change:**
- Find every place a piece's text is shown in short or preview form (chat cards, the chat's stack panel, the library and unit previews, the stack page's collapsed steps, the notes view) and make each one either render the formatting or strip the marks cleanly. A teacher should never see `#`, `*`, `_`, `|`, backticks or a block's internal name.
- Add a test that runs real planner replies (headings, bold, lists, tables) through each preview and checks that no raw marks are left.
- Goes with note 2: no computer-looking text anywhere a teacher reads.

**Ask Kevin for:** a screenshot of this spot, if he has one, to confirm which card it is.

**Kevin's words:** "Underneath the exit ticket there's these teacher notes from day one lecture and underneath that it's like subject object model but there's always like weird formatted like a computer science program like # # # asterisk asterisk … it looks like the teacher notes … are like previewed on the lesson plan or chat like not in the stack and it looks like kind of weird and computer so that needs to be addressed if there's moments like unformatted text like that that needs to go away."

### 8. A 75-minute lesson for a 60-minute class
**Area:** unit days, stack page timing, the planner's lesson writing

Three parts. 8a is a bug. 8b and 8c are about how we handle a lesson that runs long.

#### 8a. Bug: a day built from the unit map doesn't know the class is 60 minutes
**What happened:** Kevin gave a 60-minute class, built a day from the unit map, and got a 75-minute plan. The stack page didn't seem to know the class was 60 minutes.

**Cause (checked in the code):** **Build this day** creates the day's own lesson without copying the unit's class or its period length (`createUnitDayConversation` in `lesson-unit.server.ts`, called from the planner route). So the stack page has no period to measure against. It can't say "15 min over" or offer its existing fixes (trim a step, move a step to tomorrow).

**What to change:**
- A day built from a unit takes the unit's class and period length from the conversation that planned the unit. Each new day starts with "60-minute period" set.
- Fix the days already made the same way, where the unit's planning chat has a length.
- The planner, building a day, plans to that length, ending with the closing or exit ticket.

#### 8b. When a lesson runs long, point at the one step to move (decide on wording)
Once the stack knows the period, it already says "N min over" and offers fixes. Kevin wants it clearer and calmer:
- A short line: "You've added some great pieces, but this runs 15 minutes over your 60. Move one to the end as an extension?"
- Mark the one step the planner suggests moving, e.g. a soft red edge on that step in the run of show, with **Move to extensions**. One suggestion, not a wall of warnings.
- The goal: 60 of 60 minutes planned, airtight from Class Starter to exit ticket.
- Don't get noisy: one line and one marked step, gone once it fits.

#### 8c. Lesson extensions: what to do with extra time (new idea; keep it simple)
**The idea:** A lesson can have a short **"If you have extra time"** section after the closing. It's not part of the timed plan and doesn't count toward the minutes.
- **What goes there:** a step the teacher moves there (8b), or one the planner suggests.
- **The rule for what makes a good extension:** something students can start and stop at any point without breaking the lesson. Writing first (a longer write, a revision, more Daily Pages time), then reading on (start the next excerpt), then a discussion question.
  - Example: Kevin deleted a reading excerpt to fit the time. That's the ideal extension: "If there are a few minutes left, start reading the next excerpt."
- **How many:** one or two at most, never a list.
- **Where it shows:** the stack page, the run of show with teacher notes (after the last step), and the printed lesson plan ("If you have extra time").
- **What the planner does:** when a lesson is full, it suggests one extension instead of squeezing in another step.

**Also check:** whether the 75 minutes came from the planner writing too much, or from Kevin adding all the options it offered. Either way, the stack should catch it (8a and 8b).

**Kevin's words:** "Now it's 75 minutes long. Now I have a 60-minute lesson. I think there is some wisdom in over-planning, but we created them a lesson that they can't get through … I don't even see here that it's like aware that we have a 60 minute class … did you give me too many options and I just selected all of them? … maybe highlight that thing in red for the run of show … maybe you delete this thing or drag it to the bottom as, like, a lesson extension if you have extra time at the end … I don't want this thing to get too noisy. But we can't set them up to have too long of a lesson. We don't want to set them up either for running out of stuff to do … 60 minutes of 60 minutes planned, airtight from class starter to exit ticket … I deleted a part of the lesson that was, like, reading an excerpt. And that might be the perfect thing to have them start to read at the very end of class if you have a few minutes extra time … create like a bit of a theory for how to add some like lesson extensions for people without it getting super, super complicated."

### 9. Tell the teacher when the slides no longer match the lesson
**Area:** stack page (deck card, Print it for class, Teach it), deck builder

**What happened:** The planner built a slide deck. Kevin then changed the lesson: cut a step, changed timings. The deck still shows the old plan, including the step he removed. Nothing told him the slides were out of date.

**Cause (checked in the code):** Nothing compares the deck with the lesson after it's built. (The lesson plan summary and the student handouts already notice when the stack changes. The deck doesn't.)

**What to change:**
- When the deck is built, record what the lesson looked like: its steps, in order, with their minutes.
- When the stack changes after that (a step added, removed, moved, or its minutes changed), mark the deck as out of date. Show one calm line wherever the deck appears: "Your lesson changed since these slides were made. **Rebuild the slides**". Places it appears: the deck card, Print it for class, Teach it's Open slideshow, and the stack panel in the chat.
- Optional: say what changed in a few words, e.g. "'Read the excerpt' was removed".
- The line goes away after a rebuild, or if the teacher chooses **Keep these slides** (for a deck they've edited by hand, which a rebuild would replace; the existing "asks first if edited" rule still applies).
- Don't block anything: the old slides still present and print.

**Kevin's words:** "Because I changed some things with the timing of the lesson … it had built a presentation, like a slide deck, but it still assumes I'm doing something that I said I would do earlier. So when I edit that, I need to like highlight the fact that I need to build a new one now."

### 10. On the lesson page: "Where's the stack?", slow downloads, and the plan's extension section
**Area:** the stack page, Print it for class, the printed lesson plan

Three parts.

#### 10a. Teachers can't tell they're looking at "the stack" (goes with 6c)
**What happened:** On Day 1 ("What is memetic desire?"), Kevin saw the run of show and "60 minutes planned" at the top. He didn't know if he was "in the stack" or where his resources were. Print it for class felt like it might be the stack.

**What to change:** Call it the same thing everywhere, in words teachers already use.
- The page is **the lesson**. Its heading area says so ("Day 1: What is memetic desire?"), with a small "Your lesson" label.
- What's now called "Add to stack" in the chat becomes **Add to lesson**, so the button and the page share one name.
- The chat's link to this page says **Open your lesson**.
- Inside the page, make the parts easy to spot:
  - **Run of show**: the steps, in order, with their times.
  - **Print it for class**: the files.
  - **Teach it**: slides and notes.
- One short line under the heading can join them up: "Everything you add from the planner lands here, in order."
- Settle the wording with note 6c before building.

#### 10b. Downloads look broken because nothing happens while the file is made (clear fix)
**What happened:** In Print it for class, Kevin clicked **Word** and nothing seemed to happen. Then **PDF**, and nothing. The Word file did download, just after a long delay. The files are made on the spot, and the button gives no sign it's working.

**What to change:**
- Each download button shows that it's working the moment it's clicked: a spinner and "Preparing…". It goes back to normal when the file arrives, or shows "Didn't download. Try again" if it fails.
- Ignore repeat clicks while one is preparing, so impatient clicks don't start several downloads.
- Where it's slow, make it faster. For example, the lesson plan's summary call could be warmed when the lesson is set.
- Apply this to every file button: lesson plan Word, Google Docs and PDF; slides PDF; handouts Word, Google Docs and PDF; the one packet.

#### 10c. The printed lesson plan works well, so put extensions in it (goes with 8c)
**What's working:** Kevin opened the lesson plan PDF: "It looks great." It reads the way a lesson plan is typed up.

**What to add:** After **Closing** (the exit ticket), add a short, matching section: **"If you have more time"**, with the lesson's one or two extensions (8c). Same formatting as the rest of the plan, in Word, PDF and the kit plan. If there are no extensions, leave the section out.

**Kevin's words:** "We have all this language for like add to stack, but then when I'm actually in like day one … I see the run of show and the 60 minutes … I don't know where the stack is. Am I in the stack? Is that what the stack is? Where are all my resources? … When I click on Word, nothing happens. When I click on PDF, nothing happens … Oh, no. It does work. It was just super delayed … All right, it looks great. And the lesson plan actually looks like the way that the lesson plan is typed up … it would be really easy to add something at the end, like an extension, like under closing, exit ticket, beautifully formatted, and then under that … here's what you have as an extension plan if you need more time."

### 11. Bug: Student handouts › PDF downloads something that isn't the PDF
**Area:** stack page, Print it for class › Student handouts › PDF

**What happened:** Kevin clicked the student handouts **PDF**. It downloaded a file, but not a working PDF.

**Likely causes (to confirm by reproducing on the preview with Kevin's Day 1 lesson):**
- The button is a plain download link. When the server answers with something other than a PDF (an error page, a "not found", or a redirect to the handouts page), the browser saves that page as the "PDF".
- The handouts loader redirects to the handouts page in some cases (`load-step-handouts.server.ts`). Through a download link, that redirect comes back as a page instead of a file.
- A handout step with nothing written for students yet, or a step whose student version is still being written, could also leave nothing to print.

**What to change:**
- Reproduce it on Kevin's lesson and fix the real cause.
- Have every Print it for class button check the response before saving: only a real file is saved. Anything else shows a plain message on the page, e.g. "These handouts aren't ready yet. Open the handouts to finish them", or "Didn't download. Try again". This goes with 10b's "Preparing…" state.
- If no step is marked for students, disable the handout buttons with a short note: "Pick the steps that go in the handout first."
- Add a browser test that downloads the student handout PDF from a built day and checks it's a real PDF with the steps in it. Do the same for Word and the one packet.

**Kevin's words:** "When I clicked handout, student handout PDF, I got like an error, like it didn't work. It downloaded something, but it wasn't the actual PDF. We need to make sure that student handout thing works."

### 12. Getting from "lots of pieces" to "ready to teach"
**Area:** stack page, the Lesson set panel, Run of show with teacher notes

**What's working (keep it):**
- **This lesson is set** is "beautiful".
- It lists what isn't in Yawp! yet.
- It offers Open slideshow and Run of show with teacher notes.
- It shows 60 minutes planned and 28% writing.

Four parts.

#### 12a. "What do I still need to do?" before setting the lesson (decide on the form)
**The problem:** With lots of pieces made, Kevin couldn't tell what was left before the lesson was ready, or how he'd use it in class.

**Idea:** Above **This lesson is set**, a short "Before class" list that checks itself off. Only real gaps, never more than four or five lines:
- Fits the period (60 of 60 minutes)
- Slides built, and up to date (note 9)
- Writing pieces made in Yawp!, or marked as on paper
- Handouts ready to print
- Date picked

When everything's done: "Ready to teach." Then one line on how to use it in class: "In class: put the slideshow on the board and keep the run of show with your notes on your laptop."

#### 12b. "Built in 19 minutes": 19 minutes of what? (clear fix)
**What happened:** The Lesson set panel says "Built in 19 min". Kevin guessed it might mean 19 minutes of writing. It actually means how long it took him to plan the lesson, from first message to setting it.

**What to change:** Label it plainly, e.g. "**Planned in** 19 min", with a small hint: "From your first message to setting the lesson". Or drop it if Brian doesn't want it. Never let it read as class time.

#### 12c. Run of show with teacher notes takes a very long time to open
**What happened:** Kevin clicked **Run of show with teacher notes**. It loaded for a long time with nothing on screen. It did open in the end ("it just took a very long time … it more or less works"), but a teacher would think it was broken.

**Likely cause (to confirm):** The first time that page opens for a lesson, it waits for the planner to write teacher notes for every step before it shows anything. That one model call can take up to 25 seconds, and it's longer for a full lesson. The preview may give up first, or the page looks frozen.

**What to change:**
- Never make the teacher wait for the notes. Open the page right away, with each step's own text as its notes and a quiet "Writing your notes…" line.
- Write the notes in the background and swap them in as they arrive. If writing fails, the step's text stays and the page works.
- Better still, start writing the notes when the lesson is set, so they're ready by the time the teacher opens the page.
- Show a working state on the button the moment it's clicked (goes with 10b).
- Add a test where the notes take a long time, and check that the page still opens straight away.

#### 12d. Two things called "Run of show" (clear fix)
**What happened:** Kevin wondered whether the run of show on the left of the stack page *was* the run of show with teacher notes.

**What to change:** Give them different names:
- The list on the stack page is where the lesson gets planned, e.g. **Your lesson, step by step** (or keep "Run of show" there only).
- The teaching view is where it gets taught, e.g. **Teach with notes** ("For your laptop at the podium").

Settle the names with notes 6c and 10a so the whole app uses one set of words.

**Kevin's words:** "I have a bunch of this stuff made, but like I'm not sure what I still need to do. And then like, when am I ready to … present, like how do I use this? … I like the idea of like, this lesson is set … that's beautiful … it tells me what's not in Yelp yet. It has the open slideshow option, run of show with teacher notes … It says built in 19 minutes … I think that's probably 19 minutes of writing. I'm not really sure. 19 minutes of what? … When I click run of show with teacher notes, it kind of loads for a while and then doesn't actually appear. Is that because the run of show that I see to the left is the run of show with teacher notes? … We gotta address that somehow. But this is really shaping up."
