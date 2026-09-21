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
 * They are written to span the scale rather than to flatter it. The top entry
 * complicates its own claim; the bottom one restates the prompt and stops.
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
    key: 'went-further',
    personaKey: 'student-graded',
    studentFirstName: 'Casey',
    title: 'Honest and kind — Casey',
    text: 'I want to say yes, because the alternative is that every kind person is lying a little, and that seems too cheap. My reason is that honesty is about what you say and kindness is mostly about when and how you say it, so they are not competing for the same space. The case that tests this is my grandmother, who asked me whether her painting was any good, and it was not. I said the colors in the corner were the best part, which was true, and I left out the rest, which was also true. So I was honest in the sense that nothing I said was false, and unkind nowhere. But I notice that I have moved the line: I am counting leaving something out as honest. If a full answer is what honesty means, then I failed it and called the failure kindness. I think the two can hold together, but only if honesty is allowed to be silent sometimes, and I am not sure I get to decide that on my own.',
    scores: {
      depth_of_thought: 5,
      development_of_thought: 5,
      organization_and_structure: 4,
      voice_and_style: 5,
      grammar_and_mechanics: 4,
    },
    comments: {
      depth_of_thought:
        'You caught yourself redefining honesty mid-argument and said so instead of hiding it — that is the move this category is looking for. The ending earns its uncertainty.',
      development_of_thought:
        'The painting example does real work: it tests the claim rather than decorating it, and the paragraph ends somewhere its first sentence could not have stated.',
      organization_and_structure:
        'Claim, reason, case, complication, in that order, with nothing wasted. A sentence marking the turn — "but I notice" is doing it alone — would make the shift easier to follow.',
      voice_and_style:
        '"Too cheap" and "unkind nowhere" are precise and yours. The prose sounds like someone thinking, not someone performing.',
      grammar_and_mechanics:
        'Clean throughout, including the long sentences you attempt. Watch the comma before "and I am not sure" — the clause is independent, so a semicolon or a period would carry it better.',
    },
    overallComment:
      'Casey, this is the top of the scale: you took a position, tested it against a case that actually threatens it, and then noticed the move you had made to survive the test. Next time, mark the turn for your reader — one sentence saying "here is where my definition shifted" — and nothing is left to ask for.',
    grammarIssues: [
      {
        excerpt: 'together, but only if honesty is allowed to be silent',
        kind: 'style',
        rule: 'Use a semicolon to join closely related independent clauses.',
        ruleNumber: 5,
        message:
          'These are two independent clauses joined by a comma. A semicolon or a full stop would hold them apart more cleanly.',
      },
    ],
    released: true,
    submittedDaysAgo: 2,
  },
  {
    key: 'gets-past-first-reaction',
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
        'You went past the first reaction: the speech example is a real test of your claim, not an easy one, and you did not pretend it was settled.',
      development_of_thought:
        'Two specifics, each explained. To reach the top band, follow the last thought one step further — what would make deciding for someone else defensible?',
      organization_and_structure:
        'Claim, reason, example, counterexample. The order is deliberate and easy to follow.',
      voice_and_style:
        'Clear and readable. "Takes work" and "cancel each other out" are doing the work of more precise phrases — say what the work is.',
      grammar_and_mechanics:
        'Few errors, and none that pull a reader out. Watch the long opening sentence; it could be two.',
    },
    overallComment:
      'Riley, you did the assignment properly: a claim, a reason you can defend, and a counterexample that genuinely threatens it. The thinking is there. The next step is precision — replace the general phrases ("it takes work") with the specific thing you mean, and push the last sentence one step further instead of stopping at "I am not sure."',
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
    key: 'held-at-the-level-it-started',
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
        'You have a genuine position and a reason behind it, but the paragraph ends on the level it started: "say it nicely" at the top and "say it nicely" at the bottom. Pick the case where saying it nicely does not help, and write about that one.',
      development_of_thought:
        'The prompt asked for the hardest counterexample and you named the category — "if the truth is really bad" — without giving the case. One concrete example, with what actually happened, would move this up a band.',
      organization_and_structure:
        'A clear beginning, middle, and end, in a sensible order.',
      voice_and_style:
        'Readable, in a tone that fits. "Nice" is carrying too much weight here; it appears three times and means something different each time.',
      grammar_and_mechanics:
        'Generally correct. "A lot of people think you have to pick one but I do not think that is right" needs a comma before "but".',
    },
    overallComment:
      'Sam, you answered the question and backed it, which is the middle of the scale. What is missing is the counterexample the prompt asked for: you named the shape of one ("if the truth is really bad") without ever writing it down. Next entry, spend most of your paragraph on the case that threatens your claim — that is where the score moves.',
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
    key: 'first-reaction-only',
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
        'This restates the prompt rather than answering it: the claim is "it is possible" and the reason is "I have seen it happen". Tell me about one time you saw it, and what made it work.',
      development_of_thought:
        'The counterexample names the opposite of your claim instead of testing it. A real one would be a case where being honest and being kind pull against each other — then say which you would choose.',
      organization_and_structure:
        'The sentences arrive in the order you thought of them. Deciding the order before you write — claim, reason, case — is most of this category.',
      voice_and_style:
        'The voice is clear and direct, which is worth keeping while the rest catches up.',
      grammar_and_mechanics:
        'Several errors that slow a reader down: "Its" for "It\'s", "alot", "everyday" as one word, "there" for "their", and "could of" for "could have". The comma splice after "mean" needs a period.',
    },
    overallComment:
      'Taylor, right now this says the prompt back to me. The one change that would move it most: pick a single time you watched someone be honest and kind at once, and spend the whole paragraph on that — what they said, what they left out, and why it worked. The errors are worth a proofread too; the list on the mechanics score has the specifics.',
    grammarIssues: [
      {
        excerpt: 'Its possible because people do it everyday',
        kind: 'error',
        rule: 'Use an apostrophe for the contraction "it is"; "everyday" is an adjective, "every day" is the adverb.',
        message:
          '"Its" should be "It\'s" here, and "everyday" should be two words: "every day".',
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
