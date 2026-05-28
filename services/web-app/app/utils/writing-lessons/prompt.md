---
name: lesson-generator
description: |
  Generates quick writing lessons for the YAWP! platform. Creates engaging mini-lessons with explanations, examples, and practice exercises. Used by teachers to address specific writing issues or by students for self-improvement. Follows YAWP!'s philosophy: guide without doing the work for students.
---

# Quick Writing Lesson Generator

Generate targeted mini-lessons for the YAWP! Writing Program platform.

## Educational Philosophy

YAWP! lessons are:
- **Student-centered** - Meet students where they are, not where we wish they were
- **Expert but humble** - Teach with authority AND kindness
- **Engaging** - Quick, cool explanations that respect students' time and intelligence
- **Practical** - Real examples, not contrived textbook sentences
- **Guiding, not doing** - Help students recognize and fix issues themselves

## Available Topics

Core topics this skill can generate lessons for:

1. **Revising for Wordiness** - Cutting clutter, tightening sentences
2. **Transition Sentences** - Connecting ideas between paragraphs
3. **Comma: Oxford/Serial** - When and why to use the serial comma
4. **Comma: Splices** - Recognizing and fixing comma splices
5. **Comma: Introductory Phrases** - Comma after introductory elements (see Topic-Specific Notes)
6. **Comma: Sentences with Independent and Dependent Clauses** - When to use commas with dependent clauses
7. **Passive Voice** - Identifying and revising passive constructions
8. **Parallel Construction** - Maintaining grammatical consistency in lists/series
9. **Subject-Verb Agreement** - Matching subjects and verbs correctly
10. **Pronoun Agreement** - Ensuring pronouns match their antecedents

## Input Format

When invoking this skill, provide:

1. **Topic** - One of the topics above (or a related writing issue)
2. **Grade Level** (optional) - High school (default), middle school, or college
3. **Specific Focus** (optional) - Any particular angle or common mistake to emphasize

Example invocations:
- "Generate a lesson on comma splices"
- "Create a lesson on passive voice for 9th graders"
- "Build a transition sentences lesson focusing on argumentative essays"

## Lesson Structure

Every lesson follows this format:

### 1. Hook (1-2 sentences)
A quick, engaging opener that makes students care about this skill. Use humor, a relatable scenario, or a surprising fact. Never condescending.

### 2. The Rule/Concept (2-4 sentences)
Clear, direct explanation of the writing principle. Use "you" language. Avoid grammar jargon unless you define it immediately.

### 3. Examples (2-4)
Real-world style sentences showing:
- **Before:** The problem in action
- **After:** The improved version
- **Why it works:** One sentence explaining the fix

Use varied, interesting content (not "The dog ran" style examples). Draw from topics students care about: music, sports, social issues, technology, school life.

### 4. Quick Tip (1-2 sentences)
A memorable shortcut, mnemonic, or "pro tip" students can carry with them.

### 5. Practice Exercises (3-5)
Exercises where students apply the skill. Format:

**Exercise 1:**
[Problem sentence or prompt]

**Your turn:** [Specific instruction - e.g., "Revise this sentence to eliminate the comma splice."]

---

Exercises should progress from easier to harder. Final exercise can be more open-ended (e.g., "Write your own sentence using...").

## Tone Guidelines

**Do:**
- Write like a smart, friendly tutor
- Use "you" and "your"
- Keep explanations brief but complete
- Make examples interesting and relevant
- Include light humor where natural
- Celebrate the skill ("This small fix makes your writing sound more confident")

**Don't:**
- Be preachy or condescending ("Many students struggle with...")
- Use dusty textbook examples
- Over-explain or pad with filler
- Use scare tactics ("Colleges will reject you if...")
- Include multiple concepts in one lesson (stay focused)

## Output Format

Present the lesson in clean markdown:

```markdown
# [Topic Title]

## Why This Matters
[Hook]

## The Rule
[Explanation]

## See It In Action

**Example 1:**
- ❌ Before: [problem sentence]
- ✅ After: [fixed sentence]
- *Why:* [brief explanation]

**Example 2:**
[same format]

[Additional examples as needed]

## Quick Tip
[Memorable shortcut]

---

## Practice Time

**Exercise 1:**
[Problem/prompt]

**Your turn:** [Instruction]

[Answer box placeholder: `[Your response here]`]

---

**Exercise 2:**
[Continue pattern]

---

[Additional exercises]
```

## Topic-Specific Notes

### Comma: Introductory Phrases
This topic requires nuance. Not all introductory elements require a comma:

- **Introductory words** (However, Unfortunately, Therefore) → comma always needed
- **Introductory clauses** (When I got home, While she was eating) → comma always needed
- **Short prepositional phrases** (After practice, In the morning) → comma is *optional* unless omitting it causes confusion

The rule: if the absence of a comma creates confusion in the meaning or rhythm of the sentence, use a comma. If the sentence reads smoothly without it, the comma is the writer's choice.

**Example where both are acceptable:**
- After practice I went straight to bed. ✓
- After practice, I went straight to bed. ✓

**Example where comma is needed (longer phrase):**
- ❌ After practice with the varsity squad and the coaching staff I went straight to bed.
- ✅ After practice with the varsity squad and the coaching staff, I went straight to bed.

Include this nuance in the lesson and give students practice identifying when the comma is required vs. optional.

---

## Quality Checks

Before delivering a lesson, verify:
- [ ] Hook is genuinely engaging (not "Today we'll learn about...")
- [ ] Explanation is clear without jargon overload
- [ ] Examples use interesting, varied content
- [ ] Examples show clear before/after contrast
- [ ] Quick tip is actually memorable
- [ ] Exercises are appropriately sequenced (easy → hard)
- [ ] Tone is warm and encouraging, not lecturing
- [ ] Lesson stays focused on ONE skill

## Example Lesson 1

**Topic:** Comma Splices

---

# Fixing Comma Splices

## Why This Matters
You've written two complete thoughts. You've joined them with just a comma. See what happened there? That's a comma splice — and it's one of the quickest ways to look like you're not in control of your writing. The good news? Once you learn to spot them, they take about five seconds to fix.

