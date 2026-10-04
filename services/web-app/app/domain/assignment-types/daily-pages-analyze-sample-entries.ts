import type {
  DailyPagesSampleEntry,
  DailyPagesSamplePersonaKey,
} from './daily-pages-sample-entries';

/**
 * An Analyze class set, for seeded environments only.
 *
 * The first sample set answers a prompt with no paragraph type. This one is a
 * Daily Pages assignment run as an analysis paragraph — Claim-Evidence-Analysis
 * on a passage — so a preview shows what that type looks like once a class has
 * written it: three graded entries where analysis is won, skipped, and never
 * attempted, and one draft left unsubmitted so the live Analyze tutor has
 * something to coach.
 *
 * The scores and comments are written by hand, like the first set's, and the
 * percentages are asserted against the real grading helpers in the test. No
 * tutor conversation is seeded: the draft is there so the real tutor answers.
 *
 * Same alias rule as `daily-pages-sample-entries.ts`: the Prisma seed imports
 * this module, so it uses no `~/` paths.
 */

/** From the short-form library (`sf-cr-rj-001`), word for word. */
export const DAILY_PAGES_ANALYZE_SAMPLE_ASSIGNMENT = {
  title: 'Daily Pages — Juliet argues with a name (Analyze)',
  libraryPromptId: 'sf-cr-rj-001',
  prompt:
    'In the balcony scene (2.2), Juliet argues with herself about names. Quote the line where her argument turns, and explain what she has decided by the end of it. One paragraph.',
  paragraphMode: 'analyze',
  writingTimeMinutes: 15,
} as const;

