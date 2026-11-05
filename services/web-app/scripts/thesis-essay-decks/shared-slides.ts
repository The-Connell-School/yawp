/**
 * Slides that come back across the Thesis-Driven Essay decks, written once.
 *
 * Lessons 3 to 7 open with the same cumulative review quiz: each lesson adds
 * one question, so the quiz grows from three questions to six. Brian's note
 * on it (Lesson 3 video): optional, make a game of it, prizes help, and
 * "if that's not your gig, delete the slides."
 */
import type { HybridSlide } from './deck-types';

export interface ReviewQuestion {
  question: string;
  options: string[];
  /** Index into `options`. */
  answer: number;
  /** For the notes: why this is the answer, in Brian's words. */
  why: string;
}

export const REVIEW_QUESTIONS: ReviewQuestion[] = [
  {
    question: 'What’s the best way to write an essay?',
    options: [
      'Just start writing and hope some good ideas come out.',
      'Take my ideas and plug them into a formula, like the 5-paragraph essay.',
      'Develop my ideas into a thesis statement and build my essay around that.',
      'ChatGPT, duh.',
      'I have never actually written an essay, so I have no idea.',
    ],
    answer: 2,
    why: 'Develop my ideas into a thesis statement and build my essay around that.',
  },
  {
    question: 'Critical thinking is best defined as:',
    options: [
      'Asking questions and seeking answers about a topic in order to develop a position on it',
      'Finding all of the weaknesses in an argument',
      'Finding all of the strengths in an argument',
      'Arguing a specific point of view in front of an audience',
      'Researching experts’ perspectives and arguments on a topic in order to develop a position on it',
    ],
    answer: 0,
    why: 'Asking questions and seeking answers about a topic. The same thing they did with the photo and in their pre-write.',
  },
  {
    question: 'Which of the following is MOST TRUE about a good thesis statement?',
    options: [
      'A good thesis statement is easy for the reader to agree with.',
      'A good thesis statement contains 2–3 pieces of support.',
      'A good thesis statement contains observation and analysis.',
      'A good thesis statement contains research and facts.',
      'A good thesis statement is 1–2 sentences long.',
    ],
    answer: 2,
    why: 'Observation and analysis. Some students (and some of us) will pick B, the 5-paragraph-essay answer; our thesis is going to be more complex than a three-pronged list.',
  },
  {
    question: 'Your introduction paragraph’s MAIN function is to:',
    options: [
      'Tell a story that illustrates the topic of your essay',
      'Give specific examples that support your thesis',
      'Define important terms that your reader may need to know',
      'Present questions that your essay will answer',
      'Welcome your reader into your discussion and state the thesis',
    ],
    answer: 4,
    why: 'Welcome the reader in and state the thesis. A, C and D are styles an intro can use, not its job.',
  },
  {
    question: 'Which of the following would probably NOT show up in your body paragraphs?',
    options: [
      'Supporting quotations about specific points',
      'Your opinions',
      'Your thesis statement',
      'Analysis of other people’s arguments',
    ],
    answer: 2,
    why: 'Your thesis statement. It lives at the end of the introduction; the body paragraphs support, define and illustrate its parts.',
  },
  {
    question: 'True or False: a good conclusion restates your thesis and main ideas.',
    options: ['True', 'False'],
    answer: 1,
    why: 'False. Restating can feel very repetitive. A good conclusion offers final reflection, arguments, or a call to action based on everything you just said.',
  },
];

const QUIZ_NOTE =
  'Optional review quiz. Brian: "If that’s not your gig, delete the slides." If you keep it, make it a game: read the question, take answers, then click to the reveal. Candy or other small prizes help.';

/**
 * The divider ahead of the review quiz in Lessons 3 to 6, so a teacher can
 * see where the optional part starts (Lesson 7 has Brian's own, "Course
 * Review").
 */
export const REVIEW_DIVIDER: HybridSlide = {
  layout: 'section',
  eyebrow: 'Review',
  kicker: 'Optional',
  title: 'Quick Review',
  line: 'What we’ve learned so far, one question at a time.',
  notes:
    'The review quiz starts here: this divider and the question-and-reveal pairs after it. Brian: "If that’s not your gig, delete the slides." Delete them together, or skip ahead to the lesson.',
};

/** The quiz that opens a lesson: question and reveal for the first `count` questions. */
export function reviewQuiz(count: number): HybridSlide[] {
  return REVIEW_QUESTIONS.slice(0, count).flatMap((q, index) => {
    const base = {
      layout: 'quiz' as const,
      eyebrow: `Review · ${index + 1} of ${count}`,
      title: q.question,
      options: q.options,
    };
    return [
      { ...base, notes: `${QUIZ_NOTE} Answer: ${q.why}` },
      { ...base, answer: q.answer, notes: `The reveal. ${q.why}` },
    ];
  });
}

/** The conclusion recipe (Lesson 6 slide 24, Lesson 7 slide 15). */
export const CONCLUSION_STRUCTURE: HybridSlide = {
  layout: 'ordering',
  numbered: true,
  eyebrow: 'Suggested conclusion structure',
  title: 'A conclusion that works',
  accent: 'teal',
  items: [
    'Rhetorical question',
    'Answer it directly (==“Perhaps…”==)',
    '2 sentences of opinion or analysis',
    'Supporting quote (if working with a text)',
    'Final, concluding sentence: the big, final point',
  ],
  notes:
    'Five moves, in order. The question creates a shift; "Perhaps" lets students offer a deduction (even a new idea) confidently without having to prove it all over again; then two sentences of their own analysis, a quote if they have a text, and one big closing line.',
};

/**
 * Brian's house analogy (Lessons 5 and 6). His slide was only a title and he
 * told the story from memory; this version puts the stops on the slide so
 * any teacher can walk the room through it.
 */
export const HOUSE_ANALOGY: HybridSlide = {
  layout: 'steps',
  eyebrow: 'The house analogy',
  title: 'Your essay is a house, and you’re showing it',
  accent: 'orange',
  items: [
    '==The neighborhood== · Driving in, your reader gets a sense of where they are. That’s your introduction: context.',
    '==The front door== · They step into the foyer and see the whole house at once. That’s your thesis statement.',
    '==The rooms== · You walk them through, pointing out what makes each room worth it. Those are your body paragraphs.',
    '==Back at the door== · You step out, point at the neighborhood, and leave gracefully. That’s your conclusion.',
  ],
  notes:
    'Brian’s telling: imagine you’re a real estate agent and the goal is to sell the house. As the buyer drives in they notice the street, the sidewalks, the other houses; that’s the introduction creating context. They walk up the path and into the foyer: the thesis, where they can see the whole argument. You’d never stop there, so you walk them room by room (the body paragraphs), pointing out specific things that make the house worth buying. At the end you walk them back to the front door and point out the neighborhood again, maybe a neighboring house you won’t go into: new ideas you acknowledge without exploring. You place the house in the wider world and make a graceful exit. That’s the conclusion.',
};
