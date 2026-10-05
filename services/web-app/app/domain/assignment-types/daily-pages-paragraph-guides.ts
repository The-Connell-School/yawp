import {
  enabledParagraphModes,
  getParagraphMode,
  type ParagraphModeKey,
} from './daily-pages-paragraph-modes';

/**
 * What a student is aiming for in each Daily Pages paragraph type, explained
 * several ways: the three parts in plain words, the part most often skipped,
 * a model with each part marked, a typical miss with the one change that
 * fixes it, and the questions the tutor will ask.
 *
 * Teachers read it on the Daily Pages page; students open it from inside an
 * assignment of that type. It is one explanation for both, and it names the
 * same three parts, in the same order, as the tutor's coaching (a test holds
 * that), so a student is never taught one model and coached on another.
 *
 * The models answer prompts that are not in the prompt library. The guide is
 * open while a student writes, so its model must never be the answer to an
 * assignment they could be given. Each miss answers the same prompt as its
 * model, so the two can be read side by side.
 */

export type ParagraphGuide = {
  key: ParagraphModeKey;
  label: string;
  /** One line on what this kind of paragraph does. */
  summary: string;
  parts: Array<{ name: string; explanation: string }>;
  oftenSkipped: string;
  model: {
    prompt: string;
    text: string;
    /** Where each part is in the model; excerpts appear in `text` verbatim. */
    marks: Array<{ part: string; excerpt: string }>;
  };
  miss: {
    text: string;
    whatsMissing: string;
    fix: string;
  };
  tutorAsks: string[];
};

const GATSBY_PROMPT =
  'Reread the opening pages of The Great Gatsby. What is Nick refusing to say outright about Gatsby? Quote the words that give it away, and explain what they are doing. One paragraph.';

const PHONES_PROMPT =
  'Should phones be banned during the school day? Take a position, give your strongest reason, and test it against one specific situation where your position might fail. One paragraph.';