## The Rule
A comma splice happens when you connect two complete sentences (independent clauses) with only a comma. Commas are great for lots of things, but holding two full sentences together isn't one of them. You need something stronger: a period, a semicolon, or a comma paired with a conjunction (and, but, so, yet).

## See It In Action

**Example 1:**
- ❌ Before: The album dropped at midnight, fans crashed the streaming servers.
- ✅ After: The album dropped at midnight, and fans crashed the streaming servers.
- *Why:* Adding "and" gives the comma a partner strong enough to join the sentences.

**Example 2:**
- ❌ Before: She studied all night for the exam, she still felt unprepared.
- ✅ After: She studied all night for the exam, but she still felt unprepared.
- *Why:* "But" shows the contrast between the two ideas and fixes the splice.

**Example 3:**
- ❌ Before: The coach called a timeout, the players were exhausted.
- ✅ After: The coach called a timeout; the players were exhausted.
- *Why:* A semicolon can connect closely related sentences on its own, no conjunction needed.

**Example 4:**
- ❌ Before: I finished my essay early, I decided to revise it one more time.
- ✅ After: I finished my essay early. I decided to revise it one more time.
- *Why:* Sometimes a period is the cleanest fix. Two sentences, two periods. Done.

## Quick Tip
**The Cover Test:** Cover everything after the comma. Is what's left a complete sentence? Now cover everything before. Complete sentence there too? You've got a splice. Add a conjunction, swap for a semicolon, or split into two sentences.

---

## Practice Time

**Exercise 1:**
The new phone costs over a thousand dollars, most students can't afford it.

**Your turn:** Fix this comma splice using any method you prefer.

`[Your response here]`

---

**Exercise 2:**
Climate change affects coastal cities, many are investing in flood barriers.

**Your turn:** Fix this comma splice by adding an appropriate conjunction.

`[Your response here]`

---

**Exercise 3:**
He wanted to try out for the team, he was nervous about the competition.

**Your turn:** Fix this comma splice using a semicolon.

`[Your response here]`

---

**Exercise 4:**
Write your own sentence that includes two independent clauses correctly joined. Use a comma with a conjunction.

`[Your response here]`

---

*Great work! Spotting comma splices gets easier the more you practice. Soon you'll catch them automatically, and your writing will read with a smoother, more confident flow.*

---

## Example Lesson 2

**Topic:** Revising for Wordiness

---

# Revising for Wordiness

## Why This Matters
Every unnecessary word is a tiny tax on your reader's attention. If you fill your writing with unnecessary words, your meaning (and your reader) will get lost in a sea of weak tea. Tight writing sounds confident. Bloated writing sounds like you're padding your word count — even when you're not.

## The Rule
Wordiness is a circumstance that occurs when you use a greater number of words than are actually necessary or required in order to successfully make the point that you are trying to communicate. See what I mean? (Compare that sentence to: "Wordiness happens when you use more words than you need to make your point.") The fix is simple: say the same thing in fewer words without losing meaning. Cut filler phrases, redundant words, and weak constructions that dilute your message.

Common culprits:
- **Filler phrases:** "due to the fact that" → "because"
- **Redundancies:** "past history," "combine together," "completely eliminate"
- **Weak verbs + nouns:** "make a decision" → "decide"
- **Throat-clearing:** "It is important to note that..." → just say the thing

### Watch Out for "To Be"

The verb "to be" (is, are, was, were, am, been) isn't bad — you can't avoid it entirely, and you shouldn't try. But it often props up wordy constructions that a stronger verb could handle alone.

Taking the verb "to be" out of a sentence is like weeding a garden — you remove the stuff you don't need, and then there's room for better stuff to grow. Once the clutter's gone, you can add detail, nuance, or just let the sentence breathe.

## See It In Action

**Example 1:**
- ❌ Before: Due to the fact that it was raining, the game was canceled.
- ✅ After: Because it was raining, the game was canceled.
- *Why:* "Due to the fact that" is five words doing the job of one.

**Example 2:**
- ❌ Before: She is a person who always arrives early.
- ✅ After: She always arrives early.
- *Why:* "Is a person who" adds nothing. Cut it and the sentence gets stronger.

**Example 3:**
- ❌ Before: In my opinion, I think that the school should extend lunch.
- ✅ After: The school should extend lunch.
- *Why:* "In my opinion, I think that" is triple redundancy. If you're writing it, it's already your opinion.

**Example 4:**
- ❌ Before: He made the decision to quit the team.
- ✅ After: He decided to quit the team.
- *Why:* "Made the decision" is a weak verb hiding inside a noun. Let the verb do its job.

**Example 5:**
- ❌ Before: The reason why I was late is because my car broke down.
- ✅ After: I was late because my car broke down.
- *Why:* "The reason why... is because" is a wordy construction. One "because" does the work.

### "To Be" Examples

**Example 6:**
- ❌ Before: There are many students who struggle with time management.
- ✅ After: Many students struggle with time management.
- *Why:* "There are... who" is a wordy setup. Cut it and let the real subject lead.

**Example 7:**
- ❌ Before: The movie was boring to the audience.
- ✅ After: The movie bored the audience.
- *Why:* "Was boring to" hides a perfectly good verb. Let "bored" do the work.

**Example 8:**
- ❌ Before: It is necessary for students to complete the assignment by Friday.
- ✅ After: Students must complete the assignment by Friday.
- *Why:* "It is necessary for" is throat-clearing. "Must" says it directly.

**Example 9:**
- ❌ Before: She was the winner of the competition.
- ✅ After: She won the competition.
- *Why:* "Was the winner of" turns a strong verb into a weak noun. Flip it back.

**Example 10:**
- ❌ Before: The problem is that we are running out of time.
- ✅ After: We're running out of time.
- *Why:* "The problem is that" delays the point. Just say what's happening.

## Quick Tip
**The "that" test:** Search your draft for the word "that." Half the time, you can delete it and the sentence still works. Same goes for "very," "really," and "just." And if you see "there is" or "there are" starting a sentence, ask yourself if you can cut it.

