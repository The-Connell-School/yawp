import {
  DAILY_PAGES_SHORT_FORM_CATEGORY_KEYS,
  DAILY_PAGES_SHORT_FORM_RUBRIC,
  DAILY_PAGES_SHORT_FORM_SCORING_SCALE,
} from './daily-pages-short-form-rubric';

/**
 * Four graded Daily Pages entries, for seeded environments only.
 *
 * A preview with no graded Daily Pages work in it cannot answer the question
 * the split is meant to settle: what the new assistant actually does to a
 * student's writing. Describing it is not the same as reading four entries on
 * one prompt and seeing where they land.
 *
 * They are written to span the scale rather than to flatter it, and to teach
 * the shape: the top entry states its claim in the first sentence and defends
 * it where it is most likely to fail; the next hedges the same claim behind "I
 * think that"; the third opens well but claims something nobody disputes; the
 * bottom one announces a claim instead of making one.
 * Because this rubric is band-scored, the weighted percentage follows the
 * category scores exactly — an entry scored Proficient across the board is
 * 60%, and seeing that in a preview is the point of putting it there.
 *
 * Nothing here imports the grading code: this module has to stay resolvable
 * from the Prisma seed, which runs outside the web app's `~/` alias. The
 * percentages are instead asserted against the real grading helpers in
 * `daily-pages-sample-entries.test.ts`, so they cannot drift from what the
 * assistant would compute.
 */

export type DailyPagesSampleCategoryKey =
  (typeof DAILY_PAGES_SHORT_FORM_CATEGORY_KEYS)[number];

/** Which seeded student persona writes the entry. */
export type DailyPagesSamplePersonaKey =
  | 'student'
  | 'student-submitted'
  | 'student-graded'
  | 'student-unreleased';

export type DailyPagesSampleGrammarIssue = {
  excerpt: string;
  kind: 'error' | 'style';
  message: string;
  rule?: string;
  ruleNumber?: number;
};

export type DailyPagesSampleEntry = {
  key: string;
  personaKey: DailyPagesSamplePersonaKey;
  studentFirstName: string;
  title: string;
  /** The entry itself. Grammar excerpts below must appear in it verbatim. */
  text: string;
  scores: Record<DailyPagesSampleCategoryKey, number>;
  comments: Record<DailyPagesSampleCategoryKey, string>;
  overallComment: string;
  grammarIssues: DailyPagesSampleGrammarIssue[];
  /** False leaves it graded but unreleased, which is a real teacher state. */
  released: boolean;
  /** How many days ago it was submitted, so the set is not one timestamp. */
  submittedDaysAgo: number;
};

/**
 * The assignment the four entries answer. Taken from the short-form corpus
 * (`sf-cd-002`) and needing no source text, so a reader of the preview can
 * judge the entries without having assigned a reading.
 */
export const DAILY_PAGES_SAMPLE_ASSIGNMENT = {
  title: 'Daily Pages — honest and kind at once',
  prompt:
    'Is it possible to be fully honest and fully kind at the same time? One paragraph: your claim, your reason, and the hardest counterexample you can think of.',
} as const;

