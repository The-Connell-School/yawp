// The teacher-facing landing page for each assignment type: what a teacher
// reads after clicking a type (e.g. The Thesis-Driven Essay) on the dashboard.
//
// Brian's Oct 31 copy edits ("Assignment-Type Landing Pages: teacher-facing
// copy edits for Kevin") rewrote these for teachers, in a mentor teacher's
// voice, with much less text. Five pages are his word for word: The
// Thesis-Driven Essay, Class Starter, Exit Ticket, Pre-Writing and Thesis
// Statement. Keep them exact. `content.test.ts` pins each one to the doc.
//
// The rest (Daily Pages, AP History, The 5-Paragraph Essay, ACT Writing and
// Welcome to Yawp!) are written to the same model: a short description, How
// it works with the same bold leads (New, Tutor on or off?, Grading is ...),
// and the Prompt Library intro. Their claims about grading have to hold
// against the rubric each type actually grades with.
//
// Text uses a small inline markup: **bold** and *italic*. See rich-text.tsx.
//
// School-authored types (anything `resolveLandingPageKey` does not know) keep
// the old page: their description and modules are theirs, not ours.

import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';
import { isThesisDrivenEssayTitle } from '~/domain/assignment-types/thesis-driven-essay';

export type LandingPageKey =
  | 'thesis-driven-essay'
  | 'class-starter'
  | 'exit-ticket'
  | 'prewriting'
  | 'thesis-statement'
  | 'daily-pages'
  | 'ap-history'
  | 'five-paragraph-essay'
  | 'act-writing'
  | 'welcome-to-yawp';

export type LandingBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: string[] }
  /**
   * The assignment type's modules, one row each and in order. With `links`,
   * every row carries its lesson stack and tutorial video (shown as coming
   * soon until they exist). `lead` sits directly above the rows.
   */
  | { type: 'steps'; lead?: string; links: boolean };

export type LandingSectionId =
  | 'how-to-teach-it'
  | 'when-to-use-it'
  | 'how-it-works'
  | 'prompt-library'
  | 'what-makes-a-good-one'
  | 'what-makes-a-strong-thesis';

export type LandingSection = {
  id: LandingSectionId;
  heading: string;
  blocks: LandingBlock[];
};

/** Which existing library renders under the page, if any. */
export type LandingLibrary = 'thesis' | 'open-ended' | 'short-form' | 'ap-history';

export type LandingPage = {
  key: LandingPageKey;
  /** Leads the page under the title. It needs no heading. */
  description: LandingBlock[];
  sections: LandingSection[];
  /** Shown at the top of the library itself, inside it, not above it. */
  libraryNote: string | null;
  library: LandingLibrary | null;
};

const p = (text: string): LandingBlock => ({ type: 'paragraph', text });
const ul = (...items: string[]): LandingBlock => ({ type: 'bullets', items });

const TUTOR_NEVER_WRITES = 'It will never write for them.';