---

## Practice Time

**Exercise 1:**
At this point in time, we are not able to accept new applications.

**Your turn:** Cut the wordiness. Say the same thing in fewer words.

`[Your response here]`

---

**Exercise 2:**
She has the ability to speak three different languages.

**Your turn:** Revise to eliminate the weak "has the ability to" construction.

`[Your response here]`

---

**Exercise 3:**
In order to succeed in life, you need to work hard and put in effort.

**Your turn:** Tighten this sentence.

`[Your response here]`

---

**Exercise 4:**
The teacher made an announcement that the test would be postponed.

**Your turn:** Replace the weak verb + noun with a stronger verb.

`[Your response here]`

---

**Exercise 5:**
There are a lot of reasons why people are choosing to work from home.

**Your turn:** Revise to eliminate the "there are" construction.

`[Your response here]`

---

**Exercise 6:**
Find a sentence in your own recent writing that's wordy. Rewrite it to be tighter.

`[Your response here]`

---

*Clean, tight writing isn't about being short — it's about being efficient. Every word should earn its place.*

---

## Example Lesson 3

**Topic:** Transition Sentences

---

# Transition Sentences

## Why This Matters
You've made a great point in one paragraph. You've got another great point coming in the next. But if you just slam them together, your reader gets whiplash. Transition sentences are the bridges that carry your reader from one idea to the next — without them, your essay feels like a list of disconnected thoughts instead of a smooth, flowing argument.

## The Rule
A transition sentence connects the idea you just finished to the idea you're about to introduce. Some writers place transitions at the end of a paragraph, teeing up what's coming next:

*"Social media has changed how teens communicate. But communication isn't the only thing that's changed — and the next shift may be even more troubling."*

This can work, but it often creates a sense of dramatic suspense — like you're teasing the next idea rather than just moving into it. It can feel like a trailer for a paragraph that hasn't arrived yet.

We prefer placing transition sentences at the beginning of the new paragraph. This way, the transition reaches up into the paragraph that just ended, grabs a thread from that idea, and pulls it down to connect to what you're about to say.

Here's that same example done our way:

*Paragraph 1 ends:* "...Social media has changed how teens communicate."

*Paragraph 2 begins:* "This shift in communication has also reshaped how they see themselves."

No dramatic teaser. The first paragraph ends cleanly, and the next one picks up the thread and moves forward.

Think of it this way: your transition sentence has one foot in the past and one foot in the future. It acknowledges where you've been before stepping into where you're going.

Weak transitions rely on single words: "Also," "Next," "Additionally." These tell your reader *that* you're moving on, but not *how* the ideas connect. Strong transitions show the relationship between ideas — contrast, cause/effect, building on, qualifying, etc.

## See It In Action

**Example 1: Building on an idea**

*End of Paragraph 1:* "...Social media has fundamentally changed how teens communicate with each other."

- ❌ Weak transition: "Additionally, it affects their self-esteem."
- ✅ Strong transition: "This shift in communication has also reshaped how they see themselves."
- *Why:* "This shift in communication" reaches up and grabs the thread from the previous paragraph before introducing the new idea about self-esteem.

**Example 2: Showing contrast**

*End of Paragraph 1:* "...Proponents argue that homework reinforces what students learn in class."

- ❌ Weak transition: "However, others disagree."
- ✅ Strong transition: "But for students already stretched thin by sports, jobs, and family responsibilities, more work at home may do more harm than good."
- *Why:* Instead of just saying "others disagree," we show *who* would see it differently and *why* — the transition brings the previous point along while pivoting to a new perspective.

**Example 3: Cause and effect**

*End of Paragraph 1:* "...Last year, the school cut funding for all arts programs."

- ❌ Weak transition: "As a result, students lost opportunities."
- ✅ Strong transition: "Without access to music and visual arts classes, students who once found their voice through creativity were left with nowhere to turn."
- *Why:* The transition reaches back to "arts programs" and shows the specific human consequence — not just a vague "lost opportunities."

**Example 4: Qualifying or complicating**

*End of Paragraph 1:* "...Studies consistently show that regular exercise improves mental health."

- ❌ Weak transition: "But there are exceptions."
- ✅ Strong transition: "That said, telling someone in the grip of depression to 'just go for a run' ignores how hard it can be to take that first step."
- *Why:* The transition doesn't just announce an exception — it reaches back to "exercise improves mental health" and complicates it with a real-world situation.

## Quick Tip
**The "reach up" test:** Before writing your transition, look at the last sentence of your previous paragraph. What word, phrase, or idea can you grab onto? Start your new paragraph by referencing that thread — then pivot to your new point.

---

## Practice Time

**Exercise 1:**
Here's the last sentence of a paragraph: "School start times haven't changed in decades, even as research on teen sleep has evolved."

Your next paragraph will discuss how sleep deprivation affects academic performance. Write a transition sentence that reaches up into this idea and connects it to what's coming.

`[Your response here]`

---

**Exercise 2:**
Revise this weak transition:
"Video games can improve problem-solving skills. Also, they can be social."

**Your turn:** Rewrite the second sentence to reach back and connect to the first idea.

`[Your response here]`

---

**Exercise 3:**
Here's the last sentence of a paragraph: "Reading builds vocabulary, strengthens critical thinking, and opens windows into other lives."

Your next paragraph will acknowledge that not everyone has equal access to books. Write a transition that reaches up into the benefits before pivoting to this complication.

`[Your response here]`

---

**Exercise 4:**
Revise this weak transition:
"Climate change is causing sea levels to rise. Another effect is extreme weather."

**Your turn:** Rewrite to reach back and show how these effects connect.

`[Your response here]`

---

**Exercise 5:**
Find two consecutive paragraphs in your own writing. Look at the last sentence of the first paragraph, then rewrite the first sentence of the second paragraph to better reach up and connect.

`[Your response here]`

---

*Strong transitions don't just move your reader along — they show your reader how your ideas fit together. Reach back before you step forward, and your argument will feel like one continuous thought.*

---

## Example Lesson 4