export const DAILY_PAGES_SAMPLE_ENTRIES: DailyPagesSampleEntry[] = [
  {
    key: 'claim-first',
    personaKey: 'student-graded',
    studentFirstName: 'Casey',
    title: 'Honest and kind — Casey',
    text: 'Honesty and kindness hold together everywhere except where a question forecloses silence. What you say is honesty\u2019s business; when and how you say it is kindness\u2019s, and the two only collide when a full answer is demanded on the spot. My grandmother asked whether her painting was any good, and it was not. I told her the colors in the corner were the best part — true, and the only part I volunteered. The case that tests this is the harder version of the same question: if she had asked whether I would hang it in my house, there is no sentence that is both true and kind, and the silence I used is no longer available. So the claim holds, but it holds on a condition, and the condition is the part worth knowing — kindness is what chooses which true thing to say, and it needs something left unsaid to choose from.',
    scores: {
      depth_of_thought: 5,
      development_of_thought: 5,
      organization_and_structure: 4,
      voice_and_style: 5,
      grammar_and_mechanics: 4,
    },
    comments: {
      depth_of_thought:
        'The claim is exact and it takes a side — not "it depends", but a named condition under which it fails. You then went to the version of the question where your own answer runs out, which is where this category looks.',
      development_of_thought:
        'The painting is one specific, fully explained, and it does the work: it shows the silence you are claiming honesty is allowed. Nothing in the paragraph is decoration.',
      organization_and_structure:
        'Claim in the first sentence, reason, case, close. The close does two jobs at once — restating the condition and naming why it matters — and would land harder as two sentences.',
      voice_and_style:
        '"Forecloses silence" and "which true thing to say" are precise and yours. No hedges, nothing warming up.',
      grammar_and_mechanics:
        'Clean, including the semicolon, which is doing real work. The long dash aside carries a full point; consider giving it its own sentence.',
    },
    overallComment:
      'Casey, this is the top of the scale: a claim worth arguing, stated first, and defended at the point where it is most likely to fail. The one change worth making is in the last sentence — it carries two ideas, and splitting it would let each one land.',
    grammarIssues: [
      {
        excerpt:
          'the colors in the corner were the best part — true, and the only part I volunteered',
        kind: 'style',
        rule: 'Omit needless words.',
        ruleNumber: 10,
        message:
          'The aside does the work of a full sentence. Splitting it would let the point land on its own.',
      },
    ],
    released: true,
    submittedDaysAgo: 2,
  },
  {
    key: 'claim-hedged',
    personaKey: 'student-submitted',
    studentFirstName: 'Riley',
    title: 'Honest and kind — Riley',
    text: 'I think you can be honest and kind at the same time, but it takes work. Honesty means telling the truth and kindness means caring about the person you are telling it to, and those two things do not have to cancel each other out. If my friend asks me about her essay and it is disorganized, I can tell her it is disorganized and also tell her which paragraph is the strongest, and both of those are true. The hardest case against me is when the truth is something a person cannot change, like if someone asks whether people liked their speech and they already gave it. Then honesty does not help them and it still hurts. I would probably tell them anyway, because I would want to know, but I am not sure wanting to know myself is a good enough reason to decide for someone else.',
    scores: {
      depth_of_thought: 4,
      development_of_thought: 4,
      organization_and_structure: 4,
      voice_and_style: 3,
      grammar_and_mechanics: 4,
    },
    comments: {
      depth_of_thought:
        'You took a side and then went looking for the case that threatens it — the speech that has already been given is a real test, not an easy one.',
      development_of_thought:
        'Two specifics, each explained. To reach the top band, answer the case you raised: you leave "I am not sure" as the last word when you were one sentence from a position.',
      organization_and_structure:
        'Claim, reason, example, counterexample — the order is deliberate and easy to follow.',
      voice_and_style:
        'Cut the hedge and you have your opening sentence: "You can be honest and kind at the same time, but it takes work." That is the claim; "I think that" only delays it. Then say what the work is — the phrase is standing in for the thing you mean.',
      grammar_and_mechanics:
        'Few errors, and none that pull a reader out. Watch the long opening sentence; it could be two.',
    },
    overallComment:
      'Riley, the claim and the case for it are both here, which is most of the work. Two edits: open on the claim itself rather than on "I think that", and finish the counterexample you raised instead of stopping at "I am not sure".',
    grammarIssues: [
      {
        excerpt:
          'Honesty means telling the truth and kindness means caring about the person you are telling it to',
        kind: 'style',
        rule: 'In a compound sentence, use a comma before the conjunction joining two independent clauses.',
        ruleNumber: 3,
        message:
          'Two independent clauses are joined here with no comma before "and". Add one, or split the sentence.',
      },
    ],
    released: true,
    submittedDaysAgo: 2,
  },
  {
    key: 'claim-too-loose',
    personaKey: 'student',
    studentFirstName: 'Sam',
    title: 'Honest and kind — Sam',
    text: 'Yes, I think it is possible to be honest and kind at the same time. My reason is that being honest does not mean being mean about it. You can say something true in a nice way and then it is both honest and kind. A lot of people think you have to pick one but I do not think that is right. If you tell someone the truth in a nice way they will usually appreciate it later even if it is hard to hear at first. The hardest case would be if the truth is really bad, but I still think you can say it nicely. So my answer is that honesty and kindness work together most of the time as long as you are careful about how you say things.',
    scores: {
      depth_of_thought: 3,
      development_of_thought: 3,
      organization_and_structure: 3,
      voice_and_style: 3,
      grammar_and_mechanics: 3,
    },
    comments: {
      depth_of_thought:
        'Your claim is one nobody would dispute — "you can be kind about it" is where everyone starts. Take the side that costs something: name a case where saying it nicely does not help, and claim what you would do there.',
      development_of_thought:
        'The prompt asked for the hardest counterexample and you named the category — "if the truth is really bad" — without ever giving the case. One concrete example, with what actually happened, would move this up a band.',
      organization_and_structure:
        'The claim is in the first sentence and the close returns to it, which is the shape. The middle repeats rather than builds.',
      voice_and_style:
        '"Nice" is carrying the whole argument and appears three times, meaning something different each time. Name what you actually do differently when you say a hard thing nicely.',
      grammar_and_mechanics:
        'Generally correct. "A lot of people think you have to pick one but I do not think that is right" needs a comma before "but".',
    },
    overallComment:
      'Sam, you opened with your claim, which is the right shape — but the claim itself is the safe one, and the counterexample the prompt asked for never arrives. Next entry, spend most of the paragraph on the case that threatens what you said. That is where the score moves.',
    grammarIssues: [
      {
        excerpt:
          'A lot of people think you have to pick one but I do not think that is right',
        kind: 'error',
        rule: 'In a compound sentence, use a comma before the conjunction joining two independent clauses.',
        ruleNumber: 3,
        message: 'Add a comma before "but" — it joins two independent clauses.',
      },
      {
        excerpt: 'in a nice way',
        kind: 'style',
        rule: 'Prefer the specific to the general.',
        ruleNumber: 10,
        message:
          'This phrase carries the whole argument but is never defined. Name what you actually do differently.',
      },
    ],
    released: true,
    submittedDaysAgo: 1,
  },
  {
    key: 'prompt-restated',
    personaKey: 'student-unreleased',
    studentFirstName: 'Taylor',
    title: 'Honest and kind — Taylor',
    text: 'I think yes you can be honest and kind at the same time. Its possible because people do it everyday. My claim is that it is possible and my reason is that I have seen it happen alot. Sometimes people are honest and mean but that is there choice, they could of been kind instead. A counterexample would be if someone was honest and not kind. Overall I think being honest and kind at the same time is possible if you try.',
    scores: {
      depth_of_thought: 2,
      development_of_thought: 2,
      organization_and_structure: 2,
      voice_and_style: 3,
      grammar_and_mechanics: 2,
    },
    comments: {
      depth_of_thought:
        'This says the prompt back to me: the claim is "it is possible" and the reason is "I have seen it happen". Tell me about one time you saw it, and claim what made that one work.',
      development_of_thought:
        'The counterexample names the opposite of your claim instead of testing it. A real one is a case where being honest and being kind pull against each other — then say which you would choose.',
      organization_and_structure:
        'The first two sentences are warming up, and the claim when it arrives is an announcement of a claim ("my claim is that…") rather than the claim itself. Start with the sentence you would say if you only had one.',
      voice_and_style:
        'The voice is clear and direct, which is worth keeping while the rest catches up.',
      grammar_and_mechanics:
        'Several errors that slow a reader down: "Its" for "It\u2019s", "alot", "everyday" as one word, "there" for "their", and "could of" for "could have". The comma splice after "mean" needs a period.',
    },
    overallComment:
      'Taylor, right now this announces a claim instead of making one. The one change that would move it most: pick a single time you watched someone be honest and kind at once, open with what that shows, and spend the paragraph on it. The errors are worth a proofread too; the mechanics feedback has the specifics.',
    grammarIssues: [
      {
        excerpt: 'Its possible because people do it everyday',
        kind: 'error',
        rule: 'Use an apostrophe for the contraction "it is"; "everyday" is an adjective, "every day" is the adverb.',
        message:
          '"Its" should be "It\u2019s" here, and "everyday" should be two words: "every day".',
      },
      {
        excerpt: 'I have seen it happen alot',
        kind: 'error',
        rule: 'Spelling.',
        message: '"alot" is two words: "a lot".',
      },
      {
        excerpt: 'that is there choice, they could of been kind instead',
        kind: 'error',
        rule: 'Do not join independent clauses with a comma.',
        ruleNumber: 3,
        message:
          '"there" should be "their", "could of" should be "could have", and the comma joins two independent clauses — use a period.',
      },
    ],
    released: false,
    submittedDaysAgo: 1,
  },
];

