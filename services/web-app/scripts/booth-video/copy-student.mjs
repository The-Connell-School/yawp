/**
 * The "student and feedback" cut: what students and teachers see while Yawp!
 * serves students, from the first draft to a revised second version. No
 * Lesson Planner, no setup how-to (the assignment is made off camera).
 *
 * Recorded by record-student.mjs (BOOTH_CUT=student bash run.sh). The demo
 * class, the essay and most scripted replies are shared with copy.mjs.
 */
import { ESSAY, ESSAY_TITLE, GRADING_ASSISTANT, THESIS } from './copy.mjs';

export const OPENING_CARD = {
  kicker: 'Yawp! for writing teachers',
  title: "The AI writing platform that won't write for your students.",
  sub: 'What your students see, and what you see, from first draft to revision.',
};

export const SECTIONS = {
  document: { n: 1, title: "The student's document.", sub: 'The prompt, the draft and a tutor, side by side.' },
  steps: { n: 2, title: 'Coached through every step.', sub: 'Thesis to title, then a review before she submits.' },
  teacherSees: { n: 3, title: 'What the teacher sees.', sub: 'The draft, the tutor conversation, and anything pasted in.' },
  grading: { n: 4, title: 'Grading.', sub: 'The Grading Assistant drafts. You decide.' },
  feedback: { n: 5, title: 'Feedback comes back.', sub: 'Maya sees exactly what to work on, and revises.' },
  version2: { n: 6, title: 'Version 2.', sub: 'The revision is graded too. Growth you can see.' },
  summary: { n: 7, title: 'The whole class.', sub: 'Every essay read, so you know who needs what.' },
  reporter: { n: 8, title: 'Growth over time.', sub: 'Every student\'s writing, all year.' },
};
export const TOTAL_SECTIONS = Object.keys(SECTIONS).length;

/** The tutor's feedback on Maya's thesis (Thesis Statement step, "Give me feedback!"). */
export const TUTOR_THESIS_FEEDBACK =
  "That's a real thesis: it takes a side, and it tells your reader how you'll prove it.\n\nNotice it has two parts: *choosing noise over thinking* and *losing patience*. Each one can carry a body paragraph.\n\nWhich moment in the novel proves the first part? That's where your first body paragraph starts.";

/** The tutor's review of the whole draft ("Review my Essay!" → "Yes -- review it!"). */
export const VAGUE_SENTENCE = 'Social media does the same thing to ideas.';
export const VAGUE_FIX = 'Social media cuts ideas down the same way, until only a summary is left.';
export const TUTOR_REVIEW =
  "Your argument holds together from the first sentence to the last, and your counterargument is in exactly the right place.\n\nOne sentence to look at before you submit:\n\n> *\"Social media does the same thing to ideas.\"*\n\nWhat is \"the same thing\"? Your reader has to work backward to find out. Say it outright, in your own words.";

/** The teacher's margin comment, on the sentence the Grading Assistant also flags. */
export const MARGIN_COMMENT_ON = 'This shows that people are uncomfortable with silence.';
export const MARGIN_COMMENT =
  'This is where your best idea is hiding. Why would Mildred need noise even while she sleeps?';

/** Maya fixes the comma splice in her revision, as the grammar note says. */
export const SPLICE_FIX = { from: 'even while she sleeps, she never', to: 'even while she sleeps; she never' };

/** The Grading Assistant on version 2: the analysis is there now. */
export const GRADING_ASSISTANT_V2 = {
  categories: GRADING_ASSISTANT.categories.map((c) => {
    if (c.key === 'evidence_and_support') {
      return {
        ...c,
        score: 5,
        comment:
          'This is the revision the essay needed. "The noise is not entertainment; it is protection" explains what the Seashells prove instead of restating them, and it ties the evidence straight back to your thesis.',
      };
    }
    if (c.key === 'grammar_and_mechanics') {
      return { ...c, score: 4, comment: 'The comma splice in paragraph two is fixed. One small item left: add a comma before "and" in your list of three.' };
    }
    return c;
  }),
  overallComment:
    "Maya, your revision does exactly what the first round asked for: the Seashells paragraph now explains what the evidence proves, and it's the strongest paragraph in the essay. Keep doing this after every quotation.",
};