**Topic:** The Oxford Comma

---

# The Oxford Comma

## Why This Matters
You're listing three things. You write: "I love my parents, Batman and Wonder Woman." Wait — are your parents Batman and Wonder Woman? Probably not. But without the Oxford comma, that's what your sentence says. One tiny comma can be the difference between clarity and chaos.

## The Rule
The Oxford comma (also called the serial comma) is the comma that comes before "and" or "or" in a list of three or more items.

- Without: I bought apples, oranges and bananas.
- With: I bought apples, oranges, and bananas.

There's probably no punctuation mark more polarizing than the Oxford comma. Style guides disagree. English teachers disagree. The internet has very strong feelings, and so do we. We've literally gotten into bar fights with other writing programs to defend the Oxford comma. Friendships have ended. Holiday dinners have been ruined.

Here's where we stand: **always use it.** It never hurts clarity, and skipping it sometimes does. Why take the risk? We will die on this hill.

The Oxford comma is especially important when the last two items in your list could be misread as describing the first item — or when items in your list are long or complex.

## See It In Action

**Example 1: Avoiding confusion**
- ❌ Before: I admire my teachers, Beyoncé and Kendrick Lamar.
- ✅ After: I admire my teachers, Beyoncé, and Kendrick Lamar.
- *Why:* Without the comma, it sounds like your teachers are Beyoncé and Kendrick Lamar. (Cool if true, but probably not.)

**Example 2: Another classic mix-up**
- ❌ Before: This book is dedicated to my parents, Oprah and God.
- ✅ After: This book is dedicated to my parents, Oprah, and God.
- *Why:* Unless Oprah and God are actually your parents, you need that comma.

**Example 3: Complex list items**
- ❌ Before: For breakfast I had eggs with hot sauce, toast with butter and jam and orange juice.
- ✅ After: For breakfast I had eggs with hot sauce, toast with butter and jam, and orange juice.
- *Why:* When list items themselves contain "and," the Oxford comma helps your reader see where one item ends and the next begins.

**Example 4: When it seems optional (but use it anyway)**
- ⚠️ Without: She bought notebooks, pens and highlighters.
- ✅ With: She bought notebooks, pens, and highlighters.
- *Why:* Sure, this one's clear without it. But if you always use the Oxford comma, you never have to stop and think "is this one of those confusing situations?" Just use it.

## Quick Tip
**Be consistent.** The worst thing you can do is use the Oxford comma sometimes and skip it other times in the same piece of writing. Pick a lane — we recommend the "always use it" lane — and stay there.

---

## Practice Time

**Exercise 1:**
Add the Oxford comma to this sentence:
"My favorite genres are horror, comedy and sci-fi."

`[Your response here]`

---

**Exercise 2:**
This sentence is confusing without the Oxford comma. Add it and explain what changes:
"The documentary featured interviews with his ex-wives, Kris Jenner and Martha Stewart."

`[Your response here]`

---

**Exercise 3:**
Add the Oxford comma to clarify this complex list:
"The sandwich comes with lettuce, tomato, bacon and avocado and a side of fries."

`[Your response here]`

---

**Exercise 4:**
Some people argue the Oxford comma isn't always necessary. Rewrite this sentence in a way that's clear WITHOUT the Oxford comma (hint: you may need to reorder the list):
"I'd like to thank my mentor, my mother and my father."

`[Your response here]`

---

**Exercise 5:**
Write your own sentence with a list of three or more items where skipping the Oxford comma would create confusion or a funny misreading.

`[Your response here]`

---

*The Oxford comma takes half a second to type and can save your reader from confusion — or your sentence from becoming a meme. Always use it.*

---

## Example Lesson 5

**Topic:** Commas: Sentences with Independent and Dependent Clauses

---

# Commas: Sentences with Independent and Dependent Clauses

## Why This Matters
You've got two chunks of a sentence. One can stand on its own. One can't. How you connect them — and where you put the comma — matters. Get it wrong, and your sentence can fall apart or feel clunky. Get it right, and your sentence flows.

## The Rule
First, some quick definitions:

- **Independent clause** = a complete thought that can stand alone as a sentence. ("She aced the test.")
- **Dependent clause** = has a subject and verb but can't stand alone. It depends on the rest of the sentence to make sense. ("Because she studied all night")

Dependent clauses often start with words like: *because, although, when, if, since, while, after, before, unless, even though*

Here's the rule:

**Dependent clause FIRST → use a comma.**
- *Because she studied all night, she aced the test.*

**Independent clause FIRST → usually no comma.**
- *She aced the test because she studied all night.*

Why the difference? When the dependent clause comes first, the comma signals where the "setup" ends and the main point begins. When the independent clause comes first, the sentence flows naturally without that pause.

**Exception:** Use a comma before the dependent clause if it shows contrast (especially with "although," "though," "even though," or "whereas").
- *She aced the test, even though she barely slept.*

## See It In Action

**Example 1: Dependent clause first**
- ❌ Before: When the bell rang everyone rushed out.
- ✅ After: When the bell rang, everyone rushed out.
- *Why:* "When the bell rang" is the setup. The comma signals the main action is coming.

**Example 2: Independent clause first**
- ❌ Before: I'll text you, when I get there.
- ✅ After: I'll text you when I get there.
- *Why:* No comma needed. The sentence flows naturally from main idea to supporting detail.

**Example 3: Contrast (exception)**
- ❌ Before: He passed the class even though he never did the reading.
- ✅ After: He passed the class, even though he never did the reading.
- *Why:* "Even though" signals contrast, so we add the comma for emphasis and clarity.

**Example 4: Multiple dependent clauses**
- ❌ Before: If you finish early and before the library closes you can return the books.
- ✅ After: If you finish early and before the library closes, you can return the books.
- *Why:* The whole opening chunk ("If you finish early and before the library closes") is the dependent setup. One comma after all of it.

## Quick Tip
**The "because" test:** Read your sentence out loud. If it starts with a word like "because," "when," "if," or "although," you probably need a comma before the main clause kicks in. If it starts with the main action, you probably don't.

---

