/**
 * Lesson 6 of the Thesis-Driven Essay: the Conclusion Paragraph.
 *
 * Brian's "Conclusion Paragraph Slide Deck.pptx" (27 slides), in the hybrid
 * look, plus a current screenshot of the editor on the Conclusion step. His
 * title-only "House Analogy" slide is now the conclusion half of the analogy
 * (the graceful exit) on the slide itself. Notes are from his lesson plan and
 * the Lesson 6 training video.
 */
import type { HybridDeck } from './deck-types';
import { SAMPLE_CONCLUSION } from './sample-essay';
import { CONCLUSION_STRUCTURE, REVIEW_DIVIDER, reviewQuiz } from './shared-slides';

const HALEY_QUESTION =
  'If we assume that teachers don’t like to be boring, then why doesn’t the education system teach them how to prioritize creative thinking in classrooms?';

/** Haley's conclusion with its five moves marked. */
const ANNOTATED_CONCLUSION = SAMPLE_CONCLUSION.replace(HALEY_QUESTION, `**${HALEY_QUESTION}**`)
  .replace('Perhaps the way teachers are taught today is wrong.', '==Perhaps the way teachers are taught today is wrong.==')
  .replace(
    'Imagine the impact this could have on student learning and the teaching profession!',
    '**Imagine the impact this could have on student learning and the teaching profession!**'
  );