const GUIDES: Record<string, Omit<ParagraphGuide, 'key' | 'label'>> = {
  analyze: {
    summary:
      'A point about how a text works, the exact words that show it, and an explanation of how those words do it.',
    parts: [
      {
        name: 'Claim',
        explanation:
          'A point about how the text works: what a word, image or choice is doing. Not a summary of what happens.',
      },
      {
        name: 'Evidence',
        explanation:
          'The exact words that show it: a short quotation or a precise moment. A few words that do the work beat a long passage.',
      },
      {
        name: 'Analysis',
        explanation:
          'How those words prove the claim. Say what a word or image does that another would not. This is where the paragraph is won.',
      },
    ],
    oftenSkipped:
      'Explaining the evidence. Quoting a line and writing "this shows…" is not analysis. The analysis says what the words do, and why that proves your claim.',
    model: {
      prompt: GATSBY_PROMPT,
      text: 'Nick never admits that he envies Gatsby, but his words give him away. He praises Gatsby\'s "extraordinary gift for hope" and "romantic readiness," then blames everything on "what preyed on Gatsby," as if the dream were an animal that hunted him rather than something he chose. That verb lets Nick admire the dream without having to want it. It\'s a way of keeping his distance: the more Nick insists that Gatsby was a victim of his own wonder, the less he has to admit that he wishes he could believe in anything that much himself.',
      marks: [
        {
          part: 'Claim',
          excerpt:
            'Nick never admits that he envies Gatsby, but his words give him away.',
        },
        {
          part: 'Evidence',
          excerpt:
            'He praises Gatsby\'s "extraordinary gift for hope" and "romantic readiness," then blames everything on "what preyed on Gatsby,"',
        },
        {
          part: 'Analysis',
          excerpt:
            'as if the dream were an animal that hunted him rather than something he chose. That verb lets Nick admire the dream without having to want it.',
        },
      ],
    },
    miss: {
      text: 'Nick talks about Gatsby a lot in the opening pages. He says Gatsby had an "extraordinary gift for hope." This shows that Nick admires Gatsby. He also talks about "what preyed on Gatsby." This shows that something bad happened to Gatsby.',
      whatsMissing:
        'Two quotations, each followed by "This shows" and a restatement. "Nick admires Gatsby" is what happens, not a claim about how the words work, and nothing explains what the words do.',
      fix: 'Keep one quotation and explain one word in it: what does "preyed" turn the dream into, and why would Nick choose that word?',
    },
    tutorAsks: [
      'What are you saying about how the text works, not just what happens in it?',
      'Which exact words show that? If you quoted a lot, which few words are doing the work?',
      'What does that word do that another word wouldn\'t?',
    ],
  },
  argue: {
    summary:
      'A side someone could disagree with, the strongest reason for it, and one specific case that tests it.',
    parts: [
      {
        name: 'Position',
        explanation:
          'A side someone could disagree with. If no one would argue with it, it is not a position yet. If it says "both sides", choose one.',
      },
      {
        name: 'Reason',
        explanation:
          'The strongest reason for it, made concrete. One reason developed beats three listed.',
      },
      {
        name: 'Test',
        explanation:
          'One specific case where the position could fail: a situation, an example, a moment in the text. If it only holds once you narrow it, the narrower position is the stronger one.',
      },
    ],
    oftenSkipped:
      'The test. More reasons support a position; they do not test it. Find the one case where your position might fail, and show whether it holds there.',
    model: {
      prompt: PHONES_PROMPT,
      text: 'Phones should be locked away during class, but not for the whole school day. The strongest reason to take them is attention: a phone face-down on a desk still pulls at a student every time it buzzes, so the only phone that stops interrupting a lesson is one that is out of reach. The hard case is lunch, where nobody is being taught and a ban looks like control for its own sake. That case is why the line belongs at the classroom door rather than the school gate. A rule meant to protect attention has no reason to follow students into the cafeteria.',
      marks: [
        {
          part: 'Position',
          excerpt:
            'Phones should be locked away during class, but not for the whole school day.',
        },
        {
          part: 'Reason',
          excerpt:
            'The strongest reason to take them is attention: a phone face-down on a desk still pulls at a student every time it buzzes, so the only phone that stops interrupting a lesson is one that is out of reach.',
        },
        {
          part: 'Test',
          excerpt:
            'The hard case is lunch, where nobody is being taught and a ban looks like control for its own sake. That case is why the line belongs at the classroom door rather than the school gate.',
        },
      ],
    },
    miss: {
      text: 'Phones have good and bad sides. On one hand, phones can distract students during class and make it hard to focus. On the other hand, students need phones for emergencies and to contact their parents. Some people think phones should be banned and some people think they shouldn\'t. It really depends on the school and the situation.',
      whatsMissing:
        'It never takes a side. "It depends" lists both sides without choosing, so there is no position for a reason to support or a case to test.',
      fix: 'Choose a side, and say when it applies. Then give the one reason you would keep if you could keep only one.',
    },
    tutorAsks: [
      'What would you say to someone who disagrees with you?',
      'If you could keep only one reason, which one, and why that one?',
      'Where could your position fail, and does it still hold there?',
    ],
  },
};

function toGuide(key: ParagraphModeKey): ParagraphGuide | null {
  const mode = getParagraphMode(key);
  const guide = GUIDES[key];
  if (!mode || !guide) return null;
  return { key: mode.key, label: mode.label, ...guide };
}

/** The guide for a switched-on type, or null for anything else. */
export function getParagraphGuide(
  key: string | null | undefined
): ParagraphGuide | null {
  const mode = getParagraphMode(key);
  return mode ? toGuide(mode.key) : null;
}

/** Guides for every switched-on type, in the registry's order. */
export function enabledParagraphGuides(): ParagraphGuide[] {
  return enabledParagraphModes()
    .map((mode) => toGuide(mode.key))
    .filter((guide): guide is ParagraphGuide => guide !== null);
}
