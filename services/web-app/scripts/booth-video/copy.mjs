/**
 * Every word the booth video puts on screen, in one place: the demo class and
 * its essays, what the featured student types, the scripted model replies, and
 * the visual voiceover (title cards, captions, callouts).
 *
 * To change what the video says, edit this file and re-record. Our name is
 * always written "Yawp!" here; the all-caps logo is only ever the logo image.
 */

export const TEACHER = { email: 'dev.teacher@yawp.local', name: 'Alex Rivera' };
export const STUDENT = { email: 'dev.student@yawp.local', name: 'Maya Thompson', firstName: 'Maya' };
export const CLASS = { title: 'English 10 - Period 3', code: 'BOOTH-ENG10-P3', grade: '10', period: '3' };

// ---------------------------------------------------------------------------
// Section 1: the assignment
// ---------------------------------------------------------------------------

export const ASSIGNMENT = {
  title: "Fahrenheit 451: Are We Becoming Montag's World?",
  prompt:
    "In Fahrenheit 451, Captain Beatty tells Montag that the burning of books \"didn't come from the Government down.\" People stopped reading first. Is our society moving toward Montag's world, or away from it?\n\nWrite a thesis-driven essay that takes a clear position. Support it with at least two pieces of evidence from the novel and one example from the world around you, and explain how each piece of evidence proves your thesis.",
};

/** What the teacher types into "Generate a prompt". */
export const PROMPT_REQUEST =
  "We just finished Fahrenheit 451. I want them arguing about screens and attention, not summarizing the plot.";

