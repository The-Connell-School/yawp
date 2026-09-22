import type {
  PromptConfigData,
  RubricCategory,
  RubricData,
  RubricScoreBand,
  RubricScoreLabel,
  ScoringScaleData,
} from './assignment-type-rubric.shared';

/**
 * Daily Pages, after the split: a short, crisp, claim-first response, graded
 * formally.
 *
 * The shape is the thing. A Daily Pages entry is written the way a strong body
 * paragraph is written — the claim in the first sentence, the support behind
 * it, a close that lands. It is not an exploration. Writing to find out what
 * you think, with the discovery arriving at the end, is what a Class Starter
 * is for now, and grading the two the same way is what made one rubric unable
 * to serve either.
 *
 * What it looks for is a claim worth making and reasoning that holds it up —
 * not that the student has a pulse, and not a journey. A Class Starter credits
 * honest effort; this asks for a response that would survive being read aloud.
 * The prompt may be anchored to a text or an excerpt, or it may be general.
 *
 * How it is graded is the way an essay is graded, at a fraction of the length.
 * Structure, voice, grammar and syntax all count, and the writing is marked up.
 * A Class Starter is never marked up; that is the sharpest single line between
 * the two assistants.
 *
 * On first person: it is allowed and is never an error. What the rubric pushes
 * against is the hedge in front of the claim — "I think that", "in my opinion"
 * — which delays the claim by a sentence and softens it. That belongs in
 * feedback, as an edit the student makes, not in a deduction: score a phrase
 * and students write around the rubric instead of thinking.
 *
 * Thinking outweighs craft on purpose — the two thinking categories carry 55%
 * between them — but Voice/Style carries 20% rather than a token 10%, because
 * refinement is part of what the top of this scale means. At 10% a rule capping
 * unedited prose cost four points, which is not a rule. A clean, well-ordered
 * piece with nothing in it is still not a good Daily Pages entry. It scores on the essay's own 1-5
 * scale, and its three craft categories are the essay's own keys, so a teacher
 * grading both reads the same dimensions and a score means the same thing in
 * either place.
 */
/** The five things a Daily Pages entry is judged on, in rubric order. */
export const DAILY_PAGES_SHORT_FORM_CATEGORY_KEYS = [
  'depth_of_thought',
  'development_of_thought',
  'organization_and_structure',
  'voice_and_style',
  'grammar_and_mechanics',
] as const;

/**
 * The category that produces grammar and syntax highlighting. Deliberately the
 * essay's legacy grammar key, so highlighting resolves correctly even through
 * a path that predates the per-category flag.
 */
export const DAILY_PAGES_SHORT_FORM_GRAMMAR_CATEGORY_KEY =
  'grammar_and_mechanics';

/**
 * Plain proficiency language rather than the Class Starter's four words. This
 * one lands on a gradebook, where a student and a parent both have to read it.
 */
export const DAILY_PAGES_SHORT_FORM_SCORE_LABELS: RubricScoreLabel[] = [
  { value: 1, label: 'Beginning' },
  { value: 2, label: 'Developing' },
  { value: 3, label: 'Proficient' },
  { value: 4, label: 'Strong' },
  { value: 5, label: 'Exemplary' },
];

export const DAILY_PAGES_SHORT_FORM_SCORING_SCALE: ScoringScaleData = {
  type: 'weighted_1_5',
  minScore: 1,
  maxScore: 5,
  step: 1,
};

function bands(
  descriptions: [string, string, string, string, string]
): RubricScoreBand[] {
  return DAILY_PAGES_SHORT_FORM_SCORE_LABELS.map((entry, index) => ({
    min: entry.value,
    max: entry.value,
    label: entry.label,
    description: descriptions[index],
  }));
}

function category(
  key: (typeof DAILY_PAGES_SHORT_FORM_CATEGORY_KEYS)[number],
  label: string,
  weight: number,
  description: string,
  bandDescriptions: [string, string, string, string, string],
  options: { grammarHighlighting?: boolean } = {}
): RubricCategory {
  return {
    key,
    label,
    weight,
    description,
    scoreLabels: DAILY_PAGES_SHORT_FORM_SCORE_LABELS,
    bands: bands(bandDescriptions),
    // Every category earns its own feedback, as on an essay.
    feedbackEnabled: true,
    grammarHighlighting: options.grammarHighlighting ?? false,
  };
}

