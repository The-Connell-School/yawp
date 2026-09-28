import { DAILY_PAGES_SHORT_FORM_CATEGORY_KEYS } from '~/domain/assignment-types/daily-pages-short-form-rubric';

import type {
  BenchmarkCaseApproval,
  GradingBenchmarkCase,
  GradingBenchmarkSuite,
  GradingEvaluationDefinition,
} from './grading-benchmark';

/**
 * Calibration cases for the Daily Pages grading assistant.
 *
 * The first graded examples read as too lenient, and "stricter" is not a
 * setting you can tune by eye. This is the fixed set to tune against: timed
 * paragraphs across the scale, each with the band an educator would accept
 * for every category. Run it live (`bun scripts/run-daily-pages-calibration.ts`)
 * after any change to the rubric or its instructions, and before switching on
 * a new paragraph type.
 *
 * The bands carry the decisions made for this assignment type:
 *
 * - Effort alone lands below a passing composite (`effort-only`).
 * - A strong paragraph of any kind can reach the top, and does not have to
 *   open with a claim (`strong`, `no-single-form`).
 * - Grammar is held to the AP standard for timed writing: scattered slips keep
 *   the top bands, errors that distract from meaning do not
 *   (`ap-grammar-slips`, `ap-grammar-distracting`).
 * - Unedited prose stays at or below Proficient on Voice/Style (`unedited`).
 *
 * Every case is synthetic and starts as a draft; a release run needs product
 * and educator approval on each, as the core benchmark does.
 */

const WRITING_TIME_MINUTES = 15;

const evaluations: GradingEvaluationDefinition[] = [
  {
    id: 'response-contract',
    title: 'Response contract',
    description:
      'Returns every rubric key exactly once with in-range integer scores, comments, and personalized overall feedback.',
    method: 'code',
    blocking: true,
  },
  {
    id: 'score-calibration',
    title: 'Score calibration',
    description:
      'Keeps each rubric score inside the educator-approved band for the case.',
    method: 'code',
    blocking: true,
  },
  {
    id: 'feedback-grounding',
    title: 'Feedback grounding',
    description:
      'Bases praise and criticism on what is actually in the paragraph.',
    method: 'human_or_llm_judge',
    blocking: true,
  },
  {
    id: 'rubric-alignment',
    title: 'Rubric alignment',
    description:
      'Keeps each comment in its category and judges the paragraph against the kind of paragraph the prompt asks for.',
    method: 'human_or_llm_judge',
    blocking: true,
  },
  {
    id: 'priority-selection',
    title: 'Priority selection',
    description:
      'Names the one change that would move the paragraph up, rather than listing every weakness.',
    method: 'human_or_llm_judge',
    blocking: true,
  },
  {
    id: 'false-positive-resistance',
    title: 'False-positive resistance',
    description:
      'Does not invent problems the paragraph does not have, or treat a timed piece as if it had been revised.',
    method: 'human_or_llm_judge',
    blocking: true,
  },
];

type Band = [number, number];
type ScoreBands = GradingBenchmarkCase['expectations']['scoreBands'];

function scoreBands(
  depth: Band,
  development: Band,
  organization: Band,
  voice: Band,
  grammar: Band
): ScoreBands {
  const bands = [depth, development, organization, voice, grammar];
  return Object.fromEntries(
    DAILY_PAGES_SHORT_FORM_CATEGORY_KEYS.map((key, index) => [
      key,
      { min: bands[index][0], max: bands[index][1] },
    ])
  );
}

function draftApproval(): BenchmarkCaseApproval {
  return {
    status: 'draft',
    requiredRoles: ['product', 'educator'],
    approvals: [],
  };
}

function calibrationCase({
  id,
  title,
  description,
  tags,
  assignmentPrompt,
  essayText,
  bands,
  qualitative,
}: {
  id: string;
  title: string;
  description: string;
  tags: string[];
  assignmentPrompt: string;
  essayText: string;
  bands: ScoreBands;
  qualitative: Array<{ evaluatorId: string; requirement: string }>;
}): GradingBenchmarkCase {
  return {
    id,
    title,
    description,
    tags,
    input: {
      studentFirstName: 'Jordan',
      essayText,
      strictness: 'intermediate',
      assignmentPrompt,
      writingTimeMinutes: WRITING_TIME_MINUTES,
    },
    expectations: {
      scoreBands: bands,
      qualitative: qualitative.map((item) => ({
        id: `${id}-${item.evaluatorId}`,
        ...item,
      })),
    },
    provenance: {
      kind: 'synthetic',
      source: 'Daily Pages calibration v1',
      notes:
        'Authored to calibrate Daily Pages grading strictness; contains no student names or production student content.',
    },
    approval: draftApproval(),
  };
}