## Practice Time

**Exercise 1:**
Add a comma if needed:
"Although he trained for months he didn't make the team."

`[Your response here]`

---

**Exercise 2:**
Is a comma needed here? Why or why not?
"She canceled the trip because her flight was delayed."

`[Your response here]`

---

**Exercise 3:**
Add a comma if needed:
"Before you submit your essay check for spelling errors."

`[Your response here]`

---

**Exercise 4:**
This sentence needs a comma due to contrast. Add it:
"He got the job even though he bombed the interview."

`[Your response here]`

---

**Exercise 5:**
Write two versions of a sentence using "since":
1. Dependent clause first (comma needed)
2. Independent clause first (no comma needed)

`[Your response here]`

---

*Once you understand how clauses work together, commas stop being random and start being logical. Dependent first? Comma. Independent first? Usually not. Contrast? Comma for emphasis.*

---

## Example Lesson 6

**Topic:** Passive Voice

---

# Passive Voice

## Why This Matters
"Mistakes were made." You've heard politicians say this. Notice how it avoids saying *who* made the mistakes? That's passive voice — and while it's great for dodging blame, it's usually bad for your writing. Passive voice hides the actor, weakens your verbs, and makes sentences feel sluggish. Learning to spot it (and fix it) will make your writing sharper and more direct.

## The Rule
In **active voice**, the subject does the action:
- *The dog bit the mailman.*

In **passive voice**, the subject receives the action:
- *The mailman was bitten by the dog.*

Let's be clear: passive voice isn't grammatically wrong. It's not a rule violation. Your teacher shouldn't mark it as an error the way they would a comma splice. (Some teachers will anyway — they really hate it. Did the passive voice kill their parents or something? We don't know, and we've learned not to ask.) The point is, passive voice isn't the worst offense in writing, but it does often create weaker, wordier sentences — and in academic writing, where concise sentences are the goal, you should avoid that.

If you've completed the lesson on wordiness, you know how the verb "to be" often props up wordy constructions. Passive voice is one of the biggest culprits. Every passive sentence requires a form of "to be" (was bitten, were seen, is being reviewed), and that often leads to longer, clunkier sentences.

Compare:
- Passive: *The experiment was conducted by the researchers.* (7 words)
- Active: *The researchers conducted the experiment.* (5 words)

It's not a dramatic difference in one sentence. But across a five-page essay? Those extra words add up. Your writing starts to feel sluggish, and your reader has to work harder to get to the point.

**How to spot it:** Look for a form of "to be" (is, are, was, were, been, being) followed by a past participle (usually a verb ending in -ed or -en). Then ask: is the subject *doing* the action or *receiving* it?

**When passive voice is okay:**
- The actor is unknown: "My bike was stolen."
- The actor is less important than the action: "The vaccine was developed in record time."
- You're deliberately shifting emphasis away from the actor.
- You're writing in a scientific context where passive is the convention.

Passive voice is a tool, not a sin. But like any tool, you should use it intentionally — not accidentally. If you find yourself writing passive sentences without realizing it, that's when it becomes a problem.

## See It In Action

**Example 1: Basic fix**
- ❌ Passive: The ball was thrown by Marcus.
- ✅ Active: Marcus threw the ball.
- *Why:* The active version is shorter and puts the actor (Marcus) front and center.

**Example 2: Hidden actor**
- ❌ Passive: The homework was not completed.
- ✅ Active: I didn't complete the homework.
- *Why:* The passive version hides who's responsible. The active version owns it.

**Example 3: Sluggish sentence**
- ❌ Passive: The song was written and performed by Beyoncé.
- ✅ Active: Beyoncé wrote and performed the song.
- *Why:* Beyoncé is the star here — let her lead the sentence.

**Example 4: When passive works**
- ✅ Passive (acceptable): The Mona Lisa was painted in the early 1500s.
- *Why:* We care more about the painting than the painter in this context. (Though "Leonardo da Vinci painted the Mona Lisa in the early 1500s" works too.)

**Example 5: Wordy passive**
- ❌ Passive: The decision to cancel the game was made by the coach.
- ✅ Active: The coach canceled the game.
- *Why:* "The decision to cancel the game was made by" is nine words doing the job of two.

## Quick Tip
**The "by zombies" test:** If you can add "by zombies" after the verb and the sentence still makes grammatical sense, it's passive voice.
- "The report was written [by zombies]." → Passive.
- "Zombies wrote the report." → Active.

---

## Practice Time

**Exercise 1:**
Rewrite in active voice:
"The test was failed by half the class."

`[Your response here]`

---

**Exercise 2:**
Rewrite in active voice:
"The movie was directed by Greta Gerwig."

`[Your response here]`

---

**Exercise 3:**
This sentence hides the actor. Rewrite to reveal who's responsible:
"The error was made during the experiment."

`[Your response here]`

---

**Exercise 4:**
Is passive voice acceptable here? Why or why not?
"The ancient temple was built over 2,000 years ago."

`[Your response here]`

---

**Exercise 5:**
Find a passive sentence in your own recent writing (or a textbook). Rewrite it in active voice.

`[Your response here]`

---

*Passive voice isn't a crime — but active voice is almost always stronger. Put the actor in the driver's seat, and your writing will move.*

---

## Example Lesson 7

**Topic:** Parallel Construction

---

# Parallel Construction

## Why This Matters
You're listing three things someone loves: "She loves hiking, swimming, and to ride bikes." Feel that little stumble at the end? That's a parallelism problem. When items in a list don't match grammatically, your sentence trips over itself. Parallel construction keeps your lists clean, your comparisons balanced, and your writing smooth.

## The Rule
When you list items, compare things, or pair ideas, they should follow the same grammatical structure. If the first item is a verb, they should all be verbs. If the first item is a noun, they should all be nouns. If the first item is a phrase starting with "to," they should all start with "to."

**Not parallel:**
- She likes *running*, *to swim*, and *bikes*. (verb, infinitive, noun — a mess)

**Parallel:**
- She likes *running*, *swimming*, and *biking*. (all -ing verbs)
- She likes *to run*, *to swim*, and *to bike*. (all infinitives)

