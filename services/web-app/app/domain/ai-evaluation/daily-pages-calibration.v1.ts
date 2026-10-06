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
 * - Under Argue a position, a straddle stays low on Depth of Thought
 *   (`argue-straddle`), and reasons never tested against a specific case stay
 *   low on Development of Thought (`argue-untested`).
 * - Define a term, Interpret, Evaluate and Synthesize each have a strong
 *   paragraph and the two ways the type most often goes wrong: a dictionary
 *   definition and a boundary tested only by easy cases
 *   (`define-dictionary`, `define-untested`); a paraphrase and a reading with
 *   none of the passage's words (`interpret-paraphrase`,
 *   `interpret-unsupported`); a verdict with no standard and a standard never
 *   measured against (`evaluate-no-standard`, `evaluate-unapplied`); two
 *   summaries and a second source that only decorates
 *   (`synthesize-summaries`, `synthesize-one-source`). The first of each pair
 *   stays low on Depth of Thought, the second on Development of Thought.
 *
 * A case that names a `paragraphMode` is graded with that type's guidance in
 * the prompt, as an assignment with that type would be. Cases without one are
 * graded with no type chosen.
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
  paragraphMode,
}: {
  id: string;
  title: string;
  description: string;
  tags: string[];
  assignmentPrompt: string;
  essayText: string;
  bands: ScoreBands;
  qualitative: Array<{ evaluatorId: string; requirement: string }>;
  paragraphMode?: string;
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
      ...(paragraphMode ? { paragraphMode } : {}),
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
  calibrationCase({
    id: 'dp-argue-tested-against-hard-case',
    title: 'Argued position narrowed by the case that tests it',
    description:
      'A strong argued paragraph that faces the hard case for its own position and comes out with a narrower, stronger one.',
    tags: ['strong', 'argue-a-position'],
    paragraphMode: 'argue',
    assignmentPrompt:
      'Should phones be banned during the school day? Take a position, give your strongest reason, and test it against one specific situation where your position might fail. One paragraph.',
    essayText: `Phones should be locked away during class, but not for the whole school day. The strongest reason to take them is attention: a phone face-down on a desk still pulls at a student every time it buzzes, so the only phone that stops interrupting a lesson is one that is out of reach. The hard case is lunch, where nobody is being taught and a ban looks like control for its own sake. That case is why the line belongs at the classroom door rather than the school gate. A rule meant to protect attention has no reason to follow students into the cafeteria, and a rule that does follow them there stops being about learning and starts being about obedience, which students can tell.`,
    bands: scoreBands([4, 5], [4, 5], [4, 5], [4, 5], [4, 5]),
    qualitative: [
      {
        evaluatorId: 'rubric-alignment',
        requirement:
          'Credit narrowing the position to the classroom as the result of the test, not as a retreat from the position.',
      },
      {
        evaluatorId: 'feedback-grounding',
        requirement:
          'Name the lunch case specifically as the test the position survives.',
      },
    ],
  }),
  calibrationCase({
    id: 'dp-argue-both-sides',
    title: 'Both sides, no position',
    description:
      'Clean, fair-minded prose that lays out both sides and never chooses. Even-handedness is not a position.',
    tags: ['argue-straddle', 'argue-a-position'],
    paragraphMode: 'argue',
    assignmentPrompt:
      "Was Romeo's banishment a just punishment for killing Tybalt? Take a position, give your strongest reason, and test it against one moment in the play. One paragraph.",
    essayText: `There are good arguments on both sides of whether Romeo's banishment was just. On one hand, Romeo killed Tybalt, and killing someone is a serious crime that deserves punishment. The Prince had already warned that anyone who fought in the streets again would pay with their life. On the other hand, Tybalt had just killed Mercutio, so Romeo was acting out of grief and anger, and Tybalt started the fight. Some people would say the banishment was too harsh and others would say it was too lenient. In the end it depends on how you look at it, and both sides have a point.`,
    bands: scoreBands([1, 2], [2, 3], [2, 3], [2, 3], [4, 5]),
    qualitative: [
      {
        evaluatorId: 'rubric-alignment',
        requirement:
          'Do not credit even-handedness as Depth of Thought: the paragraph never says whether the banishment was just.',
      },
      {
        evaluatorId: 'priority-selection',
        requirement:
          "Make choosing a side the next step, and point to the Prince's earlier warning as the moment to test that choice against.",
      },
    ],
  }),
  calibrationCase({
    id: 'dp-argue-untested-generalities',
    title: 'A position held up only by generalities',
    description:
      'A real, arguable position with several general reasons and no specific case. The reasons are listed, never tested.',
    tags: ['argue-untested', 'argue-a-position'],
    paragraphMode: 'argue',
    assignmentPrompt:
      'Is it ever right to break a promise? Take a position, give your strongest reason, and test it against one specific situation. One paragraph.',
    essayText: `It is sometimes right to break a promise. Promises are important because they build trust, but people change and situations change. Sometimes keeping a promise could hurt someone, and in that situation breaking it is the better choice. Also, people sometimes make promises without thinking them through. Society expects people to keep their word, but society also expects people to do the right thing, and those are not always the same. So breaking a promise can be right when it prevents something worse.`,
    bands: scoreBands([2, 3], [1, 2], [2, 3], [2, 3], [4, 5]),
    qualitative: [
      {
        evaluatorId: 'rubric-alignment',
        requirement:
          'Do not credit the list of general reasons as development; none of them is tested against a specific situation.',
      },
      {
        evaluatorId: 'priority-selection',
        requirement:
          'Make one specific situation the next step (a single promise, and what keeping it would cost) rather than adding more reasons.',
      },
    ],
  }),
  calibrationCase({
    id: 'dp-argue-loyalty-with-a-condition',
    title: 'Loyalty argued with a condition, a hard case and a concession',
    description:
      'A top Argue paragraph: a position with its condition stated, one concrete reason, a hard case faced head on, and the concession the prompt asks for, ending on the narrower position the case produced.',
    tags: ['strong', 'argue-a-position'],
    paragraphMode: 'argue',
    assignmentPrompt:
      'Is loyalty a virtue or a liability? Commit to one, support it with a specific case, and concede the strongest thing the other side gets right.',
    essayText: `Loyalty is a virtue, but only when it is loyalty to a person rather than to what that person has done. The strongest reason is that loyalty is what makes it safe to fail in front of someone: my teammates can miss a shot in practice because they know I will still pass them the ball in the game. The hard case is a friend who cheats. When Marcus copied a lab report last year and asked me to say we had worked together, loyalty seemed to mean covering for him. That is where the other side is right — loyalty that defends whatever a friend does is a liability, because it turns caring about someone into lying for them. But I didn't cover for him, and I didn't report him either; I told him I wouldn't lie and that I would help him redo it. That was the loyal thing, because it was loyal to Marcus and not to the cheating. Loyalty stays a virtue as long as it can say no.`,
    bands: scoreBands([4, 5], [4, 5], [4, 5], [4, 5], [4, 5]),
    qualitative: [
      {
        evaluatorId: 'rubric-alignment',
        requirement:
          'Credit the stated condition ("only when it is loyalty to a person rather than to what that person has done") in Depth of Thought, and the Marcus case as the test the position survives in Development of Thought.',
      },
      {
        evaluatorId: 'false-positive-resistance',
        requirement:
          'Do not treat the concession as weakening the position; the prompt asks for it, and the paragraph keeps its side.',
      },
    ],
  }),
  calibrationCase({
    id: 'dp-argue-rules-tested-against-itself',
    title: 'A rule-breaking position tested against its own misuse',
    description:
      'A top Argue paragraph that narrows an easy claim to a precise one, grounds it in one situation, then tests it against the obvious abuse of its own logic and draws the line between them.',
    tags: ['strong', 'argue-a-position'],
    paragraphMode: 'argue',
    assignmentPrompt:
      'Some rules are worth breaking. Defend or reject that claim, and ground it in one specific situation rather than in general.',
    essayText: `A rule is worth breaking only when following it would defeat the reason the rule exists. Our library has a strict no-food rule, and the reason is obvious: food draws bugs and ruins books. But last spring a diabetic student in my study hall felt her blood sugar dropping during a timed test, and the librarian told her to put her juice box away. Following the rule there protected the books from a juice box while putting a person at risk, which is the opposite of what any school rule is for. The test of my position is whether it lets anyone break any rule they find inconvenient, and it doesn't: the student who wants chips during free period has a reason that is about himself, not about what the rule is protecting. So the rule should bend for the juice box and hold for the chips, and the line between them is whether breaking it serves the rule's purpose better than keeping it.`,
    bands: scoreBands([4, 5], [4, 5], [4, 5], [4, 5], [4, 5]),
    qualitative: [
      {
        evaluatorId: 'rubric-alignment',
        requirement:
          'Credit narrowing "some rules are worth breaking" to a precise condition in Depth of Thought, and the chips case as a genuine test of the position rather than another reason.',
      },
      {
        evaluatorId: 'feedback-grounding',
        requirement:
          'Name the juice-box situation and the chips contrast specifically when crediting the paragraph.',
      },
    ],
  }),
  calibrationCase({
    id: 'dp-define-mistake-or-failure',
    title: 'A boundary that a hard case moves',
    description:
      'A strong definition paragraph: a boundary that separates the term from its nearest neighbor, a clear example, and a hard case that sharpens where the line sits.',
    tags: ['strong', 'define-a-term'],
    paragraphMode: 'define',
    assignmentPrompt:
      'What is the difference between a mistake and a failure? Define both, then give one example that could plausibly be either and say which it is.',
    essayText: `A mistake is a wrong move; a failure is a wrong move you refuse to learn from. The difference is not in what happens but in what comes after. Misspelling "necessary" on a spelling test is a mistake: one wrong answer, fixed the moment you see the red mark. The hard case is a student who fails the same chemistry test twice. It looks like failure, and the grade even says so, but if the second attempt went wrong in a different place than the first, she learned something between them, and by my line that is two mistakes, not a failure. It only becomes a failure if she misses the same problem the same way a third time. That case is why the line has to sit after the event and not inside it: you can't tell a mistake from a failure by looking at the grade, only by looking at what the person did next.`,
    bands: scoreBands([4, 5], [4, 5], [4, 5], [4, 5], [4, 5]),
    qualitative: [
      {
        evaluatorId: 'rubric-alignment',
        requirement:
          'Credit the chemistry test as a hard case that sharpens the boundary (the line sits after the event), not as a second example.',
      },
      {
        evaluatorId: 'feedback-grounding',
        requirement:
          'Name the boundary the paragraph draws ("a wrong move you refuse to learn from") when crediting Depth of Thought.',
      },
    ],
  }),
  calibrationCase({
    id: 'dp-define-dictionary-definitions',
    title: 'Dictionary definitions, no line drawn',
    description:
      'Two accurate dictionary definitions and easy examples. Nothing separates the terms, and no case tests the line the prompt asks for.',
    tags: ['define-dictionary', 'define-a-term'],
    paragraphMode: 'define',
    assignmentPrompt:
      'What separates a friend from an ally? Give the distinction in a sentence, then test it with one case that sits right on the line.',
    essayText: `A friend is a person that you know well and like, and who likes you back. An ally is a person who supports you or helps you, especially in a fight or a conflict. Friends and allies are both important to have in life. For example, my best friend is someone I can talk to about anything. An ally could be a country that helps another country in a war. Both friends and allies are people who are on your side, but a friend is more personal. Everyone needs friends and allies.`,
    bands: scoreBands([1, 2], [1, 2], [2, 3], [2, 3], [4, 5]),
    qualitative: [
      {
        evaluatorId: 'rubric-alignment',
        requirement:
          'Do not credit accurate dictionary definitions as a boundary in Depth of Thought; "a friend is more personal" never says what an ally lacks.',
      },
      {
        evaluatorId: 'priority-selection',
        requirement:
          'Make the one-sentence distinction the next step, then a case on the line, rather than better examples of each term.',
      },
    ],
  }),
  calibrationCase({
    id: 'dp-define-only-easy-cases',
    title: 'A real boundary, tested only by easy cases',
    description:
      'A boundary worth drawing, then three examples that all sit comfortably inside it. The definition is illustrated, never tested.',
    tags: ['define-untested', 'define-a-term'],
    paragraphMode: 'define',
    assignmentPrompt:
      'What makes someone a hero rather than just a good person? Draw the line in a sentence, then test it against one case that sits close to it. One paragraph.',
    essayText: `A hero is someone who puts themselves at real risk to help another person, which is what separates a hero from someone who is simply kind. A firefighter who runs into a burning building to carry out a child is a hero, because she could die doing it. A soldier who throws himself on a grenade to save his unit is a hero for the same reason. A lifeguard who swims out in a storm to pull in a drowning swimmer is a hero too. In all of these cases the person risked their own life, and that is what makes them a hero and not just a good person.`,
    bands: scoreBands([2, 3], [1, 2], [2, 3], [2, 3], [4, 5]),
    qualitative: [
      {
        evaluatorId: 'rubric-alignment',
        requirement:
          'Credit the boundary (risk to oneself) in Depth of Thought, but do not credit three easy examples as development; none sits near the line.',
      },
      {
        evaluatorId: 'priority-selection',
        requirement:
          'Make one hard case the next step (someone who helps at a cost that is not physical risk, say) rather than more examples.',
      },
    ],
  }),
  calibrationCase({
    id: 'dp-interpret-mercutio-houses',
    title: 'A reading defended against the obvious one',
    description:
      'A strong interpretation: a reading another reader could dispute, the exact word that supports it, and a defense against the plainer reading.',
    tags: ['strong', 'interpret'],
    paragraphMode: 'interpret',
    assignmentPrompt:
      'Quote Mercutio\'s curse, "A plague o\' both your houses," and explain why it matters that the curse comes from a character who belongs to neither house. One paragraph.',
    essayText: `Mercutio's curse turns the feud from a private quarrel into a public crime. He is the Prince's kinsman, a Montague only by friendship, and he dies anyway: "A plague o' both your houses! / They have made worms' meat of me." The obvious reading is that he is lashing out at the two men in front of him, and he does blame Romeo: "Why the devil came you between us?" But the curse he keeps repeating is aimed at "houses," not at men, and that word makes the families, not Tybalt and Romeo, answerable for his death. Because he belongs to neither house, his death is the first proof that the feud kills people who never chose a side, and his curse names who owes for it. The rest of the play collects.`,
    bands: scoreBands([4, 5], [4, 5], [4, 5], [4, 5], [4, 5]),
    qualitative: [
      {
        evaluatorId: 'rubric-alignment',
        requirement:
          'Credit the turn on "houses" as the defense of the reading against the obvious one (that Mercutio is angry at Romeo and Tybalt).',
      },
      {
        evaluatorId: 'false-positive-resistance',
        requirement:
          'Do not treat "The rest of the play collects." as an unsupported leap or a fragment; it is a deliberate close that follows from the reading.',
      },
    ],
  }),
  calibrationCase({
    id: 'dp-interpret-paraphrase',
    title: 'Paraphrase offered as a reading',
    description:
      'The passage restated in plain words, then a theme that would fit any love story. Accurate, and not an interpretation.',
    tags: ['interpret-paraphrase', 'interpret'],
    paragraphMode: 'interpret',
    assignmentPrompt:
      'Juliet says, "What\'s in a name? That which we call a rose / By any other word would smell as sweet." What does she mean by it, beyond what she says? Defend your reading from her words. One paragraph.',
    essayText: `In this passage Juliet says, "What's in a name? That which we call a rose / By any other word would smell as sweet." She means that if you called a rose by a different name, it would still smell the same. In the same way, Romeo would still be Romeo even if he wasn't called Montague. This shows that names don't really matter and that what matters is who a person is on the inside. Shakespeare is showing that love is more important than family names.`,
    bands: scoreBands([1, 2], [2, 3], [2, 3], [2, 3], [4, 5]),
    qualitative: [
      {
        evaluatorId: 'rubric-alignment',
        requirement:
          'Do not credit the paraphrase of the rose lines as a reading in Depth of Thought; it restates what Juliet says, and the prompt asks for what she means beyond it.',
      },
      {
        evaluatorId: 'priority-selection',
        requirement:
          'Make a reading the next step: what Juliet means that her words do not say, rather than more summary of the scene.',
      },
    ],
  }),
  calibrationCase({
    id: 'dp-interpret-green-light-unsupported',
    title: 'A reading with none of the passage\'s words',
    description:
      'A familiar reading of the green light, held up by history and the color of money rather than by the passage the prompt names.',
    tags: ['interpret-unsupported', 'interpret'],
    paragraphMode: 'interpret',
    assignmentPrompt:
      'At the end of chapter 1 of The Great Gatsby, Nick sees Gatsby stretch his arms toward "a single green light, minute and far away." What does the green light mean? Defend your reading from the words of the passage. One paragraph.',
    essayText: `The green light stands for money. Green is the color of money, and Gatsby has spent his whole life trying to become rich so that he can be accepted by people like Daisy. The light is far away because money can never really make you happy, which is something the 1920s had to learn the hard way when the stock market crashed. In this way the green light represents the American Dream, which Fitzgerald believed was corrupted by greed. Gatsby reaching for it shows that everyone in America was reaching for wealth.`,
    bands: scoreBands([2, 3], [1, 2], [2, 3], [2, 3], [4, 5]),
    qualitative: [
      {
        evaluatorId: 'rubric-alignment',
        requirement:
          'Do not credit the color of money or the stock market crash as evidence; the paragraph quotes none of the passage it was asked to defend its reading from.',
      },
      {
        evaluatorId: 'priority-selection',
        requirement:
          'Make the passage\'s own words the next step ("minute and far away", or Gatsby\'s outstretched arms) rather than more history.',
      },
    ],
  }),
  calibrationCase({
    id: 'dp-evaluate-friar-by-his-own-rule',
    title: 'A plan judged by the standard its maker set',
    description:
      'A strong evaluation: a verdict, a named and justified standard, the strongest defense of the other side, and the moment in the play measured against the standard.',
    tags: ['strong', 'evaluate'],
    paragraphMode: 'evaluate',
    assignmentPrompt:
      "Judge Friar Laurence's plan with the potion. Name the standard you are judging him by, then point to the moment in the play that most supports your verdict. One paragraph.",
    essayText: `Friar Laurence's plan fails by the one standard he taught Romeo himself: "Wisely and slow. They stumble that run fast." A plan made by the only adult the lovers trust should be judged by whether it can survive one thing going wrong, and his cannot. Everything rests on a single letter reaching Romeo in Mantua before Juliet wakes, and when Friar John is shut in a house the town fears is infected, there is no second messenger and no second plan. The Friar's defense is that he had hours, not weeks, to stop a forced marriage, and that is real. But speed is exactly what his own rule warns against, and the moment that most supports the verdict is his last in the tomb: "I dare no longer stay." A plan that leaves a thirteen-year-old alone with her dead husband when it breaks was never wise.`,
    bands: scoreBands([4, 5], [4, 5], [4, 5], [4, 5], [4, 5]),
    qualitative: [
      {
        evaluatorId: 'rubric-alignment',
        requirement:
          'Credit the named standard (whether the plan survives one thing going wrong) in Depth of Thought, and the tomb line as the case measured against it in Development of Thought.',
      },
      {
        evaluatorId: 'false-positive-resistance',
        requirement:
          'Do not treat the concession about the Friar\'s lack of time as weakening the verdict; it is weighed and answered.',
      },
    ],
  }),
  calibrationCase({
    id: 'dp-evaluate-no-standard',
    title: 'A verdict with no standard',
    description:
      'A confident, pleasant verdict built on personal preference. Nothing names what the decision is being measured against.',
    tags: ['evaluate-no-standard', 'evaluate'],
    paragraphMode: 'evaluate',
    assignmentPrompt:
      'Our school moved the start of the day from 7:45 to 8:30 this year. Judge the decision. Name the standard you are judging by, then measure the decision against it. One paragraph.',
    essayText: `Moving the start of school to 8:30 was a great decision. I used to have to wake up at 6:15, and now I can sleep until 7, which is so much better. Everyone in my classes seems happier in the morning too. Some people complain that school gets out later now, but I think that is a small price to pay. It was definitely the right call and I hope they never change it back.`,
    bands: scoreBands([1, 2], [2, 3], [2, 3], [2, 3], [4, 5]),
    qualitative: [
      {
        evaluatorId: 'rubric-alignment',
        requirement:
          'Do not credit the verdict as an evaluation in Depth of Thought: the paragraph never names the standard the prompt asks for.',
      },
      {
        evaluatorId: 'priority-selection',
        requirement:
          'Make naming one standard the next step (what a start time should be judged by), rather than more reasons to like the change.',
      },
    ],
  }),
  calibrationCase({
    id: 'dp-evaluate-standard-never-applied',
    title: 'A standard named, then never measured against',
    description:
      'A clear standard in the first sentence, then generalities and a switch to a second standard. No specific consequence is ever held up to the first.',
    tags: ['evaluate-unapplied', 'evaluate'],
    paragraphMode: 'evaluate',
    assignmentPrompt:
      'Next year our school will require uniforms. Judge the decision. Name the standard you judge it by, and measure the decision against one specific consequence. One paragraph.',
    essayText: `The uniform rule is a bad decision, because a school rule should be judged by whether it helps students learn. Uniforms do not help students learn. Learning comes from good teachers and hard work, not from what you are wearing. Also, students should have the freedom to express themselves, and taking away their clothes takes away part of who they are. Many people believe uniforms reduce bullying, but bullying will happen no matter what. Overall, uniforms do not meet the standard and should not be required.`,
    bands: scoreBands([2, 3], [1, 2], [2, 3], [2, 3], [4, 5]),
    qualitative: [
      {
        evaluatorId: 'rubric-alignment',
        requirement:
          'Credit the named standard in Depth of Thought, but do not credit "uniforms do not help students learn" as measuring the decision against it; no specific consequence is examined, and the freedom argument is a second standard.',
      },
      {
        evaluatorId: 'priority-selection',
        requirement:
          'Make one specific consequence of the rule, held up to the learning standard, the next step.',
      },
    ],
  }),
  calibrationCase({
    id: 'dp-synthesize-sleep-as-trade',
    title: 'Two sources that become one point',
    description:
      'A strong synthesis: a point only the two sources together make, one specific contribution from each, and the connection that turns them into a trade.',
    tags: ['strong', 'synthesize'],
    paragraphMode: 'synthesize',
    assignmentPrompt:
      'Source A, a survey of 500 high school students: those who slept fewer than seven hours on school nights said they felt "unable to focus" in first period twice as often as those who slept eight or more. Source B, a junior interviewed for the school paper: "I stay up late because it\'s the only time all day that nobody needs anything from me." Bring the two sources together into one point neither makes alone. One paragraph.',
    essayText: `Telling students to go to bed earlier will not work, because the late night is not wasted time to them; it is the only time they have. The survey shows the cost: students who slept under seven hours were twice as likely to feel "unable to focus" in first period. The junior shows the reason: she stays up because it's "the only time all day that nobody needs anything from me." Read alone, the survey makes short sleep sound like a bad habit, and the interview makes staying up sound like a free choice. Together they show a trade: students are giving up focus in the morning to buy an hour that belongs to them. If a school wants that hour back for sleep, it has to give the hour back somewhere in the day.`,
    bands: scoreBands([4, 5], [4, 5], [4, 5], [4, 5], [4, 5]),
    qualitative: [
      {
        evaluatorId: 'rubric-alignment',
        requirement:
          'Credit the trade as a point neither source makes alone (Depth of Thought), and the "read alone … together" turn as the connection (Development of Thought).',
      },
      {
        evaluatorId: 'feedback-grounding',
        requirement:
          'Name the specific contribution the paragraph takes from each source when crediting it.',
      },
    ],
  }),
  calibrationCase({
    id: 'dp-synthesize-two-summaries',
    title: 'Two summaries and a point either source makes',
    description:
      'Source A summarized, then Source B, then a conclusion that needs neither. Accurate and organized, and not a synthesis.',
    tags: ['synthesize-summaries', 'synthesize'],
    paragraphMode: 'synthesize',
    assignmentPrompt:
      'Source A, a school librarian: "The year we banned phones at lunch, we checked out more print books than in the three years before it combined." Source B, a student survey at the same school: 61% said lunch is "the only time I get to really talk to my friends." Bring the two sources together into one point neither makes alone. One paragraph.',
    essayText: `Source A is a librarian who says that the year the school banned phones at lunch, students checked out more print books than in the three years before. This shows that the phone ban made students read more. Source B is a survey where 61% of students said that lunch is the only time they really get to talk to their friends. This shows that lunch is very important to students. Both sources show that lunch is an important time of the day for students and that schools should think carefully about it.`,
    bands: scoreBands([1, 2], [2, 3], [2, 3], [2, 3], [4, 5]),
    qualitative: [
      {
        evaluatorId: 'rubric-alignment',
        requirement:
          'Do not credit "both sources show that lunch is important" as synthesis in Depth of Thought; the survey says it alone.',
      },
      {
        evaluatorId: 'priority-selection',
        requirement:
          'Make the connection the next step: what the survey changes about the librarian\'s numbers (who is in the library, and what they gave up to be there).',
      },
    ],
  }),
  calibrationCase({
    id: 'dp-synthesize-second-source-decorates',
    title: 'One source does the work, the other decorates',
    description:
      'A sound point built entirely from Source A, with Source B mentioned in a sentence that connects to nothing.',
    tags: ['synthesize-one-source', 'synthesize'],
    paragraphMode: 'synthesize',
    assignmentPrompt:
      'Source A, a ninth-grade teacher: "When I stopped grading homework for completion, fewer students turned it in, but the ones who did had clearly tried." Source B, a district report: students here spend an average of 2.5 hours a night on homework across all their classes. Bring the two sources together into one point neither makes alone. One paragraph.',
    essayText: `Grading homework for completion rewards the wrong thing. The teacher in Source A found that when she stopped grading for completion, fewer students turned homework in, but the ones who did had actually tried. That means completion grades were mostly measuring whether students wrote something down, not whether they learned it. If the point of homework is learning, then a grade for completion gets in the way of that point, because it tells students that turning something in matters more than thinking about it. Also, Source B says students spend 2.5 hours a night on homework. Teachers should grade homework on understanding instead of completion.`,
    bands: scoreBands([2, 3], [1, 2], [2, 3], [2, 3], [4, 5]),
    qualitative: [
      {
        evaluatorId: 'rubric-alignment',
        requirement:
          'Do not credit the Source B sentence as synthesis; it is mentioned, not connected, and the point comes from Source A alone.',
      },
      {
        evaluatorId: 'priority-selection',
        requirement:
          'Make the connection the next step: what 2.5 hours a night across all classes changes about why students stopped turning in ungraded work.',
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