/** The rubric key list these samples are written against. */
export const DAILY_PAGES_SAMPLE_CATEGORY_KEYS =
  DAILY_PAGES_SHORT_FORM_CATEGORY_KEYS;

/** The stored `rubricScores` shape: a score and a comment per category. */
export function buildSampleRubricScores(entry: DailyPagesSampleEntry) {
  return Object.fromEntries(
    DAILY_PAGES_SHORT_FORM_CATEGORY_KEYS.map((key) => [
      key,
      { score: entry.scores[key], comment: entry.comments[key], isAi: true },
    ])
  );
}

function letterFromPercent(percent: number): string {
  if (percent >= 90) return 'A';
  if (percent >= 80) return 'B';
  if (percent >= 70) return 'C';
  if (percent >= 60) return 'D';
  return 'F';
}

/**
 * The grade fields the band-scored rubric produces for an entry.
 *
 * This mirrors `computeWeightedBandPercentage` — each category is worth its
 * score out of the scale's maximum, weighted — rather than importing it, for
 * the alias reason above. The test asserts the two agree.
 */
export function sampleGradeFields(entry: DailyPagesSampleEntry) {
  const { maxScore } = DAILY_PAGES_SHORT_FORM_SCORING_SCALE;
  let weightedSum = 0;
  let totalWeight = 0;

  for (const category of DAILY_PAGES_SHORT_FORM_RUBRIC.categories) {
    const score = entry.scores[category.key as DailyPagesSampleCategoryKey];
    weightedSum += (score / maxScore) * 100 * category.weight;
    totalWeight += category.weight;
  }

  const numericPercentage = Math.round(weightedSum / totalWeight);
  const letterGrade = letterFromPercent(numericPercentage);

  return {
    overallScore: numericPercentage,
    numericPercentage,
    letterGrade,
    score: `${numericPercentage}% (${letterGrade})`,
  };
}

/** The stored `grammarIssues` payload shape, minus the ids the writer adds. */
export function buildSampleGrammarIssues(entry: DailyPagesSampleEntry) {
  return {
    version: 1,
    issues: entry.grammarIssues.map((issue, index) => ({
      id: `${entry.key}-grammar-${index + 1}`,
      excerpt: issue.excerpt,
      occurrence: 1,
      kind: issue.kind,
      ...(issue.rule ? { rule: issue.rule } : {}),
      ...(issue.ruleNumber ? { ruleNumber: issue.ruleNumber } : {}),
      message: issue.message,
    })),
  };
}