/** Captions (bottom bar) and callouts (tour-style cards), by beat. */
export const VO = {
  document: {
    open: 'Maya, 10th grade, opens her English class and finds the new essay.',
    layout: { title: 'Her own document', body: 'The prompt stays in view above the draft, and the tutor sits beside it.' },
    prewrite: 'She starts with pre-writing. Every word is typed by Maya.',
    feedback: 'She asks the tutor for feedback.',
    feedbackCallout: { title: 'Questions, not answers', body: 'The tutor reads her notes and pushes her thinking forward.' },
    backAndForth: 'Maya answers in her own words.',
    asks: { title: 'Then she asks the tutor to write it for her.', body: '"Can you just write my thesis statement for me?"' },
    refusal: { title: 'The tutor\'s response', body: 'It won\'t write for her. It sends her back to what she has already said.' },
    point: { title: 'The refusal is the point.', body: 'Yawp! protects the cognitive friction students need to learn.' },
  },
  steps: {
    thesis: 'Each step of the essay has its own coaching.',
    thesisCallout: { title: 'Feedback on her thesis', body: 'The tutor names what works, then asks the next question.' },
    drafting: 'Maya drafts her introduction, body paragraphs and conclusion.',
    review: 'Before she submits, the tutor reviews the whole draft.',
    reviewCallout: { title: 'A review, not a rewrite', body: 'It points to one vague sentence and asks Maya to fix it herself.' },
    fix: 'So she does.',
    submit: 'Every word is Maya\'s own. She submits.',
  },
  teacherSees: {
    open: 'On Ms. Rivera\'s dashboard: one essay to grade.',
    paste: { title: 'Nothing pasted in', body: 'Yawp! flags text pasted into a draft. Maya\'s has none.' },
    viewDocument: 'Ms. Rivera can open Maya\'s document itself.',
    transcript: { title: 'Every tutor conversation', body: 'Teachers see what the tutor said at every step, including when it said no.' },
  },
  grading: {
    run: 'One click runs the Grading Assistant.',
    results: 'Rubric scores and comments, grounded in Maya\'s actual sentences.',
    grammarCallout: { title: 'Grammar and syntax, flagged in the essay', body: 'Each note explains the rule and how to fix it.' },
    comment: 'Ms. Rivera adds a note of her own, right on Maya\'s sentence.',
    commentCallout: { title: 'Comments in the margin', body: 'Anchored to the exact words, the way you\'d write on paper.' },
    editCallout: { title: 'The teacher has the final say.', body: 'Change any score or comment the Grading Assistant drafts.' },
    release: 'When it\'s right, release it to Maya.',
  },
  feedback: {
    open: 'Maya sees her grade the moment it\'s released.',
    rubric: { title: 'Scores she can act on', body: 'Every rubric score comes with a comment about her own writing.' },
    margin: 'Her teacher\'s note sits beside the sentence it\'s about.',
    grammar: { title: 'Grammar, explained', body: 'Maya hovers a highlight to see the rule and the fix.' },
    revise: 'Revision opens with the feedback beside her draft.',
    reviseCallout: { title: 'She rewrites it herself', body: 'The sentence her teacher pointed to becomes the heart of the paragraph.' },
    splice: 'She fixes the comma splice the grammar note flagged.',
    submit: 'Version 2, submitted.',
  },
  version2: {
    open: 'Back to Ms. Rivera: Maya\'s revision is in.',
    run: 'The Grading Assistant reads version 2.',
    up: { title: 'Evidence/Support: 4 to 5', body: 'The revision earned it, and the comment says exactly why.' },
    release: 'Released. Both versions stay in Maya\'s record.',
  },
  summary: {
    open: 'Now the whole class: 24 essays on Fahrenheit 451.',
    run: 'One click summarizes the class.',
    neverBefore: { title: 'Every essay, read together', body: 'By the time you\'ve graded 100 essays, you\'ve forgotten the first half. Yawp! hasn\'t.' },
    pattern: { title: 'The pattern behind the grades', body: 'Students quote the right moments, then stop explaining.' },
    groups: 'Who needs what, by name.',
  },
  reporter: {
    ask: 'Yawp! Reporter answers questions about your students in plain English.',
    askCallout: { title: 'Ask for a growth report', body: 'The way you\'d ask a colleague.' },
    table: { title: 'Growth, essay by essay', body: 'Every released grade since September, including a cold write with the tutor off.' },
    writing: 'In her own words: the growth, with her sentences as evidence.',
    share: 'Bring it to a conference, or give it to Maya.',
  },
};

export { ESSAY, ESSAY_TITLE, THESIS };

/** The closing cards for this cut: no Lesson Planner in the teacher line. */
export const CLOSING_STACK = [
  { who: 'For students', what: 'a tutor that guides and never writes' },
  { who: 'For teachers', what: 'a TA on every draft, a grading assistant, and a class analyst' },
  { who: 'For schools and districts', what: 'real-time data on how students are growing as writers' },
];
