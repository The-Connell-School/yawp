now i---
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
6. **Comma: Clauses** - Separating independent and dependent clauses
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