const THESIS_DRIVEN_ESSAY: LandingPage = {
  key: 'thesis-driven-essay',
  description: [
    p(
      'The Thesis-Driven Essay is the big one: the grown-up essay that stands up in any high school or college classroom. Complex thesis statements, well-built arguments, conclusions that go beyond restating the main idea, and writing any reader will enjoy (even you, grading your 79th essay). Use it in any subject or class — it works everywhere!'
    ),
  ],
  sections: [
    {
      id: 'how-to-teach-it',
      heading: 'How to Teach It',
      blocks: [
        p(
          'The Yawp! process is what we wish someone had shown us in our first year teaching. Teach the steps below in order. Each has a lesson stack (slides and handouts you can teach as is or edit) and a short tutorial video. Whether this is your first year or your twentieth, watch each video before you teach that lesson (at least the first time through). This is a step-by-step process, and going in order makes the difference: how students find a focus, develop a thesis, and build body paragraphs that actually prove it.'
        ),
        {
          type: 'steps',
          lead: '**Teach these steps in order! (Did we mention that?)**',
          links: true,
        },
      ],
    },
    {
      id: 'prompt-library',
      heading: 'Prompt Library',
      blocks: [
        p(
          'Have your own prompt? Click **New** above to create it in the Assignment Builder. Or choose one from our library: filter by subject, text, or grade level, click a prompt, and edit it however you like in the Assignment Builder.'
        ),
      ],
    },
  ],
  libraryNote:
    "**Note:** We've found that students write their best essays about something they actually care about, so many of our prompts are open on purpose and encourage students to choose their own adventure within a topic. You'll enjoy reading 75 essays with 75 different angles a lot more than 75 essays answering the same narrow question. Still, some students and teachers prefer a tighter, more specific scope, and that's OK too! Either way, help students find their personal connection to the topic. If a student is stuck, send them to the emotional charge: what they loved, what grabbed them, what made them upset.",
  library: 'thesis',
};

const CLASS_STARTER: LandingPage = {
  key: 'class-starter',
  description: [
    p(
      "The Class Starter is the easiest way to get every student writing every day. 5–10 minutes at the start of class — one open prompt and no pressure about grammar or polish. Regular low-stakes writing builds critical thinking, as well as confidence, so students feel ready when you assign the big essay. Use it as a warm-up, a reaction to last night's reading, or a way to hear from the kid who never raises their hand."
    ),
  ],
  sections: [
    {
      id: 'how-it-works',
      heading: 'How it works',
      blocks: [
        p(
          'Click **New** above to write a prompt, or pick one from the Prompt Library below.'
        ),
        p(
          `**Tutor on or off?** You choose in the Assignment Builder. With the tutor on, students get feedback on what they wrote and encouragement to write a little more. ${TUTOR_NEVER_WRITES} Turn it off when you just want them writing on their own.`
        ),
        p(
          '**Grading is about effort.** Any real attempt earns full credit, a thin one earns partial credit, and a blank page earns none.'
        ),
      ],
    },
    {
      id: 'prompt-library',
      heading: 'Prompt Library',
      blocks: [p('Need an idea to get students thinking? Browse the library!')],
    },
  ],
  libraryNote: null,
  library: 'open-ended',
};

const EXIT_TICKET: LandingPage = {
  key: 'exit-ticket',
  description: [
    p(
      "The Exit Ticket tells you whether today's lesson landed. A few minutes at the end of class for students to show they understand a concept, reflect on what you just did, or ask a lingering question. Use students’ responses to plan your next lesson."
    ),
  ],
  sections: [
    {
      id: 'how-it-works',
      heading: 'How it works',
      blocks: [
        p('Click **New** above and choose a type:'),
        ul(
          "**Reflection/Question:** students tell you what they learned, what surprised them, or what they're still wondering.",
          "**Check for understanding:** name the idea you're checking and let students explain it. You can set the correct answer or key points in the Assignment Builder."
        ),
        p(
          '**Tutor off or on?** It starts off, because an exit ticket shows what students understand on their own. Turn it on for a class that tends to hand in six words. It will ask them to say more without giving away the answer or writing for them.'
        ),
        p(
          "**Grading is optional.** Set it for an easy grade or leave it ungraded if you just want to see who got it and who didn't."
        ),
      ],
    },
    {
      id: 'what-makes-a-good-one',
      heading: 'What makes a good exit ticket',
      blocks: [
        ul(
          '**Ask for one thing.** Three questions get three shallow answers.',
          '**Ask them to explain, not recall.** "Define the term post-modern hero" shows who memorized a sentence. "Point to one specific detail/moment of chapter 4 that shows this character is a post-modern hero" shows who understood.',
          "**Read them before you plan tomorrow.** If read quickly, an exit ticket can change tomorrow's lesson."
        ),
      ],
    },
  ],
  libraryNote: null,
  library: null,
};