export const DAILY_PAGES_ANALYZE_SAMPLE_ENTRIES: DailyPagesSampleEntry[] = [
  {
    key: 'analyze-explains',
    personaKey: 'student-graded',
    studentFirstName: 'Casey',
    title: 'Juliet argues with a name — Casey',
    text: "Juliet's argument turns on one small word: \"'Tis but thy name that is my enemy.\" Until that line she is asking Romeo to change who he is — \"Deny thy father and refuse thy name\" — but \"but\" shrinks the problem to something he can simply put down. Once the feud lives in a name instead of a person, it becomes something you can take off, and the rest of the speech treats it exactly that way: a rose would smell as sweet under another word, and Romeo can \"doff\" his name like a hat. By the end she has decided more than that names do not matter. She turns the argument into a trade — \"for thy name, which is no part of thee, / Take all myself\" — and offers herself before Romeo has said a word to her. The logic that makes the feud small is the same logic that makes her promise enormous.",
    scores: {
      depth_of_thought: 5,
      development_of_thought: 5,
      organization_and_structure: 4,
      voice_and_style: 5,
      grammar_and_mechanics: 4,
    },
    comments: {
      depth_of_thought:
        'Your claim is about how the speech works, not what happens in it: one word turns a fight about identity into something Romeo can put down. Nobody hands a reader that, and you found it.',
      development_of_thought:
        'Every quotation is explained. You say what "but" does, then follow the same idea through "doff" and the rose, so the evidence builds instead of piling up.',
      organization_and_structure:
        'Claim, evidence, analysis, then what she has decided — the order the prompt asks for. The two dashes in the middle carry a lot; one of those asides could be its own sentence.',
      voice_and_style:
        '"The logic that makes the feud small is the same logic that makes her promise enormous" is an earned last line. No hedges, nothing warming up.',
      grammar_and_mechanics:
        'Clean, with the quotations punctuated correctly, including the line break in "thee, / Take". One aside runs long enough to lose the sentence around it.',
    },
    overallComment:
      'Casey, this is what an analysis paragraph is for: you named the exact word where the argument turns and explained what it does, then showed the same move running through the rest of the speech. Next time, split the longest dash aside into its own sentence so each point lands on its own.',
    grammarIssues: [
      {
        excerpt:
          'Until that line she is asking Romeo to change who he is — "Deny thy father and refuse thy name" — but "but" shrinks the problem',
        kind: 'style',
        rule: 'Omit needless words.',
        ruleNumber: 10,
        message:
          'Two dashes around a quotation make the sentence hard to follow. Try giving the quotation its own sentence.',
      },
    ],
    released: true,
    submittedDaysAgo: 3,
  },
  {
    key: 'analyze-quotes-only',
    personaKey: 'student-submitted',
    studentFirstName: 'Riley',
    title: 'Juliet argues with a name — Riley',
    text: 'In the balcony scene Juliet talks about names. She says "What\'s in a name? That which we call a rose by any other name would smell as sweet." This shows that names do not matter. She also says "Romeo, doff thy name." This shows that she wants Romeo to change his name. Another quote is "Deny thy father and refuse thy name." This shows she wants him to leave his family. By the end she decides she loves Romeo even though he is a Montague.',
    scores: {
      depth_of_thought: 2,
      development_of_thought: 2,
      organization_and_structure: 3,
      voice_and_style: 3,
      grammar_and_mechanics: 4,
    },
    comments: {
      depth_of_thought:
        'The prompt asks where her argument turns, and the paragraph never names a turn. "Names do not matter" is the speech\'s surface; the claim has to say something about how she gets there.',
      development_of_thought:
        'Three quotations, and each one is followed by "This shows" and a restatement of the quotation. Pick one line and explain how its words do what you say — what does "doff" make a name into?',
      organization_and_structure:
        'Easy to follow, but the order is the order of the scene rather than the order of an argument. Lead with the turn, then the evidence for it.',
      voice_and_style:
        '"This shows" three times makes the paragraph sound like a list. Once you are explaining instead of pointing, the phrase will drop out on its own.',
      grammar_and_mechanics:
        'Correct sentences. The rose quotation runs two lines of verse together; mark the break with a slash: "rose / By any other name".',
    },
    overallComment:
      'Riley, you found good evidence — all three lines matter — but quoting is not analyzing yet. Choose the one line where Juliet\'s argument turns, and spend the paragraph explaining what its words do. One quotation, fully explained, is worth more than three.',
    grammarIssues: [
      {
        excerpt:
          'That which we call a rose by any other name would smell as sweet.',
        kind: 'error',
        rule: 'Quoting verse.',
        message:
          'This quotation crosses a line of verse. Mark the line break with a slash: "a rose / By any other name".',
      },
    ],
    released: true,
    submittedDaysAgo: 3,
  },
  {
    key: 'analyze-retells',
    personaKey: 'student-unreleased',
    studentFirstName: 'Taylor',
    title: 'Juliet argues with a name — Taylor',
    text: 'In act 2 scene 2 Romeo sneaks into the Capulet orchard after the party. Juliet comes out onto her balcony and she doesnt know Romeo is there. She talks about how she wishes Romeo wasnt a Montague because there families hate each other. Romeo hears her and decides to talk to her. They talk for a long time and decide to get married the next day. Then the nurse calls Juliet and she has to go inside. This scene is important because it is where they decide to get married.',
    scores: {
      depth_of_thought: 1,
      development_of_thought: 1,
      organization_and_structure: 2,
      voice_and_style: 2,
      grammar_and_mechanics: 3,
    },
    comments: {
      depth_of_thought:
        'This retells the scene accurately, but the prompt asks for her argument and where it turns. Retelling is recall; the analysis starts when you say what a line is doing.',
      development_of_thought:
        'There is no quotation, so there is nothing to explain yet. Find the line where Juliet changes her mind about names and copy it exactly.',
      organization_and_structure:
        'The paragraph follows the plot from start to finish. An analysis paragraph follows a claim instead: start with what Juliet decides, then show where.',
      voice_and_style:
        '"This scene is important because" could close a paragraph about any scene. Say what is important about this one, in words only this scene could earn.',
      grammar_and_mechanics:
        'Three errors a reader notices, all fixable: missing apostrophes in two contractions, and "there" where you mean "their".',
    },
    overallComment:
      'Taylor, you know this scene well — every event is right. Now pick one line Juliet says and explain what it shows about how her mind changes. That one move is the whole assignment, and you are closer to it than this draft looks.',
    grammarIssues: [
      {
        excerpt: 'she doesnt know Romeo is there',
        kind: 'error',
        rule: 'Apostrophes in contractions.',
        message: '"doesnt" needs an apostrophe: "doesn\'t".',
      },
      {
        excerpt: 'Romeo wasnt a Montague because there families hate each other',
        kind: 'error',
        rule: 'Commonly confused words.',
        message:
          '"wasnt" needs an apostrophe ("wasn\'t"), and "there" should be "their" — the families belong to them.',
      },
    ],
    released: false,
    submittedDaysAgo: 2,
  },
];

/**
 * A draft left open for the live Analyze tutor: a claim and the right line,
 * stopping exactly where the analysis should start. Not submitted, not graded.
 */
export const DAILY_PAGES_ANALYZE_SAMPLE_DRAFT: {
  personaKey: DailyPagesSamplePersonaKey;
  studentFirstName: string;
  title: string;
  text: string;
} = {
  personaKey: 'student',
  studentFirstName: 'Sam',
  title: 'Juliet argues with a name — Sam (draft)',
  text: "Juliet's argument turns when she stops blaming Romeo and starts blaming his name. She says \"'Tis but thy name that is my enemy.\"",
};