const cases: GradingBenchmarkCase[] = [
  calibrationCase({
    id: 'dp-strong-analysis-scattered-slips',
    title: 'Strong analysis with two slips',
    description:
      'A strong timed analysis with two spelling/usage slips. Holds grammar to the AP standard: occasional errors that never distract from meaning keep the top bands.',
    tags: ['strong', 'analyze', 'ap-grammar-slips'],
    assignmentPrompt:
      "Reread the opening pages of The Great Gatsby. What is Nick refusing to say outright about Gatsby? Quote the words that give it away, and explain what they are doing. One paragraph.",
    essayText: `Nick never admits that he envies Gatsby, but his words give him away. He praises Gatsby's "extraordinary gift for hope" and "romantic readiness," then blames everything on "what preyed on Gatsby," as if the dream were an animal that hunted him rather than something he chose. That verb lets Nick admire the dream without having to want it. Its a way of keeping his distance: the more Nick insists that Gatsby was a victim of his own wonder, the less he has to admit that he wishes he could beleive in anything that much himself.`,
    bands: scoreBands([4, 5], [4, 5], [4, 5], [4, 5], [4, 5]),
    qualitative: [
      {
        evaluatorId: 'false-positive-resistance',
        requirement:
          'Mark the two slips ("Its", "beleive") without treating them as a reason to lower grammar below 4; they never distract from meaning.',
      },
      {
        evaluatorId: 'feedback-grounding',
        requirement:
          'Credit the analysis of "preyed on" specifically, not analysis in general.',
      },
    ],
  }),
  calibrationCase({
    id: 'dp-real-point-distracting-errors',
    title: 'A real point under errors that distract from meaning',
    description:
      'A defensible judgment with apt evidence, buried under errors frequent enough that the reader has to work to get the meaning.',
    tags: ['evaluate', 'ap-grammar-distracting'],
    assignmentPrompt:
      "Judge Friar Laurence's plan with the potion. Name the standard you are judging him by, then point to the moment in the play that most supports your verdict. One paragraph.",
    essayText: `Friar Laurence plan was reckless because he trust a messenger with the only thing that could of saved them when the letter dont reach romeo the hole plan fall apart and the friar should of know that. a plague in mantua already close the roads. He judge by what is quick not what is safe his own words "wisely and slow they stumble that run fast" shows he knew better he just didnt do it`,
    bands: scoreBands([3, 4], [3, 4], [2, 3], [2, 3], [1, 2]),
    qualitative: [
      {
        evaluatorId: 'rubric-alignment',
        requirement:
          'Credit the standard (safe over quick) and the use of "Wisely and slow" in the thinking categories, while keeping the errors in Grammar/Syntax/Mechanics.',
      },
      {
        evaluatorId: 'priority-selection',
        requirement:
          'Make sentence boundaries (run-ons and missing periods) the grammar priority, since they are what obscure the meaning.',
      },
    ],
  }),
  calibrationCase({
    id: 'dp-effort-only-retelling',
    title: 'Plot retelling with no point',
    description:
      'Accurate, readable retelling that never analyzes the quotation it was asked about. The case that was graded too leniently.',
    tags: ['effort-only', 'analyze'],
    assignmentPrompt:
      "Quote Mercutio's curse, \"A plague o' both your houses,\" and explain why it matters that the curse comes from a character who belongs to neither house. One paragraph.",
    essayText: `In Act 3 Mercutio and Tybalt fight. Romeo tries to stop them and steps in between them. Tybalt stabs Mercutio under Romeo's arm. Mercutio says "A plague o' both your houses" a few times before he dies. Then Romeo gets angry and fights Tybalt and kills him. After that Romeo is banished by the Prince. This scene is important because a lot happens in it and it changes the story.`,
    bands: scoreBands([1, 2], [1, 2], [2, 3], [2, 3], [4, 5]),
    qualitative: [
      {
        evaluatorId: 'rubric-alignment',
        requirement:
          'Treat retelling as recall, not analysis: do not credit Depth or Development for accurate plot summary.',
      },
      {
        evaluatorId: 'priority-selection',
        requirement:
          'Make the next step explaining why the curse matters coming from someone in neither house.',
      },
    ],
  }),
  calibrationCase({
    id: 'dp-restated-prompt',
    title: 'The prompt restated as a paragraph',
    description:
      'Clean sentences that restate the prompt and announce a paragraph that never arrives.',
    tags: ['effort-only', 'argue-a-position'],
    assignmentPrompt:
      'Some rules are worth breaking. Defend or reject that claim, and ground it in one specific situation rather than in general terms. One paragraph.',
    essayText: `Some rules are worth breaking. This is a claim that some people would defend and some people would reject. In my paragraph I am going to talk about whether some rules are worth breaking. There are many different rules in the world, and some of them are worth breaking and some are not. It depends on the situation.`,
    bands: scoreBands([1, 2], [1, 1], [1, 2], [2, 3], [4, 5]),
    qualitative: [
      {
        evaluatorId: 'feedback-grounding',
        requirement:
          'Say plainly that the paragraph restates the prompt and names no specific situation.',
      },
    ],
  }),
  calibrationCase({
    id: 'dp-polished-empty',
    title: 'Polished and empty',
    description:
      'Well-ordered, correct prose that defines nothing. Craft must not compensate for thinking.',
    tags: ['effort-only', 'define-a-term'],
    assignmentPrompt:
      'What is the difference between a mistake and a failure? Define both, then give one example that could plausibly be either, and say which it is. One paragraph.',
    essayText: `Mistakes and failures are both important parts of life. Everyone makes mistakes, and everyone experiences failure at some point. Both can teach us valuable lessons if we are willing to learn from them. In the end, what matters most is how we respond to the challenges we face, because our response shapes who we become.`,
    bands: scoreBands([1, 2], [1, 2], [2, 3], [3, 3], [4, 5]),
    qualitative: [
      {
        evaluatorId: 'rubric-alignment',
        requirement:
          'Do not let clean prose raise Depth or Development: the paragraph never distinguishes the two terms and gives no example.',
      },
    ],
  }),
  calibrationCase({
    id: 'dp-hedged-unedited',
    title: 'Good idea, unedited prose',
    description:
      'A real point with personal evidence, wrapped in hedges and process narration. Holds Voice/Style at or below Proficient.',
    tags: ['unedited', 'argue-a-position'],
    assignmentPrompt:
      'Is it possible to be fully honest and fully kind at the same time? One paragraph: your claim, your reason, and one case that tests it.',
    essayText: `I think that in my opinion it is possible to be fully honest and fully kind, but I'm not totally sure. What I thought at first was that you'd have to pick one. But I feel like when my grandmother told me my science project was "not my best work, but the idea underneath it is really good," she was being honest and kind at the same time, because she told me the truth and she also showed me what to keep. So I think that honesty only turns unkind when it's aimed at the person instead of at the work, and that is kind of the main thing I'd say.`,
    bands: scoreBands([3, 4], [3, 4], [2, 3], [2, 3], [4, 5]),
    qualitative: [
      {
        evaluatorId: 'false-positive-resistance',
        requirement:
          'Do not treat first person as an error; the grandmother example is first person doing work.',
      },
      {
        evaluatorId: 'priority-selection',
        requirement:
          'Coach the cut: hand back the final claim with the hedges removed ("Honesty turns unkind only when it is aimed at the person instead of the work").',
      },
    ],
  }),
  calibrationCase({
    id: 'dp-quotes-without-analysis',
    title: 'Quotations dropped in without analysis',
    description:
      'Three accurate quotations and a conclusion that restates the prompt. Quoting is not analyzing.',
    tags: ['analyze'],
    assignmentPrompt:
      'Romeo keeps describing Juliet in terms of light. Pick one of those images, quote it, and explain what it shows about how Romeo sees her — not just that he loves her. One paragraph.',
    essayText: `Romeo describes Juliet with light. He says "But soft, what light through yonder window breaks? It is the east, and Juliet is the sun." He also says "O, she doth teach the torches to burn bright!" And he says her eyes are like stars. These quotes show that Romeo thinks of Juliet as light.`,
    bands: scoreBands([1, 2], [1, 2], [2, 3], [2, 3], [4, 5]),
    qualitative: [
      {
        evaluatorId: 'rubric-alignment',
        requirement:
          'Distinguish including quotations from explaining what one of them shows about how Romeo sees Juliet.',
      },
      {
        evaluatorId: 'priority-selection',
        requirement:
          'Make choosing one image and explaining it the next step, rather than adding more quotations.',
      },
    ],
  }),
  calibrationCase({
    id: 'dp-definition-opens-on-a-case',
    title: 'Definition that opens on a case, not a claim',
    description:
      'A strong definition paragraph whose point arrives in its third sentence, after the case that sets it up. There is no single required form.',
    tags: ['strong', 'define-a-term', 'no-single-form'],
    assignmentPrompt:
      'Define the difference between love and infatuation as Romeo and Juliet shows it. Then test your definition against one specific moment in the play, and quote it. One paragraph.',
    essayText: `At the start of the play Romeo cannot eat or sleep over Rosaline, a woman who never appears on stage. A day later he has forgotten her. That is infatuation as the play defines it: a feeling about the lover's own suffering, which could attach to anyone. Love is aimed at one particular person and costs the lover something. The test is the balcony scene, where Juliet says, "My bounty is as boundless as the sea, / My love as deep; the more I give to thee, / The more I have." She is describing not her own pain but what she is willing to give, and giving is the line the Rosaline scenes never cross.`,
    bands: scoreBands([4, 5], [4, 5], [4, 5], [4, 5], [4, 5]),
    qualitative: [
      {
        evaluatorId: 'rubric-alignment',
        requirement:
          'Do not mark Organization/Structure down for opening on the Rosaline case; the definition is easy to find and the order builds it.',
      },
    ],
  }),
  calibrationCase({
    id: 'dp-comparison-one-difference',
    title: 'Comparison narrowed to one difference',
    description:
      'A strong comparison paragraph that names one difference, grounds it in a quotation, and says why it matters.',
    tags: ['strong', 'compare'],
    assignmentPrompt:
      'Two characters want the same thing for different reasons. Name the difference in reason, and say which one the play takes more seriously, using one specific moment. One paragraph.',
    essayText: `Romeo and Paris both want to marry Juliet, but only Paris wants her for what comes with her. Paris goes to Capulet first, not to Juliet; he negotiates the match with her father, and when he finally speaks to her he talks as if the wedding were already settled: "Happily met, my lady and my wife!" Romeo goes to Juliet and no one else, and the marriage he wants makes him an enemy of her family rather than an ally. The play takes Romeo's reason more seriously, but it kills both men for wanting her, which is the point: the feud does not care about motives.`,
    bands: scoreBands([4, 5], [4, 5], [4, 5], [4, 5], [4, 5]),
    qualitative: [
      {
        evaluatorId: 'feedback-grounding',
        requirement:
          'Credit the use of "Happily met, my lady and my wife!" as evidence of Paris treating the match as settled.',
      },
    ],
  }),
  calibrationCase({
    id: 'dp-short-and-excellent',
    title: 'Three sentences, all of them working',
    description:
      'A very short paragraph that does everything asked. Length must not lower the score.',
    tags: ['strong', 'analyze', 'length'],
    assignmentPrompt:
      'The Prologue tells us how the play ends before it begins. Quote one phrase from it, and explain how knowing the ending changes the way you read one scene we have read since. One paragraph.',
    essayText: `The Prologue's phrase "star-crossed lovers" turns every lucky accident in the play into a trap. When Romeo happens to meet the Capulet servant who cannot read the guest list, a first-time reader sees chance; a reader who knows the ending sees the stars closing in. Knowing the ending does not spoil the scene — it makes the coincidence the most frightening thing in it.`,
    bands: scoreBands([4, 5], [4, 5], [4, 5], [4, 5], [4, 5]),
    qualitative: [
      {
        evaluatorId: 'false-positive-resistance',
        requirement:
          'Do not ask for more length or more examples; three sentences answer the prompt fully.',
      },
    ],
  }),
  calibrationCase({
    id: 'dp-deliberate-fragments',
    title: 'Deliberate fragments for emphasis',
    description:
      'A strong close reading that uses two fragments on purpose. Timed-writing grammar must not mark deliberate fragments as errors.',
    tags: ['strong', 'analyze', 'ap-grammar-slips'],
    assignmentPrompt:
      'Choose one word in the passage the author could easily have replaced. Name a replacement, and say precisely what would be lost. One paragraph.',
    essayText: `Shakespeare could have written "Out, out, short candle." He wrote "brief." "Short" would describe the candle, an object on a table. "Brief" is a word for time, so the candle stops being a thing and becomes a stretch of time running out, which is exactly what Macbeth has decided a life is. Not the candle. The life. Swap the word and Macbeth is talking about wax; keep it and he is talking about himself.`,
    bands: scoreBands([4, 5], [4, 5], [4, 5], [4, 5], [4, 5]),
    qualitative: [
      {
        evaluatorId: 'false-positive-resistance',
        requirement:
          'Do not treat "Not the candle. The life." as a grammar error; it is a deliberate fragment for emphasis.',
      },
    ],
  }),
];

export const dailyPagesCalibrationV1: GradingBenchmarkSuite = {
  id: 'daily-pages-calibration-v1',
  title: 'Daily Pages Calibration v1',
  version: 1,
  description:
    'Timed Daily Pages paragraphs across the scale, with educator bands, for calibrating grading strictness.',
  rubric: {
    categoryKeys: [...DAILY_PAGES_SHORT_FORM_CATEGORY_KEYS],
    minScore: 1,
    maxScore: 5,
  },
  evaluations,
  cases,
};