const PREWRITING: LandingPage = {
  key: 'prewriting',
  description: [
    p(
      '**Step 1 of the Yawp! writing process.** Start here, before students write a word of their essay.'
    ),
    p(
      'Pre-writing may be the most important — and most overlooked — part of the writing process. Most students skip straight from the prompt to the essay, and it shows. They end up sorting out their ideas in the essay itself, which can result in a big, hot, rambling mess. Pre-writing is where students figure out what they actually think about the topic or prompt...*before they write their essay.* We promise: the writing they do before the actual writing of their essays will greatly improve the quality of their finished products (and the quality of your reading/grading experience)!'
    ),
  ],
  sections: [
    {
      id: 'when-to-use-it',
      heading: 'When to use it',
      blocks: [
        p(
          "Give students the essay prompt, and before they start writing the essay, let them pre-write. They're allowed to be messy as they explore ideas, ask questions, and eventually find a focus for their essay."
        ),
        p(
          'After this, move on to Thesis Statement (Step 2), where students turn their focus into a clear, arguable claim.'
        ),
      ],
    },
    {
      id: 'how-it-works',
      heading: 'How it works',
      blocks: [
        p(
          'Click **New** above to write a prompt, or pick one from the Prompt Library below.'
        ),
        p(
          '**First time teaching it?** Watch the short tutorial video before class. It walks you through this step of the Yawp! writing process and comes with a ready-to-teach lesson (slides and handouts) you can use as is or edit.'
        ),
        p(
          `**Tutor on or off?** With the tutor on, students get immediate feedback as they write: questions that push their thinking so they can develop original ideas. ${TUTOR_NEVER_WRITES} This is one of the steps where the Tutor really shines and will save you, the teacher, a lot of time. Turn it off if you want to see how students do on their own.`
        ),
        p(
          '**Grading is on the focus and the thinking behind it.** Once students find their focus, they label it at the bottom of the page and submit their document to you. You can see everything they wrote and any chat they had with the Tutor. The Grading Assistant looks at the focus and the pre-writing that led to it. This is about critical thinking, not grammar or polish.'
        ),
      ],
    },
    {
      id: 'prompt-library',
      heading: 'Prompt Library',
      blocks: [
        p(
          'Have your own prompt to get students going? Click **New** above. Or choose one from our library: filter by subject, text, or grade level, click a prompt, and edit it however you like in the Assignment Builder.'
        ),
        p(
          "**Note:** We've found that students write their best essays about something they actually care about, so many of our prompts are open on purpose and let students choose their own adventure within a topic. That's exactly what pre-writing is for. Still, some students and teachers prefer a tighter, more specific scope, and that's OK too! Either way, help students find their personal connection to the topic. If a student is stuck, send them to the emotional charge: what they loved, what grabbed them, what made them upset."
        ),
      ],
    },
  ],
  libraryNote: null,
  // The Thesis-Driven Essay library: the same prompt carries students
  // through Pre-Writing and then Thesis Statement.
  library: 'thesis',
};