export const CONCLUSION_DECK: HybridDeck = {
  title: 'Conclusion Paragraph',
  subtitle: 'Thesis-Driven Essay · Lesson 6',
  slides: [
    {
      layout: 'title',
      eyebrow: 'Thesis-Driven Essay · Lesson 6',
      title: 'Conclusion',
      subtitle: 'Go beyond restating: draw a conclusion',
      notes:
        'Most students should be near or at the end of their body paragraphs; make sure they’ve moved their documents to the "Conclusion Paragraph" step. Some will still be on body paragraphs, and that’s fine: teach this now so they know what to do when they get here. Students move at different paces at this point.',
    },
    REVIEW_DIVIDER,
    ...reviewQuiz(6),
    {
      layout: 'section',
      eyebrow: 'Step 5',
      kicker: 'Step 5',
      title: 'Conclusion Paragraph',
      line: 'A graceful exit.',
      notes: 'Ah, the conclusion. So difficult and annoying for so many students, largely because we were all taught to restate the thesis and main ideas.',
    },
    {
      layout: 'statement',
      eyebrow: 'Myth',
      title: 'Myth',
      body: 'A good conclusion ==restates the thesis and main ideas== of the essay.',
      icon: 'question',
      accent: 'coral',
      notes:
        'Even if you were taught this (or taught it yourself), accept that it’s a bland, unimaginative ending. It makes sense for a speech or a sales pitch, where an audience retains a fraction of what they hear: "my floors look better, cost less, and are greener… so in conclusion, my floors are the best." A critical essay is on the page, for an intelligent reader who can reread.',
    },
    {
      layout: 'statement',
      eyebrow: 'Fact',
      title: 'Fact',
      body: 'Restating your thesis and main ideas can make you seem like ==an alien.==',
      icon: 'eye',
      accent: 'teal',
      notes: '"Yeah, man, I was there with you. I just read your whole essay, and now you’re repeating it to make sure I got it?"',
    },
    {
      layout: 'compare',
      eyebrow: 'Let’s reassess the word',
      title: 'Conclusion (noun)',
      left: { label: 'Definition 1', accent: 'sunshine', lines: ['An ending.'] },
      right: {
        label: 'Definition 2',
        accent: 'teal',
        lines: ['A ==deduction== drawn from available information.'],
      },
      notes: 'Our conclusion paragraph does mark the end of the essay, but it’s more than an ending: it’s a deduction from everything we just said.',
    },
    {
      layout: 'statement',
      eyebrow: 'Conclusion paragraph',
      title: 'So, what can you deduce?',
      body: 'By the end of your essay, you should have exhaustively defined, illustrated, and proven the elements of your thesis. And your reader should be right there with you. So if everything you just said is true, then ==what deductions, or conclusions, can you draw from it all?==',
      icon: 'lightbulb',
      accent: 'sunshine',
      notes: 'Let the class sit with the question for a moment before moving on.',
    },
    {
      layout: 'statement',
      eyebrow: 'Conclusion paragraph',
      title: 'Is your essay about a problem?',
      body: 'If your essay discusses a problem, this could be a great place to discuss ==solutions== to that problem.',
      icon: 'puzzle',
      accent: 'orange',
      notes: 'Especially relevant for the "problem in your community" prompt.',
    },
    {
      layout: 'statement',
      eyebrow: 'Pro-tip',
      title: 'Begin with a rhetorical question',
      body: 'Rhetorical questions can create a nice ==shift== in a discussion or argument. For example, in the sample essay on education, Haley began her conclusion paragraph with the following…',
      icon: 'question',
      accent: 'teal',
      notes: 'Remind them what a rhetorical question really is: a question asked so the writer can supply the answer they want the reader to hear.',
    },
    {
      layout: 'quote',
      eyebrow: 'Haley’s question',
      title: 'How the sample essay’s conclusion begins',
      accent: 'teal',
      body: HALEY_QUESTION,
      attribution: 'Haley, “Bored in the USA” (read the conclusion together)',
      notes: 'Read Haley’s whole conclusion together: a shared reference point for what comes next.',
    },
    {
      layout: 'statement',
      eyebrow: 'Pro-tip',
      title: 'Many a good conclusion begins with “Perhaps”',
      body: 'It’s assertive and smart without being aggressive, and it fits a conclusion’s tone: ==comfortable and confident.== With “perhaps,” you can offer ideas (even new ones) without new support. The support is already in your essay.',
      icon: 'lightbulb',
      accent: 'sunshine',
      notes: '"Perhaps this… but maybe not. I’m just throwing it out there." Students may introduce a new idea here as food for thought on the way out; they don’t need to write a whole new essay about it.',
    },
    {
      layout: 'passage',
      eyebrow: 'Statement of “perhaps”: example',
      title: 'The question, then “perhaps”',
      label: 'From the sample essay',
      accent: 'sunshine',
      body: `**${HALEY_QUESTION}**\n\n==Perhaps the way teachers are taught today is wrong.== They put too much pressure on teachers to increase scores, and this trickles down to the students, and suddenly everything we do in school is about “the test.”`,
      notes:
        'Haley hasn’t talked about how teachers are taught anywhere in her essay. It’s a new idea, offered as she exits. She could write a separate essay about it; she doesn’t have to. Really thoughtful.',
    },
    { ...CONCLUSION_STRUCTURE },
    {
      layout: 'passage',
      eyebrow: 'Putting it together',
      title: 'Haley’s conclusion',
      label: 'Question and big final point in colour · “perhaps” highlighted',
      accent: 'teal',
      body: ANNOTATED_CONCLUSION,
      notes:
        'Walk the structure: the rhetorical question; the "perhaps"; a few sentences of opinion and reaction; the solution ("if administrators and teachers prioritized creative lessons…"), the antidote to everything she has argued; then the big final sentence. On the Critical Essay Form the conclusion is the upside-down funnel: specific back out to big. "Imagine the impact this could have on student learning and the teaching profession!"',
    },
    {
      layout: 'compare',
      eyebrow: 'The house analogy',
      title: 'End the tour gracefully',
      left: {
        label: 'Don’t',
        accent: 'coral',
        lines: [
          'Walk them back through every room: “Remember the kitchen?”',
          'Push them out a second-floor window and yell “Tour’s over!”',
        ],
      },
      right: {
        label: 'Do',
        accent: 'teal',
        lines: [
          'Take them out to the back deck, or back to the front door.',
          'Point out the neighborhood, maybe a house next door you won’t visit. Then say a thoughtful goodbye.',
        ],
      },
      sticker: 'A graceful exit',
      notes:
        'You’ve toured them through the living room, the kitchen, the bedrooms. You wouldn’t scream and run away (what many students do), and you wouldn’t repeat the tour. Instead, a back deck: there’s a little bit more. Or the front door, pointing at the neighborhood: some ideas, even new ones, you acknowledge without exploring, placing your house in the greater neighborhood and world. Leave this slide up while students write.',
    },
    {
      layout: 'figure',
      eyebrow: 'Your turn',
      title: 'What it looks like',
      image: 'yawp-editor-conclusion.png',
      accent: 'sunshine',
      callouts: [
        'The Tutor says ==Conclusion Paragraph==',
        'Start with a rhetorical question',
        'Answer it: “Perhaps…”',
        'End on your big, final point',
      ],
      markers: [
        [0.215, 0.078],
        [0.745, 0.245],
        [0.745, 0.33],
        [0.36, 0.415],
      ],
      notes:
        'Today’s YAWP! editor on the Conclusion Paragraph step. This part usually goes fast: once body paragraphs are done they’re in the home stretch. As you work the room, watch the rhetorical questions. Some will be too simple or lead nowhere; help them find a relevant question that springboards their final thoughts. For many students this is the first conclusion like this they have ever built.',
    },
    { layout: 'closer', eyebrow: 'YAWP!', line: 'Next time: titles and finishing touches.', notes: 'Students who finish can reread their whole essay from the top.' },
  ],
};