export const DAILY_PAGES_SHORT_FORM_RUBRIC: RubricData = {
  categories: [
    category(
      'depth_of_thought',
      'Depth of Thought',
      0.3,
      'Whether the claim is worth making and the thinking behind it holds up. Restating the prompt is not a claim, and neither is a position nobody would dispute. A claim that is precise, that takes a side, and that survives the objection a reader would raise first is what this reads.',
      [
        'Nothing to read, or nothing that engages the prompt.',
        'A reaction rather than a claim: agreement, disagreement, or the prompt restated.',
        'A real claim with a reason behind it, both at the level anyone would reach first.',
        'A precise claim that takes a side, with reasoning that holds against the obvious objection.',
        'A claim worth arguing — exact, not obvious, and defended at the point where it is most likely to fail.',
      ]
    ),
    category(
      'development_of_thought',
      'Development of Thought',
      0.25,
      'Whether the claim is actually held up: a reason, a specific, a quotation, a case. At this length one well-chosen specific, fully explained, beats three mentioned in passing — the test is whether a reader finishes the response persuaded rather than merely informed of an opinion.',
      [
        'No support; a single assertion, or the same point restated.',
        'Support named but never explained, or a response that circles the claim without backing it.',
        'One specific or reason, explained well enough to do its work.',
        'Support chosen for the point it carries, explained so the claim is genuinely held up.',
        'Every sentence earns its place: the support is exact, the explanation tight, the claim established in the space given.',
      ]
    ),
    category(
      'organization_and_structure',
      'Organization/Structure',
      0.12,
      'Whether the response is shaped like a strong body paragraph: the claim in the first sentence, the support in the middle, a close that lands. Warm-up sentences before the claim — clearing the throat, restating the prompt, announcing what the response will argue — are the most common way this score is lost.',
      [
        'No order a reader can follow.',
        'The claim arrives late or has to be inferred; sentences come in the order they were thought of.',
        'Claim, support, close, in that order.',
        'Opens on the claim and builds deliberately, each sentence handing off to the next.',
        'Shaped so the order itself carries the argument; nothing could be moved without cost.',
      ]
    ),
    category(
      'voice_and_style',
      'Voice/Style',
      0.2,
      'Whether the prose has been edited. First person is allowed and is never an error here — first person doing work, where the student’s own experience is the evidence or the judgment is theirs to own, belongs in a top entry. What costs is unrefined writing: the hedge in front of the claim ("I think that", "in my opinion"), narrating one’s own process ("what I thought was", "I’m pretty sure that"), and filler. An entry that reads as an unedited first draft does not reach the top two bands, however good its ideas are.',
      [
        'Flat or garbled; word choice obscures the meaning.',
        'Understandable but vague or padded, with hedges standing in for the claim.',
        'Clear and readable, but unedited: hedges, process narration, or filler are still in it.',
        'Edited: the claim is stated outright, the hedges are gone, and the words are chosen rather than reached for.',
        'Controlled and economical throughout — prose that holds up read aloud, where any first person is there because it does work.',
      ]
    ),
    category(
      'grammar_and_mechanics',
      'Grammar/Syntax/Mechanics',
      0.13,
      'Sentence construction, punctuation, usage, spelling, and formatting. Graded here — unlike a Class Starter, where it never is — and marked up, so the student can see the specific errors rather than a general note about them.',
      [
        'Errors throughout that block the reader.',
        'Frequent errors; the reader has to work past them.',
        'Generally correct, with errors that do not interfere with meaning.',
        'Few errors, and none that pull a reader out of the piece.',
        'Clean and controlled, including the harder constructions it attempts.',
      ],
      { grammarHighlighting: true }
    ),
  ],
};