const THESIS_STATEMENT: LandingPage = {
  key: 'thesis-statement',
  description: [
    p(
      '**Step 2 of the Yawp! writing process.** Note: Before you ask students to write a thesis statement, we highly recommend letting them pre-write on your prompt (Step 1).'
    ),
    p(
      "The classic three-part thesis of the five-paragraph essay is a great place to start with younger writers, and it's easy enough to teach. What we’re teaching here takes it to a higher level: a more complex thesis for a more complex essay. In one class period, students turn an observation and an analysis into one clear, arguable sentence. It's the heart of Yawp!'s Thesis-Driven Essay as a standalone assignment, so students can practice it with any text or topic."
    ),
  ],
  sections: [
    {
      id: 'when-to-use-it',
      heading: 'When to use it',
      blocks: [
        p(
          'After students pre-write on a prompt and have found a specific focus for their essays, students use this assignment to develop complex, beautiful thesis statements that will drive their essays.'
        ),
        p(
          'Depending on your students and goals, you might also use this assignment on its own to give students practice developing strong thesis statements (but we recommend pre-writing first).'
        ),
      ],
    },
    {
      id: 'how-it-works',
      heading: 'How it works',
      blocks: [
        p(
          'Click **New** above and use the same essay prompt students pre-wrote on.'
        ),
        p(
          '**First time teaching it?** Watch the short tutorial video before class. It walks you through this step of the Yawp! writing process and comes with a ready-to-teach lesson (slides and handouts) you can use as is or edit.'
        ),
        p(
          "**Tutor on or off?** With the tutor on, students get immediate feedback as they shape their thesis: what's working, what's missing, and how to sharpen it. It will never write the thesis for them. This is one of the steps where the Tutor really shines and will save you, the teacher, a lot of time. Turn it off if you want to see how students do on their own."
        ),
        p(
          '**Grading is on the thesis alone.** Students type their thesis on the page and submit the document to you, and the Grading Assistant judges that one sentence.'
        ),
      ],
    },
    {
      id: 'what-makes-a-strong-thesis',
      heading: 'What makes a strong thesis',
      blocks: [
        ul(
          "**It's one sentence.** If it needs two, the idea (or the wording) isn't focused yet.",
          "**It's specific.** Students often think they need to cover a lot of ground to fill the pages. Great thesis statements narrow in, allowing the essay to go deep.",
          '**It pairs observation with analysis.** What students noticed, plus what it means.',
          "**It takes a position someone could disagree with.** A great thesis starts a debate: it's a claim the student has to explain, defend, and qualify across a whole essay."
        ),
        p('**Weak:** "Romeo and Juliet is a play about love and hate."'),
        p(
          "It's one sentence, but that's all it has going for it. It's broad, it only observes, and no one would argue with it."
        ),
        p(
          '**Strong:** "In Romeo and Juliet, the adults\' refusal to end their feud—not fate—dooms the young lovers, suggesting that pride passed between generations is more dangerous than any star-crossed destiny."'
        ),
        p(
          'One sentence. Specific: the adults\' feud. Observation: the feud, not fate, dooms the lovers. Analysis: pride passed between generations is the real danger. Arguable, since the play itself calls the lovers "star-crossed."'
        ),
      ],
    },
  ],
  libraryNote: null,
  // No library: teachers use the same essay prompt students pre-wrote on.
  library: null,
};

// ---------------------------------------------------------------------------
// The pages Brian did not write, modeled on the five above.
// ---------------------------------------------------------------------------

/** Engagement rubric: Excellent is the full total; grammar is never scored. */
const DAILY_PAGES: LandingPage = {
  key: 'daily-pages',
  description: [
    p(
      'Daily Pages is short, regular writing that keeps students in shape between the big essays: a reaction, an opinion, a reflection, a quick argument about something that matters to them. Use it a few times a week, in class or as homework, so writing becomes a habit instead of an event.'
    ),
  ],
  sections: [
    {
      id: 'how-it-works',
      heading: 'How it works',
      blocks: [
        p(
          'Click **New** above to write a prompt, or pick one from the Prompt Library below.'
        ),
        p(
          `**Tutor on or off?** You choose in the Assignment Builder. With the tutor on, students get questions that push their thinking and encouragement to say more. ${TUTOR_NEVER_WRITES} Turn it off when you want to see what they do on their own.`
        ),
        p(
          '**Grading is about engagement.** You set the point total. Real engagement with the prompt earns full credit; a surface-level, off-prompt, or token entry earns less. Grammar and polish are never graded.'
        ),
      ],
    },
    {
      id: 'prompt-library',
      heading: 'Prompt Library',
      blocks: [
        p(
          'Need a prompt? Browse the library: filter by kind, by length, or by whether it needs a source text, click a prompt, and edit it however you like in the Assignment Builder.'
        ),
      ],
    },
  ],
  libraryNote: null,
  library: 'short-form',
};

