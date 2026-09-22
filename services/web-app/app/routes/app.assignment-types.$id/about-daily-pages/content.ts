// The teacher-facing explanation of Daily Pages: what the assignment type is,
// what it is not, how the assistant grades it, and how to write a prompt for
// it.
//
// It lives next to the library rather than inside it because it answers a
// different question. The library directions tell a teacher how to browse and
// click; this tells them what they are assigning. Most Daily Pages prompts a
// teacher uses over a year will be their own, written the morning of, so the
// page has to teach the shape of a good one rather than only hand out
// finished ones.
//
// Every claim here about grading is derived from the rubric itself — see
// GRADING_SUMMARY below and the parity test in `content.test.ts`. Copy that
// describes the assistant and drifts from what the assistant does is worse
// than no copy at all.

import {
  DAILY_PAGES_SHORT_FORM_CATEGORY_KEYS,
  DAILY_PAGES_SHORT_FORM_RUBRIC,
  DAILY_PAGES_SHORT_FORM_SCORE_LABELS,
} from '~/domain/assignment-types/daily-pages-short-form-rubric';

type CategoryKey = (typeof DAILY_PAGES_SHORT_FORM_CATEGORY_KEYS)[number];

export const ABOUT_HEADING = 'About Daily Pages';

export const ABOUT_LEDE =
  'A Daily Pages entry is one short, crisp response: ten or fifteen minutes, a paragraph to a page, opening with a claim and holding it up. It is written the way a strong body paragraph is written, and graded the way an essay is graded at a fraction of the length — thinking first, then structure, voice, and mechanics — with the writing marked up so the student can see the specific errors rather than a note about them.';

export const WHAT_IT_IS_HEADING = 'What a Daily Pages entry is';

export const WHAT_IT_IS: string[] = [
  'Claim-first. The response opens with what the student is arguing, supports it, and closes. The thinking happens before the first sentence; the first sentence says it.',
  'Short enough to assign often. A student can finish one before the bell, and you can read a class set in a free period.',
  'Graded on thought. Depth and development of thought carry most of the score. A student who fills the page honestly has earned the middle of the scale, not the top of it.',
  'Either anchored or general. The prompt can hang on a text or an excerpt, or ask for a position on something the class has not read at all.',
  'Marked up. Grammar and syntax are scored and the errors are highlighted — unless you turn grammar grading off on a particular assignment.',
  'Cumulative. A term of entries is a record of how one student’s thinking moved, which is what a conference with a parent or a student actually needs.',
];

export const WHAT_IT_IS_NOT_HEADING = 'What it is not';

/** Each line names the thing teachers reach for instead, so the boundary is usable. */
export const WHAT_IT_IS_NOT: { claim: string; detail: string }[] = [
  {
    claim: 'Not a warm-up, and not an exploration.',
    detail:
      'Writing to find out what you think — the freewrite, the page filled honestly, the point arriving at the end — is a Class Starter: full credit for effort, never marked up. Assign that when you want students thinking on the page. Assign this when you want the claim at the top and the case underneath it.',
  },
  {
    claim: 'Not an essay.',
    detail:
      'No thesis statement, no introduction-body-conclusion. One strong body paragraph is the whole shape: claim, support, close.',
  },
  {
    claim: 'Not a reading check.',
    detail:
      'Recall is not scored. A student who retells the chapter accurately and does nothing with it lands low. If what you need is whether they read, give a quiz.',
  },
  {
    claim: 'Not a length contest.',
    detail:
      'The assistant is told never to reward or penalize length on its own. A tight paragraph can score at the top of the scale; a rambling page does not.',
  },
  {
    claim: 'Not a grammar exercise.',
    detail:
      'Mechanics are the smallest slice of the score, and you can switch grammar grading off per assignment when the point of the day is the thinking alone.',
  },
];

export const HOW_ITS_GRADED_HEADING = 'How it is graded';

export const HOW_ITS_GRADED_INTRO =
  'Five categories, each scored on its own and each getting its own feedback. Thinking outweighs craft on purpose: a clean, well-ordered entry with nothing in it is not a good one, and an entry with a real idea and some rough sentences is not a bad one.';

/**
 * One line per rubric category, in rubric order, with the weight read off the
 * rubric rather than written down twice. A test asserts the keys here are
 * exactly the rubric's keys, so a category added or reweighted upstream
 * cannot leave this page quietly describing the old assistant.
 */
const CATEGORY_GLOSS: Record<CategoryKey, string> = {
  depth_of_thought:
    'Whether the claim is worth making and the reasoning holds. Restating the prompt is not a claim, and neither is a position nobody would dispute.',
  development_of_thought:
    'Whether the claim is actually held up — one reason, specific or quotation, explained far enough to persuade rather than just inform.',
  organization_and_structure:
    'Whether the claim is in the first sentence, the support in the middle, and the close lands. Throat-clearing before the claim is where this score goes.',
  voice_and_style:
    'Whether the prose has been edited. First person is fine; hedges, process narration and filler are what cost, and an unedited draft cannot reach the top two bands.',
  grammar_and_mechanics:
    'Sentence construction, punctuation, usage, spelling. Graded and marked up here, unlike a Class Starter — and switchable per assignment.',
};

export type GradingSummaryRow = {
  key: CategoryKey;
  label: string;
  /** Whole-number percent of the score, read off the rubric's weight. */
  weightPercent: number;
  gloss: string;
};

