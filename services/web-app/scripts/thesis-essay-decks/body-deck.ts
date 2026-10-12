/**
 * Lesson 5 of the Thesis-Driven Essay: Body Paragraphs.
 *
 * Brian's "Body Paragraphs Slide Deck.pptx" (24 slides), in the hybrid look,
 * plus a current screenshot of the editor on the Body Paragraphs step. His
 * last slide was only the title "House Analogy" and he told the story from
 * memory; it is now a slide any teacher can teach from (`HOUSE_ANALOGY`).
 * Notes are from his lesson plan and the Lesson 5 training video.
 */
import type { HybridDeck } from './deck-types';
import { SAMPLE_BODY, SAMPLE_INTRODUCTION, SAMPLE_THESIS, SAMPLE_THESIS_PARTS } from './sample-essay';
import { HOUSE_ANALOGY, reviewQuiz } from './shared-slides';

const italicThesis = (text: string) => text.replace(SAMPLE_THESIS, `__${SAMPLE_THESIS}__`);

/** The first sentence of a paragraph, highlighted: its topic sentence. */
function withTopicSentence(paragraph: string): string {
  const end = paragraph.indexOf('. ') + 1;
  return `==${paragraph.slice(0, end)}==${paragraph.slice(end)}`;
}

const ELEMENTS = SAMPLE_THESIS_PARTS.map((part, index) => ({
  span: part.span,
  label: ['1st element', '2nd element', '3rd element'][index],
}));