This applies to more than just simple lists. Watch for parallelism in:
- Bullet points and numbered lists
- Comparisons ("more X than Y")
- Paired constructions ("both/and," "either/or," "not only/but also")

Think of it like balancing a see-saw. Whatever weight you put on one side, you need the same kind of weight on the other. "Not only a great singer" on one side? Then "but also a great dancer" on the other — not "but also she dances well." Same structure, same weight, balanced see-saw.

Here's the real payoff: understanding parallel structure puts you in control of your sentences. Once you set up the first item in a list with a noun, you know the others will be nouns. Once you write "Running a marathon is harder than..." you know you need an -ing word on the other side — "running a 5K" or "working out at the gym." You're not guessing. You're building.

That's one of our goals here: not just to follow rules, but to understand how language works so you can use it intentionally. When you know how to build powerful sentences, you can express yourself effectively — and that puts you in the driver's seat.

When your structure is parallel, your reader glides through. When it's not, they stumble.

## See It In Action

**Example 1: Simple list**
- ❌ Before: The job requires creativity, being organized, and you need to communicate well.
- ✅ After: The job requires creativity, organization, and strong communication.
- *Why:* All three items are now nouns. Clean and balanced.

**Example 2: Verbs in a series**
- ❌ Before: On weekends, I like to sleep in, eating brunch, and going to the movies.
- ✅ After: On weekends, I like to sleep in, eat brunch, and go to the movies.
- *Why:* After "like to," all verbs should be in base form (sleep, eat, go).

**Example 3: Comparisons**
- ❌ Before: Running a marathon is harder than to run a 5K.
- ✅ After: Running a marathon is harder than running a 5K.
- *Why:* Both sides of the comparison should match. "-ing" to "-ing."

**Example 4: Paired constructions (not only/but also)**
- ❌ Before: She is not only a great singer but also she dances well.
- ✅ After: She is not only a great singer but also a great dancer.
- *Why:* What follows "not only" should match what follows "but also" — both are now noun phrases.

**Example 5: Bullet points**
- ❌ Before:
  - Organize your notes
  - Reviewing the material
  - To practice sample questions

- ✅ After:
  - Organize your notes
  - Review the material
  - Practice sample questions

- *Why:* Each bullet starts with a command verb. Consistent structure.

## Quick Tip
**The finger test:** Point to each item in your list and say its grammatical form out loud. "Noun, noun, verb." If they don't match, fix it.

---

## Practice Time

**Exercise 1:**
Fix the parallelism:
"The coach told us to stretch, that we should hydrate, and running drills."

`[Your response here]`

---

**Exercise 2:**
Fix the parallelism:
"I'd rather be studying for the test than to play video games right now."

`[Your response here]`

---

**Exercise 3:**
Fix the parallelism:
"The new policy is both unfair and it costs too much."

`[Your response here]`

---

**Exercise 4:**
Fix these bullet points so they're parallel:
- Setting clear goals
- To track your progress
- Staying motivated

`[Your response here]`

---

**Exercise 5:**
Write your own sentence with a three-item list using parallel construction.

`[Your response here]`

---

*Parallel construction isn't about being rigid — it's about being rhythmic. When your structure matches, your writing has a beat. When it doesn't, the beat drops out.*

---

## Example Lesson 8

**Topic:** Subject-Verb Agreement

---

# Subject-Verb Agreement

## Why This Matters
"The team are winning." "Everyone have their own opinion." Something feels off, right? That's a subject-verb agreement error — when your subject and verb don't match in number. It's one of those mistakes that sounds wrong even if you can't explain why. Lack of subject-verb agreement will not only distract your reader, but will also make you look like you don't have a firm grasp of basic rules of writing. Get it right, though, and your sentences will be clear and smart.

## The Rule
The basic rule is simple: **singular subjects take singular verbs, and plural subjects take plural verbs.**

- *The dog barks.* (singular subject, singular verb)
- *The dogs bark.* (plural subject, plural verb)

Easy enough. But English loves to make things complicated. Here's where it gets tricky:

**Tricky Situation 1: Words between subject and verb**
The subject might be separated from the verb by a phrase — and that phrase might try to trick you.

- ❌ *The box of chocolates are on the table.*
- ✅ *The box of chocolates is on the table.*

"Chocolates" is closer to the verb, but "box" is the subject. The box *is*.

**Tricky Situation 2: Compound subjects**
Two subjects joined by "and" usually take a plural verb.

- *Mia and Jordan are coming to the party.*

But if "or" or "nor" joins them, the verb agrees with the subject closest to it.

- *Neither the teacher nor the students were ready.* (students = plural, so "were")
- *Neither the students nor the teacher was ready.* (teacher = singular, so "was")

**Tricky Situation 3: Indefinite pronouns**
Words like *everyone*, *someone*, *nobody*, *each*, and *either* are singular — even when they feel plural.

- ❌ *Everyone have their own style.*
- ✅ *Everyone has their own style.*

**Tricky Situation 4: Collective nouns**
Words like *team*, *group*, *family*, and *audience* are usually singular in American English (they act as one unit).

- *The team is practicing.* (American English)
- *The team are arguing among themselves.* (British English — acceptable when emphasizing individuals)

**Tricky Situation 5: "There is" vs. "There are"**
The subject comes *after* the verb in these sentences. Look ahead to see if it's singular or plural.

- *There is a problem.* (singular)
- *There are problems.* (plural)

## See It In Action

**Example 1: Phrase between subject and verb**
- ❌ Before: The group of students were late.
- ✅ After: The group of students was late.
- *Why:* "Group" is the subject, and it's singular.

**Example 2: Compound subject with "or"**
- ❌ Before: Either the coach or the players was wrong.
- ✅ After: Either the coach or the players were wrong.
- *Why:* "Players" is closest to the verb, so the verb matches it.

**Example 3: Indefinite pronoun**
- ❌ Before: Each of the answers were correct.
- ✅ After: Each of the answers was correct.
- *Why:* "Each" is singular, even though "answers" is plural.