export const GRADING_SUMMARY: GradingSummaryRow[] =
  DAILY_PAGES_SHORT_FORM_RUBRIC.categories.map((category) => ({
    key: category.key as CategoryKey,
    label: category.label,
    weightPercent: Math.round(category.weight * 100),
    gloss: CATEGORY_GLOSS[category.key as CategoryKey],
  }));

/** The scale, spelled out so a teacher knows what a 3 means before a student asks. */
export const SCORE_SCALE_LABELS: string[] =
  DAILY_PAGES_SHORT_FORM_SCORE_LABELS.map(
    (entry) => `${entry.value} ${entry.label}`
  );

export const SCORE_SCALE_NOTE =
  'Each category scores 1 to 5. Effort alone lands at Proficient; the top two bands are for a claim worth arguing, defended where it is most likely to fail.';

/**
 * The register rules, kept next to the scale because they are the two
 * questions teachers ask first and the two the assistant used to answer by
 * importing whatever it associated with essays.
 */
export const REGISTER_NOTE =
  'First person is allowed and is never marked as an error — a student may write "I", and first person doing work belongs in a top entry. What the top of the scale asks for is an edited piece: a response still carrying hedges ("I think that…"), narration of its own process ("what I thought was…") or filler scores no higher than Proficient on Voice/Style, however good its ideas are. The assistant coaches the cut rather than deducting for the phrase, and the Tutor coaches the same two things while they draft: put the claim first, then cut the hedge.';

export const HOW_TO_USE_HEADING = 'Using it with a class';

export const HOW_TO_USE: string[] = [
  'Give them a rhythm students can feel — the same day each week, or the last ten minutes of every reading day. Scores climb once a class recognizes what the rubric is asking for.',
  'Put the prompt and the target length where students can see them. They cannot aim at a finish line nobody named.',
  'Read for the trend rather than the single score. Depth and Development are where movement shows up first.',
  'Turn grammar grading off on the assignment when the point of the day is the thinking, and leave it on when you want mechanics tracked.',
  'Use one as a rehearsal for an essay. What a student writes here is a body paragraph, so the habit transfers directly — and you will both already know what it scored.',
  'Say the shape out loud the first few times: claim in the first sentence, then the case for it. Most of the early score movement comes from students who stop warming up before they start.',
];

export const WRITE_YOUR_OWN_HEADING = 'Writing your own prompt';

export const WRITE_YOUR_OWN_INTRO =
  'The library is a starting point, not a ceiling — your prompts will beat ours, because you know what your class read this week. Write one straight into the assignment sheet (New → Assignment), or open a library prompt and edit it before you create the assignment. A prompt grades well when it carries three parts:';

export const PROMPT_RECIPE: { move: string; detail: string }[] = [
  {
    move: 'Ask for a claim, not a reflection',
    detail:
      'Something to take a side on: a claim to accept or reject, a choice the author made, two things to tell apart, a term to draw a boundary around, or a passage to go back into for specific words. A prompt that asks how a student feels, or what they noticed, gets an exploration — which is a Class Starter, and will score badly here.',
  },
  {
    move: 'Ask for the backing',
    detail:
      'Name what has to come with the opinion: the reason, the quoted line, the example that tests it, the hardest case against it. This is the sentence that makes the entry gradeable — Development of Thought reads exactly this, and a prompt that asks only for a reaction leaves it nothing to score.',
  },
  {
    move: 'Name the finish line',
    detail:
      'A paragraph, half a page, a page. Length earns nothing on its own, so the target is how a student knows when they are done rather than how much credit they are buying.',
  },
];

export const PROMPT_RECIPE_SOURCE_NOTE =
  'If the prompt needs a text, say which one and make sure it is in front of them. A prompt that names a book a student does not have open is a prompt about the book’s reputation.';

export const REWRITE_HEADING = 'The same prompt, before and after';

/** Three rewrites, one per failure a prompt usually dies of: a reaction, a list, a yes/no. */
export const PROMPT_REWRITES: { before: string; after: string; why: string }[] =
  [
    {
      before: 'What did you think of Chapter 4?',
      after:
        'Pick the one sentence in Chapter 4 you would defend as the turning point. Quote it, and say what it turns. One paragraph.',
      why: 'The first asks for a reaction and gets one. The second sends the student back into the text and says what has to come back out with them.',
    },
    {
      before: 'Compare Gatsby and Tom.',
      after:
        'Name the one difference between Gatsby and Tom that actually matters, and give the moment in the novel where that difference shows. Half a page.',
      why: 'An open comparison becomes a list at this length. Narrowing it to one difference is what leaves room to develop anything.',
    },
    {
      before: 'Is honesty always important?',
      after:
        'Is it ever right to lie to someone you love? Take a position, then answer the hardest case against it. One paragraph.',
      why: 'A yes-or-no question can be answered in a sentence. Asking for the case against it is what makes the thinking go a second step.',
    },
  ];

export const PROMPT_WARNINGS_HEADING = 'Signs a prompt will not grade well';

export const PROMPT_WARNINGS: string[] = [
  'It can be answered yes or no, or with a feeling.',
  'It asks for a summary, a retelling, or a fact from the reading.',
  'It names a text but could be answered without opening it.',
  'It asks four things at once. At this length, one move is enough.',
  'It gives no target length.',
];