export const BODY_DECK: HybridDeck = {
  title: 'Body Paragraphs',
  subtitle: 'Thesis-Driven Essay · Lesson 5',
  slides: [
    {
      layout: 'title',
      eyebrow: 'Thesis-Driven Essay · Lesson 5',
      title: 'Body Paragraphs',
      subtitle: 'Let your thesis be your guide',
      notes:
        'A turning point: with a solid intro ending on a strong thesis, students start to realize they’re actually writing a great essay. Before class, read their intros and comment; some will need a transition sentence linking the intro to the thesis. Start class with them opening their YAWP! docs and rereading their intro and thesis. A little show-and-tell helps: have a few students read theirs aloud. Being read gives them a sense of audience, and that lifts them up.',
    },
    ...reviewQuiz(5),
    {
      layout: 'figure',
      eyebrow: 'The form',
      title: 'The Critical Essay Form',
      image: 'critical-essay-form.png',
      accent: 'teal',
      callouts: ['Introduction', 'Thesis statement ★', '==Body paragraphs== ← today', 'Conclusion'],
      notes:
        'Keep reinforcing the shape, so later in the year (or in other classes) they already carry the structure of a critical academic essay. Ask where the thesis goes: the last sentence of the intro. Not a hard rule for all writing, but it is for this essay.',
    },
    {
      layout: 'section',
      eyebrow: 'Step 4',
      kicker: 'Step 4',
      title: 'Supporting Paragraphs',
      line: 'Let your thesis be your guide.',
      notes: 'Today: the body of the essay, the bulk of the work. It may take several class periods.',
    },
    {
      layout: 'statement',
      eyebrow: 'The rule',
      title: 'Everything after the thesis serves the thesis',
      body: 'Once you’ve dropped your thesis at the end of your introduction, everything you write must in some way ==support, define, or illustrate== the elements within your thesis.',
      icon: 'puzzle',
      accent: 'teal',
      notes: 'Your job now that the thesis is down: illustrate, support and define the argument you put forth.',
    },
    {
      layout: 'statement',
      eyebrow: 'The good news',
      title: 'Your thesis is a roadmap',
      body: 'The good news is that your thesis statement tells you ==exactly where to go from here.==',
      icon: 'lightbulb',
      accent: 'sunshine',
      notes: 'It’s kind of amazing, actually. Let’s look at the sample essay’s thesis.',
    },
    {
      layout: 'quote',
      eyebrow: 'The sample essay’s thesis',
      title: 'Haley’s thesis',
      accent: 'teal',
      body: SAMPLE_THESIS,
      attribution: 'Haley, “Bored in the USA”',
      notes: 'Read it aloud. Ask: how many distinct parts can you hear in this sentence?',
    },
    {
      layout: 'thesis-parts',
      eyebrow: 'Let your thesis be your guide',
      title: 'Break your thesis into its parts',
      accent: 'teal',
      thesis: SAMPLE_THESIS,
      parts: ELEMENTS,
      notes:
        'Three distinct parts in Haley’s thesis. The first is her original observation; the second and third are her analysis. Now have students do the same on their own thesis: make sure they’re on the Body Paragraphs step and follow the Tutor’s instructions for breaking it into parts. Have them check they agree with how it’s split, and highlight each part in its own colour in their doc; the visual keeps them organized.',
    },
    {
      layout: 'thesis-parts',
      eyebrow: 'Let your thesis be your guide',
      title: 'These become your body paragraphs',
      accent: 'teal',
      thesis: SAMPLE_THESIS,
      parts: SAMPLE_THESIS_PARTS,
      notes:
        'Body paragraph 1 is devoted only to how schools fail to prioritize creativity: examples, comments, analysis, "why is this the case?" Then paragraph 2 shows the consequence, school becomes boring, for both teachers and students. Then paragraph 3, the result. A very logical flow. Important: not every thesis has three parts. Two to four is usual, occasionally five, and one complex part can need two or three paragraphs. Don’t teach it like a required number of paragraphs, or students will think this is the 5-paragraph essay.',
    },
    {
      layout: 'steps',
      eyebrow: 'Basic structure of a body paragraph',
      title: 'One paragraph at a time',
      accent: 'orange',
      items: [
        '==Transition sentence== (optional)',
        '==Topic sentence:== the element from your thesis you’re discussing',
        '==Supporting sentences:== explanations, opinions and analysis, causes or effects, research (only if needed, and cite it), the 5 W’s',
        '==Concluding sentence:== wrapping up your thoughts on this element',
      ],
      notes:
        'Tell them: you’re not just writers, you’re thinkers who write; and you’re the architects of your essay, building it paragraph by paragraph. Not everyone believes they can write 2–4 pages, but everyone can write a paragraph when they know what it’s about. The topic sentence calls back to that part of the thesis. A transition can bridge from the paragraph before: "Not only does this lack of creativity exist in schools, but it also…" For support, the 5 W’s (who, what, where, when, why) are a quick way to analyze. Brian’s preference for the concluding sentence: a consequence of the point, not a "but wait, there’s more" tease of the next one. Leave this slide up while they write.',
    },
    {
      layout: 'section',
      eyebrow: 'Read together',
      kicker: 'Read together',
      title: 'Read Sample Essay',
      line: 'Watch each paragraph call back to one part of the thesis.',
      notes: 'Reread the sample essay together so students see exactly how Haley used her body paragraphs to expand each element of her thesis.',
    },
    {
      layout: 'passage',
      eyebrow: 'Sample essay',
      title: 'Introduction and body paragraph 1',
      label: 'Topic sentences highlighted · thesis in italics',
      accent: 'teal',
      body: `${italicThesis(SAMPLE_INTRODUCTION)}\n\n${withTopicSentence(SAMPLE_BODY[0])}`,
      notes:
        'The first body paragraph calls back to the first element: "Visit most schools in America today and you’ll see how much creativity they really lack." Then: what are the priorities instead? Why don’t teachers prioritize creativity (fear of disruption)? Who else is to blame (administrators)? Finally, why it matters.',
    },
    {
      layout: 'passage',
      eyebrow: 'Sample essay',
      title: 'Body paragraph 2',
      label: `Thesis part 2 · ${SAMPLE_THESIS_PARTS[1].span}`,
      accent: 'sunshine',
      body: withTopicSentence(SAMPLE_BODY[1]),
      notes:
        'Body paragraph 2: the consequence. Rhetorical questions, a real statistic with its source cited (The 74), and both halves of the element: students AND teachers.',
    },
    {
      layout: 'passage',
      eyebrow: 'Sample essay',
      title: 'Body paragraph 3',
      label: `Thesis part 3 · ${SAMPLE_THESIS_PARTS[2].span}`,
      accent: 'coral',
      body: withTopicSentence(SAMPLE_BODY[2]),
      notes:
        'Body paragraph 3: the result, and a turn toward a remedy (administrators supporting creative teaching), which sets up the conclusion nicely.',
    },
    {
      layout: 'figure',
      eyebrow: 'Your turn',
      title: 'What it looks like',
      image: 'yawp-editor-body.png',
      accent: 'sunshine',
      callouts: [
        'The Tutor says ==Body Paragraphs==',
        'Your thesis, in its parts',
        'One paragraph per part',
        'Written one? Ask the Tutor for feedback',
      ],
      notes:
        'Today’s YAWP! editor on the Body Paragraphs step. Students start with the first element of their thesis only. Work the room, read paragraphs, encourage; you’ll see confidence rise as the essays take shape. Celebrate it.',
    },
    { ...HOUSE_ANALOGY },
  ],
};