export const PROMPT_GENERATOR_REPLY = {
  reply:
    "Here are three directions. The first asks students to take a side on our own world, so they can't hide in plot summary.",
  options: [
    { title: ASSIGNMENT.title, body: ASSIGNMENT.prompt },
    {
      title: 'The Hearth and the Salamander',
      body:
        "Beatty argues that books made people unhappy and that the firemen keep everyone \"happy.\" Is Beatty right that knowledge and happiness are in conflict? Write a thesis-driven essay that takes a position and defends it with evidence from the novel.",
    },
    {
      title: 'What Clarisse Notices',
      body:
        "Clarisse changes Montag by asking questions nobody else asks. What does Bradbury suggest is lost when people stop paying attention to the world around them? Write a thesis-driven essay that answers the question with evidence from the novel and one example from your own life.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Section 2: the student experience (Maya Thompson)
// ---------------------------------------------------------------------------

export const PREWRITING = [
  'Pre-writing',
  "My position: we ARE moving toward Montag's world, but nobody is banning books. We're choosing it.",
  '- Mildred + the Seashells = earbuds? There is always noise',
  '- Beatty: "it didn\'t come from the Government down"',
  '- short videos, notifications = the parlor walls',
  '- counter: libraries and book clubs still exist',
  'Big question: is it the technology or the people?',
];

export const TUTOR_FEEDBACK =
  "Maya, you've already found the most interesting angle on this prompt: nobody had to ban anything, people **chose** it. That's an argument, not a summary.\n\nTwo questions to push it further:\n\n1. Your notes end with *\"is it the technology or the people?\"* Which answer is your essay actually going to defend?\n2. Beatty's line is your strongest evidence. What does it prove that the Seashells don't?\n\nTry answering the first question in one sentence.";

export const STUDENT_REPLY_1 =
  "I think it's the people. The technology just makes it easier to choose noise over thinking.";

export const TUTOR_REPLY_1 =
  "That's sharper than anything in your notes. *\"The technology just makes it easier to choose noise over thinking\"* is close to a thesis already.\n\nNow find the proof: where in the novel does a character **choose** noise over thinking? Name the moment and you have your first body paragraph.";

export const STUDENT_ASKS_TO_WRITE =
  'Can you just write my thesis statement for me? I will change a few words.';

/**
 * The tutor's refusal: its own "not that kind of guy" line, then it sends Maya
 * back to what she has already written (her chat reply and her notes).
 */
export const TUTOR_REFUSAL =
  "I'm not that kind of guy. Anyway, the point of this is for YOU to write a thesis statement based on what YOU think about this topic.\n\nThe good news is you're almost there. A minute ago you wrote, *\"The technology just makes it easier to choose noise over thinking.\"* And your notes say nobody is banning books: *\"We're choosing it.\"*\n\nStart there. What do you think that says about where we're headed?";

export const ESSAY_TITLE = 'Turning Up the Volume';

export const ESSAY = [
  "In Fahrenheit 451, firemen burn books, but the scariest part of Montag's world is that most people stopped wanting to read long before the fires started. Captain Beatty admits that the burning \"didn't come from the Government down.\" Our society is not burning books, but we are moving toward Montag's world in a quieter way: technology makes it easier than ever to choose noise over thinking, and we are losing the patience that real understanding requires.",
  "First, like Mildred, many people now fill every silence. Mildred keeps the Seashell radios in her ears even while she sleeps, she never has to be alone with her own thoughts. Today, people scroll during dinner, in line at the store, and in bed. This shows that people are uncomfortable with silence.",
  "Second, Bradbury shows how speed replaces depth. Beatty describes how classics were \"cut to fit into fifteen-minute radio shows\" and then cut again until only \"a dictionary résumé\" was left. Social media does the same thing to ideas. A thirty-second video can make a complicated argument feel finished, so viewers stop asking questions.",
  "Some people argue that we are moving away from Montag's world because libraries, book clubs and online communities still celebrate reading. That is true, but these are choices a person has to make on purpose, against an endless feed designed to keep them watching.",
  "Bradbury did not predict a government that takes our books away. He predicted people who would give them up because something louder was easier. The good news is that a choice can be made differently. Every time we put the phone down and finish the chapter, we turn the volume down on Montag's world.",
];

/** The intro's last sentence: written in the Thesis Statement step, before the rest of the intro. */
export const THESIS =
  "Our society is not burning books, but we are moving toward Montag's world in a quieter way: technology makes it easier than ever to choose noise over thinking, and we are losing the patience that real understanding requires.";

/** Typed live at the end of drafting, so the time-lapse lands on a real keystroke. */
export const ESSAY_LAST_SENTENCE =
  ' Every time we put the phone down and finish the chapter, we turn the volume down on Montag\'s world.';

/** The sentence the Grading Assistant flags, and Maya's revision of it. */
export const WEAK_ANALYSIS = 'This shows that people are uncomfortable with silence.';
export const REVISED_ANALYSIS =
  "Bradbury keeps the Seashells playing even while Mildred sleeps because the noise is not entertainment; it is protection. She is afraid of what she might think in the quiet, and a feed that never ends offers us the same escape.";
export const COMMA_SPLICE = 'even while she sleeps, she never has to be alone';

// ---------------------------------------------------------------------------
// Section 3: grading
// ---------------------------------------------------------------------------

export const GRADING_ASSISTANT = {
  categories: [
    {
      key: 'thesis_and_content',
      score: 5,
      comment:
        "Your thesis takes a clear, arguable position (we are choosing noise over thinking) and every paragraph returns to it. Arguing that nobody had to ban the books is an original reading of Bradbury.",
    },
    {
      key: 'organization_and_structure',
      score: 4,
      comment:
        'Each body paragraph opens with a claim, and the counterargument paragraph is placed well. A transition into paragraph three would make the move from "noise" to "speed" smoother.',
    },
    {
      key: 'evidence_and_support',
      score: 3,
      comment:
        'You choose strong evidence (Beatty\'s admission, the Seashells, the "dictionary résumé"), but after the Seashells you stop at "This shows that people are uncomfortable with silence." Explain why Bradbury keeps the radios playing even while Mildred sleeps. What is the noise protecting her from?',
    },
    {
      key: 'voice_and_style',
      score: 4,
      comment:
        'Confident and readable. "Turning up the volume" is a strong controlling image; bring it back in the body paragraphs, not just the title and ending.',
    },
    {
      key: 'grammar_and_mechanics',
      score: 3,
      comment:
        'Mostly clean. Paragraph two has a comma splice ("even while she sleeps, she never has to be alone"). Use a period or a semicolon there.',
    },
  ],
  overallComment:
    "Maya, this is a confident, original argument: you don't just say we're becoming Montag's world, you explain how, through choice rather than force. Your next step is analysis. After each quotation, add a sentence that explains what the evidence proves before you move on.",
};

export const GRAMMAR_ISSUES = {
  issues: [
    {
      excerpt: COMMA_SPLICE,
      kind: 'error',
      rule: 'Comma splice',
      message:
        'Two complete sentences are joined with only a comma. Use a period or a semicolon after "sleeps."',
    },
    {
      excerpt: 'libraries, book clubs and online communities',
      kind: 'error',
      rule: 'Serial comma',
      message: 'In a list of three, add a comma before "and": "libraries, book clubs, and online communities."',
    },
    {
      excerpt: 'Social media does the same thing to ideas.',
      kind: 'style',
      rule: 'Vague reference',
      message: '"The same thing" makes the reader work backward. Name it: social media cuts ideas down until only a summary is left.',
    },
    {
      excerpt: 'That is true, but these are choices',
      kind: 'style',
      rule: 'Unclear pronoun',
      message: '"That" and "these" point at a whole sentence. Name what is true, so the counterargument stays clear.',
    },
  ],
};

/** What the teacher changes after the Grading Assistant runs: they have the final say. */
export const TEACHER_EDIT = {
  category: 'Evidence',
  addToOverall:
    ' Let\'s look at your Seashells paragraph together in conference on Thursday. I think it\'s the best idea in the essay.',
};

// ---------------------------------------------------------------------------
// The rest of the class: 23 classmates with graded, released essays
// ---------------------------------------------------------------------------

/**
 * Scores are thesis / organization / evidence / voice / grammar on the 1-5
 * scale. The pattern the Class Summary finds is real in the data: strong
 * theses, evidence that's quoted but not explained, comma splices after quotes.
 */
export const CLASSMATES = [
  { name: 'Jaylen Brooks', scores: [4, 4, 2, 4, 3], opening: "Montag's world is not coming because of fire; it is coming because of convenience. When Mildred's \"family\" in the parlor walls matters more to her than her husband, Bradbury shows what happens when screens replace people. Today many families sit in the same room on different screens." },
  { name: 'Sofia Ramirez', scores: [5, 5, 4, 5, 4], opening: "Bradbury's warning was never really about books; it was about attention. Clarisse is dangerous to the firemen because she notices things: the dew on the grass, the man in the moon. A society that can't notice can't think, and our endless feeds are training us out of noticing." },
  { name: 'Ethan Nguyen', scores: [4, 3, 2, 3, 2], opening: "We are becoming Montag's world because people do not read anymore. In the book Beatty says \"it didn't come from the Government down.\" This means the people did it. Today people watch videos instead of reading, they would rather be entertained." },
  { name: 'Aaliyah Johnson', scores: [4, 4, 3, 4, 3], opening: "Our society is moving toward Montag's world, but more slowly than Bradbury imagined. The parlor walls in the novel take up three walls of Mildred's house, and she wants a fourth. Phones are smaller, but they go everywhere with us." },
  { name: 'Lucas Martin', scores: [3, 3, 2, 3, 3], opening: "In Fahrenheit 451 the firemen burn books so people will be happy. I think our world is kind of like that because of social media. People post only happy things. This shows that people want to be happy and not think." },
  { name: 'Priya Patel', scores: [5, 4, 4, 4, 4], opening: "Fahrenheit 451 predicts a world where people trade understanding for comfort, and in one important way we have already made that trade. Beatty explains that the classics were \"cut to fit into fifteen-minute radio shows.\" A sixty-second summary video does the same thing to a novel." },
  { name: 'Marcus Lee', scores: [4, 3, 2, 3, 2], opening: "Society is moving toward Montag's world. Mildred tries to kill herself and the paramedics treat it like it is normal, they have done it many times. People today also do not take things seriously. This shows we are like the book." },
  { name: 'Hannah Kim', scores: [4, 4, 3, 4, 4], opening: "Bradbury feared a world where people forget how to have a real conversation. When Montag tries to talk to Mildred's friends about their husbands and children, they cannot answer honestly. Group chats can feel the same way: lots of talking, very little said." },
  { name: 'Diego Alvarez', scores: [3, 3, 2, 3, 2], opening: "I think we are not becoming Montag's world because we still have libraries. In the book they burn all the books. We can read any book we want, we have the internet too. So I disagree with the question." },
  { name: 'Grace Okafor', scores: [5, 5, 4, 4, 4], opening: "The most frightening line in Fahrenheit 451 is not about fire. It is Beatty's claim that people \"didn't come from the Government down.\" Censorship, Bradbury argues, begins as a preference. Our algorithms, which show us only what we already like, are that preference made automatic." },
  { name: 'Noah Fischer', scores: [4, 4, 3, 3, 3], opening: "We are heading toward Montag's world because we are losing our patience. Montag struggles to read the Bible on the subway while the Denham's Dentifrice ad blares. That scene is what studying with notifications on feels like." },
  { name: 'Isabella Rossi', scores: [4, 3, 2, 4, 3], opening: "In my opinion our world is becoming more like Montag's every year. Faber says \"It's not books you need, it's some of the things that once were in books.\" People today have more information than ever, but they don't think about it." },
  { name: 'Tyler Washington', scores: [3, 2, 1, 2, 2], opening: "Fahrenheit 451 is a book about a fireman named Montag who burns books. He meets a girl named Clarisse and she changes how he thinks. Then he starts reading books. I think our world is like this because of phones." },
  { name: 'Mei Chen', scores: [5, 4, 3, 5, 4], opening: "Montag's world did not need to ban thought; it simply made thinking unnecessary. Mildred never has to wonder what to feel, because the parlor family tells her. When an app tells us what to watch next, it is quietly making the same decision for us." },
  { name: 'Omar Haddad', scores: [4, 4, 3, 3, 3], opening: "Bradbury shows that a society without books is a society without memory. At the end of the novel, the book people become living books so the ideas survive. Today we save everything online but remember very little of it." },
  { name: 'Chloe Dubois', scores: [3, 3, 2, 3, 2], opening: "Our society is like Fahrenheit 451 because everyone is on their phones. In the book everyone watches the parlor walls, they don't talk to each other. This is like today. People need to read more books." },
  { name: 'Andre Thomas', scores: [4, 4, 3, 4, 3], opening: "We are moving away from Montag's world in one way and toward it in another. More teenagers read than our parents think, but fewer of us read slowly. Beatty's speed is the real danger, not his fire." },
  { name: 'Emily Walsh', scores: [4, 3, 2, 4, 3], opening: "I believe we are becoming Montag's world. Clarisse says people \"never talk about anything.\" This is true today. This shows that Bradbury was right about the future." },
  { name: 'Kenji Watanabe', scores: [4, 4, 3, 4, 4], opening: "Technology is not the villain of Fahrenheit 451; indifference is. The firemen could only burn books because nobody objected. When we scroll past news we disagree with, we are practicing the same indifference." },
  { name: 'Layla Hassan', scores: [5, 4, 4, 4, 3], opening: "Montag's society is moving toward us as much as we are moving toward it. Bradbury imagined seashell radios and wall-sized screens in 1953; we built both. What we have not built yet is a fire department for books, and the reason why matters." },
  { name: 'Ryan O\'Connor', scores: [3, 3, 2, 3, 3], opening: "In Fahrenheit 451 people are not allowed to read books. Our world is different because we can read. But a lot of people choose not to read, that is like the book in a way. This shows we could become like Montag's world." },
  { name: 'Zoe Bennett', scores: [4, 4, 3, 4, 3], opening: "Bradbury's parlor walls were a warning about loneliness disguised as company. Mildred calls the characters on the walls her family, but she cannot remember where she met her husband. Following strangers online can crowd out the people in the same room." },
  { name: 'Samuel Adeyemi', scores: [4, 3, 2, 3, 2], opening: "Our society is becoming like Montag's world because we care more about entertainment than knowledge. In the book Beatty says that people wanted to be happy. Today people watch shows all day, this shows they want to be happy too." },
];

// ---------------------------------------------------------------------------
// Section 5: Class Summary (the synthesis call's reply)
// ---------------------------------------------------------------------------

export const CLASS_SUMMARY = {
  overview:
    "Period 3 can take a position on Bradbury's warning: almost every thesis is arguable and specific. The gap is what happens after the quotation. Students choose strong evidence, then summarize it (\"This shows…\") instead of explaining what it proves.",
  categories: [
    { key: 'thesis_and_content', status: 'strength', summary: 'Most essays argue a real position rather than summarizing the plot, and several connect the novel to algorithms and short-form video in original ways.' },
    { key: 'organization_and_structure', status: 'strength', summary: 'Body paragraphs usually open with a clear claim; a handful drift into plot summary halfway through.' },
    { key: 'evidence_and_support', status: 'gap', summary: 'Students quote the right moments (Beatty, the Seashells, the parlor walls) but rarely explain them. "This shows that…" followed by a restatement is the most common pattern in the set.' },
    { key: 'voice_and_style', status: 'mixed', summary: 'The strongest writers use a controlling image; others rely on general statements like "people need to read more."' },
    { key: 'grammar_and_mechanics', status: 'mixed', summary: 'Comma splices are the most frequent error, and they cluster right after quotations, where students rush to connect evidence to a claim.' },
  ],
  nextSteps: [
    {
      title: 'Teach the "because" move',
      detail: 'Model how to follow a quotation with a sentence that names the key word and explains what it proves. Contrast a "This shows…" sentence from this set with a strong one, then have students repair one analysis sentence in their own essay.',
      rubricCategory: 'evidence_and_support',
    },
    {
      title: 'Fix comma splices after quotations',
      detail: 'A ten-minute mini-lesson on the splices that appear when students connect a quote to their claim, followed by the Fixing Comma Splices practice set.',
      rubricCategory: 'grammar_and_mechanics',
    },
    {
      title: 'Push strong writers on counterargument',
      detail: 'Students with strong theses are ready to answer the best objection to their argument. Ask them to add a "Some would argue…" paragraph and refute it with evidence.',
      rubricCategory: 'thesis_and_content',
    },
  ],
};

// ---------------------------------------------------------------------------
// Section 6: Lesson Planner
// ---------------------------------------------------------------------------

/**
 * Added by the teacher to the seeded message before sending. The first
 * sentence is the planner's own format for a class and its period length:
 * it gives the stack its 50-minute time bar.
 */
export const PLANNER_ADDITION =
  ' For English 10 · Period 3, 50 minutes. They can find quotes; they just can\'t explain them.';

/**
 * The plan, in the Lesson Planner's step format: one `##` heading per step
 * with its minutes and type, each step either prose or a single block, so
 * "Add everything" files six pieces that add up to the 50-minute period.
 */
export const LESSON_PLAN = `# Making the Quote Do the Work

English 10 · Period 3 · *Fahrenheit 451*. By the end of the period, students choose a quote that proves their claim, set it inside their own sentence, and explain how its words do the work.

## Class starter (5 min) {type: class_starter}

\`\`\`yawp-daily-pages
kind: class-starter
title: A line that stuck
minutes: 5
Think of one sentence from a book, a song or a show that has stayed with you. Why that sentence, and not the one before it?
\`\`\`

## Mini-lesson: the quote sandwich (10 min) {type: context}

Put the three layers on the board: **claim**, **quote**, **so what**. Then project the opening of the [Analysis Quick Writing Lesson](/app/writing-lessons/analysis) and read its first example aloud.

\`\`\`yawp-resource
title: Analysis
href: /app/writing-lessons/analysis
kind: lesson
Project the explanation and the first example only, about 4 minutes of it.
\`\`\`

1. Ask pairs: which word in the quote carries the claim? Give them a minute.
2. Take three answers. Receive each one warmly; a student who picks a weaker word is still looking closely, so ask what that word adds.
3. Land on this: the analysis names the word and says what it does.

## Worked example (8 min) {type: activity}

\`\`\`yawp-material
kind: sample
title: Two ways to use the same quote
minutes: 8
type: activity
---
## Version A

Montag likes his job. "It was a pleasure to burn." This shows he likes burning.

## Version B

Bradbury opens with Montag at ease in his work: "It was a pleasure to burn." The word *pleasure* turns destruction into appetite, so the reader meets a fireman who has never once asked what he is burning.

Circle the word each version leans on. Which one proves something?
\`\`\`

## Writing Practice: Analysis (10 min) {type: activity}

\`\`\`yawp-practice
lessons: analysis
problems: 6
title: Make the quote do the work
---
For each quote, write one sentence that names a word and explains what it proves.
\`\`\`

## Repair your essay (12 min) {type: thesis_essay}

\`\`\`yawp-material
kind: handout
title: Repair your essay: one quote, done right
minutes: 12
type: thesis_essay
---
## Repair your essay

1. Find one body paragraph in your Fahrenheit 451 essay where a quote sits on its own.
2. Underline the one word in that quote that does the most work.
3. Write two sentences after the quote: what the word means here, and how it proves your claim.

Your two new sentences:

______________________________________________

______________________________________________
\`\`\`

## Exit ticket (5 min) {type: closing}

\`\`\`yawp-exit-ticket
kind: check
focus: explain-concept
topic: how a quote proves a claim
answer: subjective
mainPoints: A strong answer names one word in the quote and says what that word shows about the claim.
watchFor: Restating the quote in other words instead of explaining it.
\`\`\`

\`\`\`suggestions
Make a version for students who need sentence starters
Shorten the mini-lesson to 7 minutes
\`\`\`
`;

/**
 * The reply to "Build the slide deck from my stack": a Lesson Deck Kit deck to
 * spec v3. It hangs one painting by theme (Turner's Temeraire, "the old giving
 * way to the new"), takes its colors from the painting, and shows the art on
 * the title plate, a divider and a Look slide (at most three large), plus the
 * big-idea strip and the exit thumbnail.
 */
export const SLIDE_DECK = `Here is the deck for the lesson in your stack.

\`\`\`yawp-slides
${JSON.stringify({
  title: 'Making the Quote Do the Work',
  subtitle: 'Claim, quote, so what',
  unit: 'Fahrenheit 451',
  art: 'turner-temeraire',
  colors: ['#9C4A22', '#3F5A73', '#7D6118'],
  slides: [
    { layout: 'title', title: "The Quote's Work", subtitle: 'Claim, quote, so what', course: 'English 10 · Period 3', speakerNotes: 'Let the painting sit while they settle.', minutes: 0 },
    { layout: 'write', title: 'A line that stuck', routine: 'Class starter', body: 'Think of one sentence from a book, a song or a show that stayed with you. Why that sentence?', minutes: 5, step: 1, speakerNotes: 'Start the timer as the bell rings.' },
    { layout: 'agenda', title: "Today's program", agenda: [{ title: 'A line that stuck', minutes: 5 }, { title: 'The quote sandwich', minutes: 10 }, { title: 'Two versions, one quote', minutes: 8 }, { title: 'Writing Practice', minutes: 10 }, { title: 'Repair your essay', minutes: 12 }, { title: 'Exit ticket', minutes: 5 }], speakerNotes: 'Walk the six steps in one breath.', minutes: 0 },
    { layout: 'look', title: 'What is being replaced?', question: 'A steam tug tows an old warship to be broken up. What is the painting saying about the new?', seconds: 60, followUp: 'Which detail made you say that?', minutes: 3, step: 2, speakerNotes: 'One minute of looking before anyone speaks. Bridge to Bradbury: the new thing wins, and something is lost.' },
    { layout: 'divider', title: 'Body paragraphs', processStep: 4, minutes: 0, step: 2, speakerNotes: 'Today is about the middle of the essay: the evidence.' },
    { layout: 'big_idea', title: 'The quote sandwich', body: '~~1|Claim~~, then ~~2|quote~~, then ~~3|so what~~: name the word that does the work and say what it does.', accentWord: 'word', minutes: 7, step: 2, speakerNotes: 'Build the three layers on the board.' },
    { layout: 'discuss', title: 'Which word works?', question: "Which word in 'It was a pleasure to burn' carries Montag's attitude?", choices: ['It', 'pleasure', 'burn'], answer: 2, grouping: 'Pairs', stem: 'The word ___ shows that…', minutes: 8, step: 3, speakerNotes: 'One minute in pairs, then reveal.' },
    { layout: 'steps', title: 'Repair your essay', bullets: ['Find one quote that sits on its own', 'Underline the word that does the most work', 'Add two sentences: what it means, what it proves'], minutes: 12, step: 5, speakerNotes: 'Circulate.' },
    { layout: 'exit', title: 'Before you go', body: 'Name one word in your quote and say what it proves.', button: 'Exit ticket', minutes: 5, step: 6, speakerNotes: 'Students open the exit ticket in Yawp!.' },
  ],
})}
\`\`\`
`;

/** "Send this lesson" rewrites, one per audience. */
export const SHARE = {
  admin: `## Making the Quote Do the Work

English 10 · Period 3 spent a 50-minute period on one skill their Fahrenheit 451 essays showed they needed: explaining how a quote proves a claim, instead of dropping it in.

## How the period ran
- **Class starter (5 min):** a quick write on a line that stayed with them.
- **Mini-lesson (10 min):** the quote sandwich: claim, quote, so what.
- **Worked example (8 min):** two uses of the same quote, compared.
- **Writing Practice (10 min):** six analysis items in Yawp!.
- **Repair your essay (12 min):** each student rewrote one paragraph of their own essay.
- **Exit ticket (5 min):** one word, and what it proves.

## Why this lesson
The class summary for the essay showed strong theses but quotes left unexplained. This lesson targets that gap directly.`,
  student: `We missed you in class.

Today we worked on making a quote do the work in your Fahrenheit 451 essay: name the one word that matters, then explain what it proves.

## What to do
1. Read the quote sandwich: **claim**, **quote**, **so what**.
2. Do the six Writing Practice items in Yawp!.
3. Pick one paragraph of your essay where a quote sits on its own, and add two sentences after it.

Bring your two new sentences to class tomorrow.`,
  sub: `## Class starter (5 min)
Students write about a line that stayed with them.

## Mini-lesson (10 min)
Put claim, quote, so what on the board and read the first Analysis example aloud.`,
  family: `Today in class, students practiced explaining how a quote proves a point in their Fahrenheit 451 essays.

## Talking about it at dinner
- Ask which word in their favorite quote does the most work.`,
};

// ---------------------------------------------------------------------------
// Section 7: writing practice (ACT-style questions for Fixing Comma Splices)
// ---------------------------------------------------------------------------

export const PRACTICE_QUESTIONS = {
  questions: [
    {
      sentence: 'Montag hides the books behind the air-conditioning grille, he knows Beatty will come looking for them.',
      underline: 'grille, he knows',
      choices: ['grille, he knows', 'grille; he knows', 'grille he knows', 'grille, knowing he knows'],
      correctChoiceIndex: 1,
      explanation: 'Both sides are complete sentences. A comma alone can\'t join them; a semicolon can.',
    },
    {
      sentence: 'Clarisse asks Montag if he is happy, the question stays with him all night.',
      underline: 'happy, the question',
      choices: ['happy, the question', 'happy. The question', 'happy the question', 'happy, and so the question it'],
      correctChoiceIndex: 1,
      explanation: 'Two complete sentences need a period, a semicolon, or a comma with a conjunction.',
    },
    {
      sentence: 'Faber is afraid to help at first, he finally agrees to teach Montag.',
      underline: 'first, he finally',
      choices: ['first, he finally', 'first, but he finally', 'first he finally', 'first, finally he'],
      correctChoiceIndex: 1,
      explanation: 'Adding the conjunction "but" after the comma correctly joins the two complete sentences.',
    },
    {
      sentence: 'The Hound never sleeps, it waits in the firehouse for its next target.',
      underline: 'sleeps, it waits',
      choices: ['sleeps, it waits', 'sleeps; it waits', 'sleeps it waits', 'sleeps, waits it'],
      correctChoiceIndex: 1,
      explanation: 'A semicolon joins two closely related complete sentences.',
    },
    {
      sentence: 'Mildred turns up the parlor walls, the noise fills every room of the house.',
      underline: 'walls, the noise',
      choices: ['walls, the noise', 'walls, and the noise', 'walls the noise', 'walls, noise'],
      correctChoiceIndex: 1,
      explanation: 'A comma plus "and" correctly joins two complete sentences.',
    },
  ],
};

// ---------------------------------------------------------------------------
// The visual voiceover
// ---------------------------------------------------------------------------

export const OPENING_CARD = {
  kicker: 'Yawp! for writing teachers',
  title: "The AI writing platform that won't write for your students.",
  sub: 'One assignment, from prompt to tomorrow\'s lesson.',
};

/** The three closing cards. */
export const CLOSING_STACK = [
  { who: 'For students', what: 'a tutor that guides and never writes' },
  { who: 'For teachers', what: 'a TA on every draft, a grading assistant, a class analyst, a lesson planner' },
  { who: 'For schools and districts', what: 'real-time data on how students are growing as writers' },
];
export const CLOSING_PUNCHLINE = "It won't write for your students, but it'll help you with everything else.";
/**
 * The QR codes on the last card. Until Brian sends them, `image` is null and
 * the card shows a labeled placeholder; set it to a PNG path (relative to this
 * folder or absolute) and re-render.
 */
export const CLOSING_QR = [
  { label: 'Sign up free', sub: 'Start with the free tier today.', image: null },
  { label: 'Book a demo', sub: 'For your school or district.', image: null },
];
export const CLOSING_CARD = { url: 'yawp.school' };

export const SECTIONS = {
  assign: { n: 1, title: 'Make assignments for your class.', sub: 'Start a thesis-driven essay and send it to the class.' },
  student: { n: 2, title: 'The student experience.', sub: 'A tutor that coaches thinking and never does the writing.' },
  grading: { n: 3, title: 'Grading.', sub: 'The Grading Assistant drafts. You decide.' },
  revision: { n: 4, title: 'Revision.', sub: 'Feedback becomes a better essay, not just a grade.' },
  summary: { n: 5, title: 'What your class needs next.', sub: 'Class Summaries read every essay so you can see the whole class.' },
  planner: { n: 6, title: 'Plan the lesson.', sub: 'From what your class needs to tomorrow\'s plan.' },
  practice: { n: 7, title: 'Writing practice.', sub: 'Short lessons and exercises, ready to assign.' },
  reporter: { n: 8, title: 'Reports on growth.', sub: 'See how every student is growing as a writer, all year.' },
};

export const TOTAL_SECTIONS = Object.keys(SECTIONS).length;

/** Captions (bottom bar) and callouts (tour-style cards), by beat. */
export const VO = {
  assign: {
    dashboard: 'Ms. Rivera teaches 10th grade English. She starts from the Thesis-Driven Essay.',
    generate: 'Describe what you\'re teaching. Yawp! drafts prompts to choose from.',
    generateCallout: { title: 'Prompts in seconds', body: 'Use your own prompt, pick one from the library, or have Yawp! draft three to choose from.' },
    sheet: 'Pick the class, check the settings, and send it.',
    tutorCallout: { title: 'You control the tutor', body: 'Turn the tutor off for a "cold write" when you want to see what students can do on their own.' },
    sent: 'Sent to every student in the class.',
  },
  student: {
    open: 'Maya opens her class and finds the assignment.',
    tutorBuiltIn: 'Every student gets their own document, with the tutor built in. Pre-writing comes first.',
    timelapse: 'Maya gets her ideas down.',
    feedback: 'She asks for feedback.',
    feedbackCallout: { title: 'Questions, not answers', body: 'The Yawp! tutor reads her notes and pushes her thinking forward.' },
    backAndForth: 'A short back-and-forth with the tutor.',
    asks: { title: 'The student asks the tutor to write for them.', body: '"Can you just write my thesis statement for me?"' },
    refusal: { title: 'The tutor\'s response', body: 'It won\'t write for her. It sends her back to what she has already said.' },
    point: { title: 'The refusal is the point.', body: 'Yawp! protects the cognitive friction students need to learn.' },
    steps: 'As you teach each step, the tutor supports students through it.',
    stepsCallout: { title: 'A tutor for every step', body: 'Thesis, introduction, body paragraphs, conclusion, title: each step has its own coaching.' },
    submit: 'Every word is Maya\'s own. She submits.',
  },
  grading: {
    open: 'Back on Ms. Rivera\'s dashboard: one essay to grade.',
    openCallout: { title: 'Grading starts here', body: 'Every essay waiting for a grade, one click away.' },
    run: 'One click runs the Grading Assistant.',
    results: 'Rubric scores and comments, grounded in Maya\'s actual sentences.',
    grammarCallout: { title: 'Grammar and syntax, flagged in the essay', body: 'The Grading Assistant identifies grammar and syntax errors and explains how to fix them.' },
    editCallout: { title: 'The teacher has the final say.', body: 'Teachers can change and edit anything the Grading Assistant does.' },
    release: 'When it\'s right, release it to Maya.',
  },
  revision: {
    open: 'Maya sees her grade and her teacher\'s feedback.',
    revise: 'Revise with the feedback beside the draft.',
    reviseCallout: { title: 'Revision, built in', body: 'Maya rewrites the sentence the feedback pointed to, then resubmits.' },
    submit: 'Version 2, submitted.',
  },
  summary: {
    open: 'Now the whole class: 24 essays on Fahrenheit 451.',
    run: 'One click summarizes the class.',
    neverBefore: { title: 'This has never been available to teachers before.', body: 'By the time you\'ve graded 100 essays, you\'ve forgotten the first half. Yawp! hasn\'t.' },
    patterns: 'Strengths, gaps, and the pattern behind them.',
    groups: 'Who needs what, by name.',
    next: { title: 'What to teach next', body: 'Each suggestion is grounded in this class\'s essays. One click turns it into a lesson.' },
  },
  planner: {
    open: 'The suggestion opens in the Lesson Planner.',
    otherStarts: { title: 'Or start somewhere else', body: 'Plan from a skill, a standard, or a writing fundamental. Teachers start where they are.' },
    chat: 'A short conversation, and the plan comes back built from Yawp! materials.',
    steps: { title: 'A plan, step by step', body: 'Every step is timed and built from Yawp! materials.' },
    stack: 'Add it all to the stack: the run of show for tomorrow.',
    runOfShow: { title: 'The run of show', body: 'Every step timed against your 50-minute period, with writing time marked in purple.' },
    control: { title: 'You stay in control', body: 'Drag steps into a new order, retime them, or cut one. Undo is a click away.' },
    create: { title: 'Writing steps become Yawp! assignments', body: 'One click creates the exit ticket for the class.' },
    deck: { title: 'The slide deck, built from your stack', body: 'Present it, edit it, or download it for PowerPoint.' },
    send: { title: 'Send the lesson', body: 'To an administrator, a sub, or a student who missed class.' },
  },
  practice: {
    library: 'Quick writing lessons for grammar and composition.',
    lesson: 'Each one teaches a single move, with practice ready to assign.',
    exercise: 'Students practice and get instant feedback.',
  },
  reporter: {
    anything: 'Run a report on anything: a class, a student, an assignment, a skill.',
    askCallout: { title: 'Ask in plain English', body: 'Type the report you want, the way you\'d ask a colleague.' },
    conference: 'Run one before a parent-teacher conference or a meeting with your principal.',
    tableCallout: { title: 'Growth, essay by essay', body: 'Every released grade since September, including a cold write with the tutor off.' },
    markingPeriod: 'At the end of a marking period, give students their own growth report.',
    shareCallout: { title: 'Share it', body: 'Print it or save it as a PDF for a conference, a principal, or the student.' },
    yearEnd: 'At the end of the year, pass class reports to next year\'s teachers.',
  },
};

/** One honest line, shown on the closing card. */
export const DISCLOSURE = 'Demo does not contain real student data.';

// ---------------------------------------------------------------------------
// Section 8: Reporter

export const REPORTER_REQUEST = 'Growth report for Maya Thompson';

/**
 * Maya's growth report, in the Reporter's own format (build-system-prompt.ts):
 * a short read, the numbers in tables, "The Writing", "Suggested Next Steps".
 * The earlier essays are demo data; the latest row takes her real grade on
 * the Fahrenheit 451 essay from the Reporter's tool call.
 */
export function reporterReport(latest = { percentage: 83, letter: 'B' }) {
  const now = `${latest.percentage}% (${latest.letter})`;
  return `**Maya is growing steadily: 71% to ${latest.percentage}% across four essays since September**, with her biggest gains in Thesis/Content and Evidence/Support. Her September personal narrative was a cold write (tutor off), so it is her baseline for independent work.

| Essay | Date | Condition | Grade |
|---|---|---|---|
| Personal narrative | Sep 8 | Cold write (tutor off) | 71% (C) |
| "The Lottery" analysis | Sep 26 | Warm write (tutor on) | 76% (C) |
| Phones in class argument | Oct 10 | Warm write (tutor on) | 80% (B) |
| ${ESSAY_TITLE} (*Fahrenheit 451*) | Oct 24 | Warm write (tutor on) | ${now} |

| Skill | September | Now |
|---|---|---|
| Thesis/Content | 3 | 5 |
| Evidence/Support | 2 | 4 |
| Organization/Structure | 3 | 4 |
| Voice/Style | 3 | 4 |
| Grammar/Syntax/Formatting | 3 | 3 |

## The Writing

- **Thesis/Content (3 to 5).** In September her claim was a topic. Now she argues a position: *"technology makes it easier than ever to choose noise over thinking."*
- **Evidence/Support (2 to 4).** She picks strong quotations, and after Ms. Rivera's feedback she explains them. Her revision: *"the noise is not entertainment; it is protection."*
- **Grammar/Syntax (holding at 3).** Comma splices appear in three of her four essays.

<details><summary>Assignment-by-assignment writing breakdown</summary><p><strong>Personal narrative.</strong> Vivid details, no controlling idea.</p><p><strong>"The Lottery."</strong> A clear claim; quotations dropped in without explanation.</p><p><strong>Phones in class.</strong> Stronger reasons; a counterargument for the first time.</p><p><strong>${ESSAY_TITLE}.</strong> An original, arguable thesis and a revision that adds real analysis.</p></details>

## Suggested Next Steps

- Assign *Fixing Comma Splices* and check her next draft for them.
- Give a second cold write before the marking period ends, to see how much has transferred.

\`\`\`suggestions
Growth plan for Maya Thompson
Class report for English 10 - Period 3
\`\`\``;
}