export const DAILY_PAGES_SHORT_FORM_PROMPT_CONFIG: PromptConfigData = {
  gradingInstructions: [
    'You are grading a Daily Pages entry: a short, crisp, claim-first response, graded formally. Grade it the way you would grade a body paragraph of an essay — not a whole essay, and not a journal entry.',
    '',
    'The shape matters. A good entry opens with its claim, supports it, and closes. It is not an exploration: writing to find out what you think, with the point arriving at the end, is what a Class Starter is for, and it is not what this assignment asks for. A response that spends its first two sentences warming up has already lost ground, however well it finishes.',
    '',
    'This is not a Class Starter and it is not graded like one. On a Class Starter, honest effort earns full credit and the writing is never marked up. Here, effort alone earns the middle of the scale. Do not give credit for showing up to the page — the question is not whether the student wrote something, it is how good the claim is, how well it is held up, and how well it is written.',
    '',
    'Judge five things, and score each one separately. The first two matter most.',
    '',
    '1. Depth of Thought — is the claim worth making, and does the thinking behind it hold? Restating the prompt is not a claim; neither is a position nobody would dispute. A first reaction is not a claim either. Look for a claim that is precise, takes a side, and survives the objection a reader raises first.',
    '',
    '2. Development of Thought — is the claim actually held up? Look for a reason, a specific, a quotation, or a case, explained well enough to do its work. One developed specific is enough at this length; a list of unexplained assertions is not. If the prompt names a text or an excerpt, the support should come from it.',
    '',
    "3. Organization/Structure — is the claim in the first sentence? Then the support, then a close that lands. Mark down throat-clearing before the claim: restating the prompt, announcing what the response will argue, or narrating the student's own process.",
    '',
    '4. Voice/Style — are the sentences crisp and direct, in a tone that suits the assignment?',
    '',
    '5. Grammar/Syntax/Mechanics — grade sentence construction, punctuation, usage, spelling, and formatting, and mark the errors. Grammar and syntax count in this assignment. Point to specific errors rather than describing them in general terms.',
    '',
    'On first person: it is allowed, and writing "I" is never an error. Never mark a student down for it. First person done well belongs in a top entry — the student\'s own experience as the evidence, or a judgment that is theirs to own.',
    '',
    'What the top of the scale requires instead is refinement. An entry that reads as an unedited first draft — hedges in front of the claim ("I think that", "I feel like", "in my opinion"), narration of its own process ("what I thought was", "I\'m pretty sure that"), filler — scores no higher than 3 in Voice/Style, however good its ideas are. The top two bands are for prose that has been edited.',
    '',
    'Coach the difference rather than deducting for a phrase: show the student their own sentence with the hedge cut, so they can see the claim underneath it. The habit being taught is stating the claim outright, not avoiding the first person.',
    '',
    'Weigh thinking above craft. A clean, well-ordered entry with nothing in it is not a good Daily Pages entry, and an entry with a real claim and some rough sentences is not a bad one.',
    '',
    'Do not reward or penalize length on its own. A short piece is what was assigned: judge what is on the page, and never mark an entry down for being brief or up for being long.',
    '',
    'Use the bands written on each category to choose a score, then write feedback for that category: name what the student did, and the one change that would move it up a band. Speak to the student, and be specific enough that they could act on it in the next entry.',
  ].join('\n'),
};

/**
 * What the Tutor is told when a student is drafting one of these.
 *
 * The tutor is the half of this that a student meets before a grade exists, so
 * it carries the same two rules the rubric does — open on the claim, cut the
 * hedge — as coaching rather than as scoring. It never writes for the student:
 * it asks for the claim, and hands back the student's own sentence with the
 * throat-clearing removed so they can see the difference.
 *
 * This is module content, not code: the Daily Pages module row in each
 * database carries its own `tutorInstructions`, and the row that ships today
 * still describes the freewrite tutor ("help them think through an idea by
 * asking probing questions"), which coaches exactly the exploration this
 * assignment no longer wants. Seeded environments get the text below; changing
 * it for a customer is a deliberate content change, like the rubric itself.
 */
export const DAILY_PAGES_SHORT_FORM_TUTOR_INSTRUCTIONS = [
  'You are the Daily Pages tutor. A Daily Pages entry is a short, crisp response that opens with a claim and holds it up — closer to a strong body paragraph than to a journal entry or an essay. You are warm, direct, and brief. You never write content for the student.',
  '',
  'Coach three things, in this order:',
  '',
  '1. The claim. Ask what they are actually claiming, in one sentence. If their draft has no claim yet, ask for it before anything else. If the claim only appears halfway down, tell them where you found it and ask them to move it to the top.',
  '',
  '2. The support. Ask what holds the claim up — a reason, a specific, a line from the text if the prompt names one — and whether a reader would finish persuaded rather than merely told. One specific, explained, is enough.',
  '',
  '3. The hedge. Writing "I" is fine and you should never tell a student to avoid it. But when a draft opens "I think that…", "I feel like…", or "In my opinion…", quote their sentence back with the hedge cut and let them see the claim underneath. Offer it as an edit they can make, not as a rule they broke.',
  '',
  'Do not encourage the student to explore, freewrite, or work out what they think on the page. That is what a Class Starter is for. Here, the thinking happens before the first sentence, and the first sentence says it.',
].join('\n');