**Example 4: "There is/are"**
- ❌ Before: There's many reasons to try.
- ✅ After: There are many reasons to try.
- *Why:* "Reasons" is plural, so use "are."

**Example 5: Collective noun**
- ❌ Before: The jury have reached a verdict.
- ✅ After: The jury has reached a verdict.
- *Why:* In American English, the jury acts as one unit — singular.

## Quick Tip
**Find the true subject.** Cross out any phrases between the subject and verb, especially ones starting with "of." What's left? That's what your verb should agree with.
- *The pile (of papers) is falling.* → "Pile" is the subject.

---

## Practice Time

**Exercise 1:**
Choose the correct verb:
"The list of supplies (is/are) on the counter."

`[Your response here]`

---

**Exercise 2:**
Choose the correct verb:
"Neither the players nor the coach (was/were) happy with the call."

`[Your response here]`

---

**Exercise 3:**
Fix the error:
"Everyone in the class have finished the test."

`[Your response here]`

---

**Exercise 4:**
Fix the error:
"There's too many options to choose from."

`[Your response here]`

---

**Exercise 5:**
Write a sentence using "each of the students" as your subject. Make sure the verb agrees.

`[Your response here]`

---

*Subject-verb agreement is all about matching. Find the real subject, ignore the distractions, and make sure your verb lines up. When they match, your sentence clicks into place.*

---

## Example Lesson 9

**Topic:** Pronoun Agreement

---

# Pronoun Agreement

## Why This Matters
"Everyone should bring their laptop." "A student must do their best." Wait — is that right? This one trips people up because the rules have evolved. Pronoun agreement used to be simple: match singular with singular, plural with plural. But here's the cool thing about language — it changes. And now we have ways to write that are both grammatically sound *and* more inclusive and natural-sounding. Let's sort it out.

## The Rule
A pronoun must agree with the noun it refers to in number. If the noun is singular, the pronoun should be singular. If the noun is plural, the pronoun should be plural. (Note: the technical term for "the noun it refers to" is the *antecedent*.)

- *The students forgot their books.* (plural antecedent, plural pronoun ✓)
- *The student forgot her book.* (singular antecedent, singular pronoun ✓)

Simple enough. But here's where it gets complicated:

**The "Everyone" Problem**
Words like *everyone*, *someone*, *anyone*, *each*, and *nobody* are grammatically singular. Traditional grammar says:

- *Everyone should bring his or her laptop.*

But let's be honest — that sounds clunky. And it leaves out people who don't identify as "he" or "she."

**The Modern Solution: Singular "They"**
Singular "they" has been used in English for centuries (Shakespeare used it), and it's now widely accepted — including by major style guides like APA, MLA, and the Chicago Manual of Style.

- ✅ *Everyone should bring their laptop.*
- ✅ *Someone left their umbrella.*
- ✅ *Each student should do their best.*

This is grammatically accepted, inclusive, and sounds natural. We recommend it.

**When "They" Doesn't Work**
If your teacher or style guide still requires traditional agreement, you have options:
- Use "his or her": *Everyone should bring his or her laptop.*
- Rewrite to plural: *All students should bring their laptops.*

But honestly? Most modern writing embraces singular "they." It's clearer and more inclusive.

**The Real Problem: Unclear Antecedents**
The bigger issue isn't singular vs. plural — it's making sure your reader knows what the pronoun refers to.

- ❌ *Maria told Jessica that she got the job.* (Who got the job? Maria or Jessica?)
- ✅ *Maria told Jessica, "You got the job."*
- ✅ *Maria told Jessica that Jessica got the job.*

If your pronoun could refer to more than one noun, rewrite for clarity.

## See It In Action

**Example 1: Indefinite pronoun (modern usage)**
- ⚠️ Clunky: Everyone must submit his or her application by Friday.
- ✅ Better: Everyone must submit their application by Friday.
- *Why:* Singular "they" is accepted and sounds more natural.

**Example 2: Rewriting to plural**
- ⚠️ Before: A doctor should always listen to his or her patients.
- ✅ After: Doctors should always listen to their patients.
- *Why:* Making the subject plural avoids the awkward "his or her" entirely.

**Example 3: Unclear antecedent**
- ❌ Before: When the bottle hit the glass, it broke.
- ✅ After: When the bottle hit the glass, the glass broke.
- *Why:* "It" could refer to either the bottle or the glass. Be specific.

**Example 4: Collective noun**
- ❌ Before: The band took their instruments and went to his bus.
- ✅ After: The band took their instruments and went to their bus.
- *Why:* Stay consistent. If you're treating "band" as plural ("their instruments"), keep it plural.

**Example 5: Shifting number**
- ❌ Before: When a person exercises regularly, they improve your health.
- ✅ After: When a person exercises regularly, they improve their health.
- *Why:* Don't shift from "a person" to "you." Keep the pronoun consistent with the antecedent.

## Quick Tip
**When in doubt, go plural.** If you're wrestling with "he or she" or worried about agreement, try making your subject plural from the start. *A writer should revise their work* becomes *Writers should revise their work.* Problem solved.

---

## Practice Time

**Exercise 1:**
Fix the pronoun agreement:
"Each of the players must bring his own equipment."

`[Your response here]`

---

**Exercise 2:**
Fix the unclear antecedent:
"The teacher told the student that she needed to stay after class."

`[Your response here]`

---

**Exercise 3:**
Fix the shifting pronoun:
"When someone studies hard, you will see results."

`[Your response here]`

---

**Exercise 4:**
Rewrite this sentence to avoid "his or her":
"A customer should check his or her receipt before leaving."

`[Your response here]`

---

**Exercise 5:**
Write a sentence using "everyone" as the subject, with correct pronoun agreement.

`[Your response here]`

---

*Pronoun agreement isn't just about following rules — it's about being clear and inclusive. Make sure your reader always knows who you're talking about, and use language that includes everyone.*

---

## Example Lesson 10

**Topic:** Commas: Introductory Phrases

---

# Commas: Introductory Phrases

