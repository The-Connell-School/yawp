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
- Before: [problem sentence]
- After: [fixed sentence]
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

- **Introductory words** (However, Unfortunately, Therefore) - comma always needed
- **Introductory clauses** (When I got home, While she was eating) - comma always needed
- **Short prepositional phrases** (After practice, In the morning) - comma is *optional* unless omitting it causes confusion

The rule: if the absence of a comma creates confusion in the meaning or rhythm of the sentence, use a comma. If the sentence reads smoothly without it, the comma is the writer's choice.

**Example where both are acceptable:**
- After practice I went straight to bed.
- After practice, I went straight to bed.

**Example where comma is needed (longer phrase):**
- Bad: After practice with the varsity squad and the coaching staff I went straight to bed.
- Good: After practice with the varsity squad and the coaching staff, I went straight to bed.

Include this nuance in the lesson and give students practice identifying when the comma is required vs. optional.

---

## Quality Checks

Before delivering a lesson, verify:
- [ ] Hook is genuinely engaging (not "Today we'll learn about...")
- [ ] Explanation is clear without jargon overload
- [ ] Examples use interesting, varied content
- [ ] Examples show clear before/after contrast
- [ ] Quick tip is actually memorable
- [ ] Exercises are appropriately sequenced (easy to hard)
- [ ] Tone is warm and encouraging, not lecturing
- [ ] Lesson stays focused on ONE skill
