/**
 * Lesson 7 of the Thesis-Driven Essay: Titles and Formatting.
 *
 * Brian's "Titles and Formatting Slide Deck.pptx" (20 slides), in the hybrid
 * look, plus a current screenshot of a finished essay in the editor. His
 * finishing-touches slide was written for a word processor (font size 12,
 * single-space); it now says what to do in the YAWP! editor. This lesson has
 * no lesson plan, so the notes come from the Lesson 7 training video.
 */
import type { HybridDeck } from './deck-types';
import { CONCLUSION_STRUCTURE, reviewQuiz } from './shared-slides';

const TITLES = [
  'Beyond the Boys’ Club: How Female Heroes Define the Avengers Legacy',
  'Bored in the USA: How Lack of Creativity in Schools Hurts Students and Teachers',
  'Unlocked and Loaded: How Easy Gun Access Puts Children at Risk',
];

export const TITLES_DECK: HybridDeck = {
  title: 'Titles and Formatting',
  subtitle: 'Thesis-Driven Essay · Lesson 7',
  slides: [
    {
      layout: 'title',
      eyebrow: 'Thesis-Driven Essay · Lesson 7',
      title: 'Titles',
      subtitle: 'The cherry on top, and the finishing touches',
      notes:
        'The last day of the program. Students have written their introductions, theses, body paragraphs and conclusions; all that’s left is the title. The title is the cherry on top of the ice cream sundae that is a great essay. We’ve all seen "English Essay" and "My Paper." Our students have invested real time in something original, so they deserve a title that is too.',
    },
    {
      layout: 'section',
      eyebrow: 'Course review',
      kicker: 'Optional',
      title: 'Course Review',
      line: 'Everything you’ve learned, one question at a time.',
      notes:
        'Optional: run the whole review as a final quiz, maybe for an easy grade to reward their hard work. Delete these slides if you don’t want them.',
    },
    ...reviewQuiz(6),
    {
      ...CONCLUSION_STRUCTURE,
      notes:
        'The one question students still get wrong: some cling to "a good conclusion restates the thesis." Here’s the structure again for anyone still finishing. The Tutor shows this structure in its box too.',
    },
    {
      layout: 'section',
      eyebrow: 'Step 6',
      kicker: 'Step 6',
      title: 'Titling Your Essay',
      line: 'Informative, smart, and memorable.',
      notes: 'Now the title. A lot of people dread it, but with the colon-title model it becomes pretty easy and quick.',
    },
    {
      layout: 'steps',
      eyebrow: 'Give your essay a title',
      title: 'The colon title',
      accent: 'sunshine',
      intro:
        'Your title should be ==informative, smart, and memorable.== Don’t ever, ever, EVER title your essay “Essay” or “English Paper.” Let it indicate your topic in a thoughtful way. Try the colon title:',
      items: TITLES,
      notes:
        'Read the three aloud. With each one we know exactly what the essay is about, and it makes us want to read it. The second is the sample essay’s.',
    },
    {
      layout: 'thesis-parts',
      eyebrow: 'Give your essay a title',
      title: 'Two halves, one great title',
      accent: 'sunshine',
      thesis: TITLES[0],
      parts: [
        { span: 'Beyond the Boys’ Club', label: 'Left of the colon · creative, fun' },
        { span: 'How Female Heroes Define the Avengers Legacy', label: 'Right of the colon · clear, direct' },
      ],
      notes:
        'Each title has two parts. The left side is a creative or "fun" element; the right side delivers a clear, direct description of the topic. Alone, each would be ordinary at best and confusing at worst: "Beyond the Boys’ Club" could be about single-sex schools, fraternities, men in politics… The right side gives it context; the left side gives the right side flavor. The right side doesn’t have to start with "How" (all three just happen to). The Tutor knows the colon title too and can help students draft and revise theirs.',
    },
    {
      layout: 'section',
      eyebrow: 'Finish',
      kicker: 'Finish',
      title: 'Putting it All Together',
      line: 'Clean up, title, submit, celebrate.',
      notes: 'The last stretch: clean up the document, put the title on it, format it simply, and submit.',
    },
    {
      layout: 'steps',
      eyebrow: 'Finishing touches in YAWP!',
      title: 'Finishing touches',
      accent: 'teal',
      items: [
        '==Clean up.== Delete your pre-writing, your observation and analysis notes, and headings like “Introduction.” Only the essay stays.',
        '==Title it.== Type your title on the first line, then use the toolbar to ==center== and ==italicize== it.',
        '==Keep it simple.== YAWP! sets the font for you. Paragraphs stay left-aligned (only the title is centered), with an empty line between them.',
        '==Read it, then Submit.== Read it once from the top, ask the Tutor for feedback if you want, then click ==Submit.==',
      ],
      notes:
        'Brian: "Be normal with your formatting. This is not the place to be creative." Some students like to center everything or pick fancy fonts; don’t. If you have your own formatting standard, use it. Then celebrate: ask students for a reflection on the process, or have them highlight their favorite part of their essay and add a comment saying why. Share the work: within the class, with other teachers or administrators. (The YAWP! program can also publish a class’s essays as a printed book.)',
    },
    {
      layout: 'figure',
      eyebrow: 'Done',
      title: 'What finished looks like',
      image: 'yawp-editor-final.png',
      accent: 'sunshine',
      callouts: [
        'Title on the first line, ==centered and in italics==',
        'Only the essay: no notes or headings',
        'Paragraphs left-aligned',
        'Then click ==Submit==',
      ],
      notes:
        'A finished essay in today’s YAWP! editor, ready to submit. They wrote a critical, thesis-driven essay that could stand up in any high school or college classroom. Good work!',
    },
  ],
};