/** Assigned from the library or Create assignment; there is no New menu. */
const AP_HISTORY: LandingPage = {
  key: 'ap-history',
  description: [
    p(
      'AP History Essays give students real practice with the two essays on the AP U.S., European, and World History exams: the DBQ and the LEQ. Every essay is scored on the AP rubric, so students know where they stand long before May.'
    ),
  ],
  sections: [
    {
      id: 'how-it-works',
      heading: 'How it works',
      blocks: [
        p(
          'Pick a prompt from the library below, or click **Create assignment** above to build your own DBQ or LEQ. You can upload an existing PDF to fill in the prompt and documents.'
        ),
        p(
          '**DBQ or LEQ?** A DBQ gives students a set of sources to analyze, so save it for when they know the period. An LEQ has no documents: students argue from what they know, which makes it great for timed practice.'
        ),
        p(
          '**Tutor on or off?** With the tutor on, students get coaching on the AP rubric moves: thesis, contextualization, evidence, and analysis. It will never write the essay for them.'
        ),
        p(
          '**Grading follows the AP rubric.** The Grading Assistant scores each essay and drafts feedback. You review it, change anything you like, and then release grades.'
        ),
      ],
    },
    {
      id: 'prompt-library',
      heading: 'Prompt Library',
      blocks: [
        p(
          'Choose a prompt, pick a class, and assign it. The prompt, sources, and rubric are locked in when you do, so every student writes from the same material.'
        ),
      ],
    },
  ],
  libraryNote: null,
  library: 'ap-history',
};

const FIVE_PARAGRAPH_ESSAY: LandingPage = {
  key: 'five-paragraph-essay',
  description: [
    p(
      "The 5-Paragraph Essay is where most writers start: an introduction with a clear thesis, three body paragraphs that back it up, and a conclusion that ties it together. It's the foundation for everything that comes later, and a great fit for younger writers or any class that needs the basics before the big essay."
    ),
  ],
  sections: [
    {
      id: 'how-to-teach-it',
      heading: 'How to Teach It',
      blocks: [
        p(
          'Teach the steps below in order. Each one builds on the last: students find a focus, write a thesis, and build paragraphs that prove it.'
        ),
        { type: 'steps', lead: '**Teach these steps in order.**', links: false },
      ],
    },
    {
      id: 'how-it-works',
      heading: 'How it works',
      blocks: [
        p('Click **New** above and write your essay prompt.'),
        p(
          `**Tutor on or off?** With the tutor on, students get feedback at every step: questions that push their thinking and help them see what's missing. ${TUTOR_NEVER_WRITES} Turn it off if you want to see how students do on their own.`
        ),
        p(
          '**Grading follows the rubric.** When students submit, the Grading Assistant scores the essay and drafts feedback. You review it, change anything you like, and release the grade.'
        ),
      ],
    },
  ],
  libraryNote: null,
  library: null,
};

const ACT_WRITING: LandingPage = {
  key: 'act-writing',
  description: [
    p(
      "The ACT Writing Section, start to finish. Students read an issue and three perspectives on it, take a position, and write an argumentative essay — the same task they'll face on test day. It's great practice for juniors and seniors, and a solid argument assignment for anyone."
    ),
  ],
  sections: [
    {
      id: 'how-to-teach-it',
      heading: 'How to Teach It',
      blocks: [
        p(
          'Teach the steps below in order the first time through. Once students know the moves, assign it as timed practice.'
        ),
        { type: 'steps', lead: '**Teach these steps in order.**', links: false },
      ],
    },
    {
      id: 'how-it-works',
      heading: 'How it works',
      blocks: [
        p(
          'Click **New** above and add your prompt: an issue and three perspectives, just like the real test.'
        ),
        p(
          `**Tutor on or off?** With the tutor on, students get feedback as they plan and write: questions that sharpen their position and push them to take on the other side. ${TUTOR_NEVER_WRITES} Turn it off for a true test-day run.`
        ),
        p(
          '**Grading uses the ACT rubric.** Students get a 1–6 score in each of the four ACT domains, just like the real test. You review it before releasing grades.'
        ),
      ],
    },
  ],
  libraryNote: null,
  library: null,
};