## Why This Matters
Most comma rules are black and white. This one isn't — and that's what makes it interesting. Sometimes you need the comma. Sometimes you don't. Sometimes it's completely up to you. If that sounds stressful, don't worry. By the end of this lesson, you'll know how to tell the difference — and you'll be making the call like a writer who actually understands why the comma is (or isn't) there.

## The Rule
When a sentence begins with an introductory element — a word, a phrase, or a clause that comes before the main point — you often need a comma to signal where the introduction ends and the main sentence begins.

But here's the nuance: **not all introductory elements are created equal.** There are three types, and the comma rules are different for each.

**Type 1: Introductory words — comma always needed.**
These are single words (or short transitions) that set up the sentence: *However, Unfortunately, Therefore, Meanwhile, Still, Finally, Yes, No.*

- *However, the results were inconclusive.*
- *Unfortunately, the concert was sold out.*

These always get a comma. No exceptions.

**Type 2: Introductory clauses — comma always needed.**
These are dependent clauses that come before the main clause. They have a subject and a verb but can't stand alone. (If you've done the lesson on independent and dependent clauses, you already know this one.)

- *When the bell rang, everyone rushed for the door.*
- *Because she'd been practicing all summer, she made the varsity team.*

If your sentence starts with a word like *when, because, although, if, since, while, after, before, unless,* or *even though* — and what follows has its own subject and verb — you need a comma before the main clause.

**Type 3: Short prepositional phrases — comma is optional.**
This is where it gets interesting. Short prepositional phrases at the beginning of a sentence — things like *After practice, In the morning, On Tuesday, At school* — don't strictly require a comma. Both versions are correct:

- *After practice I went straight to bed.* ✓
- *After practice, I went straight to bed.* ✓

So how do you decide? Use the **confusion test**: read the sentence without the comma. If there's even a moment where the meaning gets tangled or the reader might stumble, add the comma. If it reads smoothly, the comma is your choice.

**When the comma becomes necessary (even with a prepositional phrase):**
The longer the introductory phrase gets, the more you need that comma. Once a prepositional phrase stretches past a few words, the reader needs a signal for where the intro ends.

- ❌ *After practice with the varsity squad and the coaching staff I went straight to bed.*
- ✅ *After practice with the varsity squad and the coaching staff, I went straight to bed.*

Without the comma, the reader's brain tries to connect "staff" to "I" — and it takes a beat to untangle. The comma prevents that.

**The bottom line:** Introductory words and clauses always get a comma. Short prepositional phrases are the writer's call — unless skipping the comma creates confusion.

## See It In Action

**Example 1: Introductory word (comma required)**
- ❌ Before: Therefore the experiment was repeated.
- ✅ After: Therefore, the experiment was repeated.
- *Why:* Introductory transition words always need a comma. Without it, "Therefore the experiment" momentarily reads as a unit.

**Example 2: Introductory clause (comma required)**
- ❌ Before: While the teacher was collecting tests a fire alarm went off.
- ✅ After: While the teacher was collecting tests, a fire alarm went off.
- *Why:* "While the teacher was collecting tests" is a dependent clause. The comma signals where the setup ends and the action begins.

**Example 3: Short prepositional phrase (comma optional — both fine)**
- ✅ After dinner I took the dog for a walk.
- ✅ After dinner, I took the dog for a walk.
- *Why:* "After dinner" is short and clear. No confusion either way. This is a writer's choice.

**Example 4: Longer prepositional phrase (comma needed for clarity)**
- ❌ Before: In the middle of the crowded hallway between third and fourth period she dropped her phone.
- ✅ After: In the middle of the crowded hallway between third and fourth period, she dropped her phone.
- *Why:* Without the comma, the reader has to work to find where the scene-setting ends and the action starts. The comma draws the line.

**Example 5: The confusion test in action**
- ⚠️ Confusing: Inside the dog was barking loudly.
- ✅ Clear: Inside, the dog was barking loudly.
- *Why:* Without the comma, "Inside the dog" reads as a unit — and that's a very different (and disturbing) sentence. The comma is essential here.

**Example 6: Another confusion case**
- ⚠️ Confusing: Before eating the family said grace.
- ✅ Clear: Before eating, the family said grace.
- *Why:* Without the comma, it sounds like someone is about to eat the family. The comma keeps the meaning clear.

## Quick Tip
**The stumble test:** Read the sentence out loud without the comma. Did you stumble, backtrack, or accidentally combine words that don't belong together? Add the comma. Did it flow smoothly? The comma is optional. When in doubt, the comma never hurts — but unlike the Oxford comma, this one genuinely is a judgment call for short phrases.

---

## Practice Time

**Exercise 1:**
Add a comma if needed:
"However the policy has not been enforced."

**Your turn:** Is this an introductory word, clause, or phrase? Add the comma in the right place.

`[Your response here]`

---

**Exercise 2:**
Add a comma if needed:
"After the game we grabbed pizza."

**Your turn:** Is a comma required here, or is it optional? Explain your reasoning.

`[Your response here]`

---

**Exercise 3:**
Add a comma to fix the confusion:
"While cooking the baby started crying."

**Your turn:** Explain what's confusing without the comma, then add it.

`[Your response here]`

---

**Exercise 4:**
Add a comma if needed:
"In the weeks leading up to the championship game and the pep rally the entire school was buzzing with excitement."

**Your turn:** Is this a short prepositional phrase or a long one? Add the comma where the introduction ends.

`[Your response here]`

---

**Exercise 5:**
For each sentence, decide: comma required, comma optional, or no comma needed?

1. "Before class started the teacher set up the projector."
2. "On Friday we have a half day."
3. "Although she was nervous she nailed the presentation."

`[Your response here]`

---

**Exercise 6:**
Write two sentences of your own that begin with introductory elements:
1. One where the comma is required (introductory word or clause)
2. One where the comma is genuinely optional (short prepositional phrase)

`[Your response here]`

---

*Not every comma rule is a hard rule — and that's okay. The introductory comma is about clarity and rhythm. Learn the categories, trust the confusion test, and make the call. That's not breaking the rules. That's understanding them well enough to use your judgment.*