const WELCOME_TO_YAWP: LandingPage = {
  key: 'welcome-to-yawp',
  description: [
    p(
      "Welcome to Yawp! is a quick, no-stakes first assignment. Students get to know the writing page and the Tutor before the real work starts, so the first big assignment isn't also their first time in Yawp!"
    ),
  ],
  sections: [
    {
      id: 'how-it-works',
      heading: 'How it works',
      blocks: [
        p(
          'Click **New** above to assign it, ideally before your first real writing assignment.'
        ),
      ],
    },
  ],
  libraryNote: null,
  library: null,
};

export const LANDING_PAGES: Record<LandingPageKey, LandingPage> = {
  'thesis-driven-essay': THESIS_DRIVEN_ESSAY,
  'class-starter': CLASS_STARTER,
  'exit-ticket': EXIT_TICKET,
  prewriting: PREWRITING,
  'thesis-statement': THESIS_STATEMENT,
  'daily-pages': DAILY_PAGES,
  'ap-history': AP_HISTORY,
  'five-paragraph-essay': FIVE_PARAGRAPH_ESSAY,
  'act-writing': ACT_WRITING,
  'welcome-to-yawp': WELCOME_TO_YAWP,
};

const normalize = (title: string) => title.trim().toLowerCase();

/**
 * Which landing page an assignment type gets. Matched on the same things the
 * route already keys on: kind and systemKey where a type has them, and the
 * title for the ones that never got either (The Thesis-Driven Essay, the
 * 5-Paragraph Essay, ACT Writing, Welcome to Yawp!, and Class Starter in the
 * paid catalog). Null keeps the old page.
 */
export function resolveLandingPageKey(type: {
  title: string;
  kind?: string | null;
  systemKey?: string | null;
}): LandingPageKey | null {
  if (type.systemKey === AP_HISTORY_ASSIGNMENT_TYPE_KEY) return 'ap-history';
  switch (type.kind) {
    case 'class_starter':
      return 'class-starter';
    case 'exit_ticket':
      return 'exit-ticket';
    case 'prewriting':
      return 'prewriting';
    case 'thesis_statement':
      return 'thesis-statement';
    case 'daily_pages':
      return 'daily-pages';
    default:
      break;
  }
  if (isThesisDrivenEssayTitle(type.title)) return 'thesis-driven-essay';
  switch (normalize(type.title)) {
    case 'class starter':
      return 'class-starter';
    case 'daily pages':
      return 'daily-pages';
    case 'the 5-paragraph essay':
      return 'five-paragraph-essay';
    case 'act writing section':
      return 'act-writing';
    case 'welcome to yawp!':
      return 'welcome-to-yawp';
    default:
      return null;
  }
}

const stripMarkup = (text: string) => text.replace(/\*\*|\*/g, '');

/** Everything the page says above the library, without markup. */
export function landingPagePlainText(page: LandingPage): string {
  const blocks = [
    ...page.description,
    ...page.sections.flatMap((section) => [
      p(section.id === 'prompt-library' ? '' : section.heading),
      ...section.blocks,
    ]),
  ];
  return blocks
    .flatMap((block) => {
      if (block.type === 'paragraph') return [block.text];
      if (block.type === 'bullets') return block.items;
      return block.lead ? [block.lead] : [];
    })
    .map(stripMarkup)
    .filter(Boolean)
    .join('\n');
}
