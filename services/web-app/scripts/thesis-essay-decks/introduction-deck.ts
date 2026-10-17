/**
 * Lesson 4 of the Thesis-Driven Essay: Introduction Paragraph.
 *
 * Brian's "Introduction Paragraph Slide Deck.pptx" (23 slides), in the hybrid
 * look, plus a current screenshot of the editor on the Introduction step.
 * Notes are from his lesson plan and the Lesson 4 training video.
 */
import type { HybridDeck, HybridSlide } from './deck-types';
import { SAMPLE_THESIS } from './sample-essay';
import { REVIEW_DIVIDER, reviewQuiz } from './shared-slides';

const TERMS_SHUFFLED = ['City', 'Continent', 'Neighborhood', 'Country', 'Universe', 'State', 'Planet'];
const TERMS_ORDERED = ['Universe', 'Planet', 'Continent', 'Country', 'State', 'City', 'Neighborhood'];

const IRON_MAN_SHUFFLED = [
  'Across these movies, Iron Man is sometimes portrayed as arrogant, self-centered, elitist, and reckless.',
  'One of those relationships is with Pepper Potts, and the other is with Peter Parker’s Spider-Man.',
  'Iron Man is featured in 9 MCU movies.',
  'However, two relationships help him develop less selfish and more human qualities.',
  'There are 29 movies in the Marvel Cinematic Universe.',
];
const IRON_MAN_ORDERED = [
  'There are 29 movies in the Marvel Cinematic Universe.',
  'Iron Man is featured in 9 MCU movies.',
  'Across these movies, Iron Man is sometimes portrayed as arrogant, self-centered, elitist, and reckless.',
  'However, two relationships help him develop less selfish and more human qualities.',
  'One of those relationships is with Pepper Potts, and the other is with Peter Parker’s Spider-Man.',
];

const thesis = `__${SAMPLE_THESIS}__`;

const STYLES: { label: string; title: string; body: string; notes: string }[] = [
  {
    label: 'Style 1',
    title: 'Illustrating story or scene',
    body: `Ms. Rodriguez watches as 28 ninth graders stare blankly at their worksheets, the only sound the fluorescent lights humming overhead. She had once dreamed of inspiring young minds, but now finds herself mechanically walking through the same lesson plan she's used for five years. In the back row, students doodle in their notebooks and struggle to stay awake. Throughout the school, teachers click through PowerPoint slides and tell students to stop talking, while kids daydream and stare at the clock. This scene plays out in classrooms across the country, where both educators and students have lost the spark that should define learning. This may be because schools have lost a sense of what really works in terms of motivating students to learn. ${thesis}`,
    notes:
      'Read it aloud, or have a student read it. A story or scene feels like a story: description, maybe a character, even dialogue. It brings the reader into a shared scene you can refer back to later, and it gives a really good example of the thing you’re talking about. Point out that it starts general and narrows, and that the thesis (in italics) is the last sentence. If you used a different sample essay, consider writing your own example of each style that ends on that essay’s thesis.',
  },
  {
    label: 'Style 2',
    title: 'Rhetorical question',
    body: `Do you remember trying to learn how to ride a bike? It was exciting, blood rushing, and challenging, but worth it. When you got going but fell, you got back up and went a little further each time. You had more motivation to keep going because it was exciting. Schools today seem to lack this sense of excitement. Students have zero motivation to keep going because there is no excitement from the teachers and no sense of an end goal for the students. Shouldn't the process of learning be inspiring and exciting for everyone? ${thesis}`,
    notes:
      'Define it. Most students will say a rhetorical question is one that isn’t supposed to be answered. True, but the real idea: the writer asks it so they can supply the answer they want the reader to hear. Haley asks about learning to ride a bike, then answers: exciting, blood rushing, challenging, but worth it. That answer is exactly what she wants us to believe school should be.',
  },
  {
    label: 'Style 3',
    title: 'Quotation or fact',
    body: `Albert Einstein once said, “It is the supreme art of the teacher to awaken joy in creative expression and knowledge.” But walk into most American classrooms today and you'll find the opposite: students mechanically filling out worksheets while teachers follow rigid scripts designed to meet testing requirements. The joy Einstein spoke of has been replaced by compliance and conformity. Both students and educators go through the motions of learning without the spark of curiosity or discovery that should drive education. ${thesis}`,
    notes:
      'A relevant quote is a strong opener. If students are writing about a book, article or essay, a quote from that text is a great start; teach the TAG method (title, author, genre) to set it up: "In the essay The American Scholar, Ralph Waldo Emerson states…"',
  },
  {
    label: 'Style 4',
    title: 'Definition',
    body: `Education, by definition, is the process of facilitating learning, or the acquisition of knowledge, skills, values, and habits. This definition suggests an active, dynamic exchange between teacher and student—a collaborative journey of discovery and growth. However, in many of today's classrooms, education has become something far more mechanical: the transfer of standardized information from textbook to test, with little regard for genuine understanding or intellectual curiosity. Students sit in rows, passively receiving information they'll quickly forget after the exam, while teachers feel constrained by rigid curricula that leave no room for innovation. This results in ineffective learning environments. ${thesis}`,
    notes:
      'A definition brings the reader in and gets everyone agreeing on what we’re talking about. It doesn’t have to be literal ("Dictionary.com defines…"). It can be useful for a term that really needs it, like duality, but warn students not to define what doesn’t need defining: "Dictionary.com defines student as a person who learns." Really?',
  },
];

export const INTRODUCTION_DECK: HybridDeck = {
  title: 'Introduction Paragraph',
  subtitle: 'Thesis-Driven Essay · Lesson 4',
  slides: [
    {
      layout: 'title',
      eyebrow: 'Thesis-Driven Essay · Lesson 4',
      title: 'Introduction',
      subtitle: 'Welcome your reader in, then hand them your thesis',
      notes:
        'Today students begin, and some finish, their introductions, which end with their thesis statement. Before you start: everyone who has been in class should have a working thesis (absent students can catch up). The thesis is the first real milestone, and once it works the essay almost writes itself. Celebrate it; have a few students share theirs aloud or with a partner.',
    },
    REVIEW_DIVIDER,
    ...reviewQuiz(4),
    {
      layout: 'ordering',
      eyebrow: 'Warm-up',
      title: 'Place the following 7 terms in order:',
      items: TERMS_SHUFFLED,
      accent: 'teal',
      notes:
        'Individually, in pairs or in teams. The instructions are deliberately vague. If they ask "what order?", just say "an order that works." Don’t tell them it’s largest to smallest. Most get there fast (smallest to largest works too); the odd one will go alphabetical.',
    },
    {
      layout: 'ordering',
      eyebrow: 'Warm-up · reveal',
      title: 'Place the following 7 terms in order:',
      items: TERMS_ORDERED,
      numbered: true,
      accent: 'teal',
      notes:
        'Ask why they chose that order. Brian’s Google Earth picture: type in an address and it starts you out in space, then zooms to the planet, the continent, the country, the state, and down into the neighborhood. Boop: there’s your address. That is the mentality for an introduction.',
    },
    {
      layout: 'ordering',
      eyebrow: 'Warm-up, round 2',
      title: 'Place the following sentences in order:',
      items: IRON_MAN_SHUFFLED,
      accent: 'coral',
      notes:
        'Read the five sentences aloud so everyone is together. Students only need to write the numbers, not the sentences. They usually need a minute or two.',
    },
    {
      layout: 'ordering',
      eyebrow: 'Warm-up, round 2 · reveal',
      title: 'Broad to specific, one thread at a time',
      items: IRON_MAN_ORDERED,
      numbered: true,
      accent: 'coral',
      notes:
        'Have a team share, then break it down: very broad (29 movies) to very specific (two relationships). Point out that each sentence reaches up to the one above and brings down a thread: nine of those 29; across these nine; however, two relationships; one of those two. Each one logically leads to the next. That is what their introduction will do.',
    },
    {
      layout: 'section',
      eyebrow: 'Milestone',
      kicker: 'Milestone',
      title: 'Now you can begin writing your essay.',
      notes: 'Reinforce it: never start writing an essay until you have your thesis statement. Now they can.',
    },
    {
      layout: 'section',
      eyebrow: 'Step 3',
      kicker: 'Step 3',
      title: 'The Introduction',
      line: 'Start at the very beginning.',
      notes: 'A very nice place to start.',
    },
    {
      layout: 'statement',
      eyebrow: 'Introduction paragraph',
      title: 'What an introduction is for',
      body: 'Your introduction’s function is to ==welcome your reader== into your discussion and to ==prepare them to understand your thesis statement.==',
      icon: 'thumbs',
      accent: 'teal',
      notes:
        'That’s it. We would never begin with the thesis: it’s too complex. Tell students their theses are so beautiful and pack such a punch that the reader needs to be prepared for them. There’s a handout in the resources with the next few slides on it.',
    },
    {
      layout: 'steps',
      eyebrow: 'Choose one',
      title: 'Different introduction styles',
      accent: 'sunshine',
      items: ['Story or example that illustrates your topic', 'Quotation', 'Rhetorical question', 'Definition'],
      notes:
        'Four options. All four examples that follow end on the same thesis, the one from the sample essay. Make sure students know they will write their own intro today; raising the stakes helps them pay attention to the examples.',
    },
    ...STYLES.map(
      (style): HybridSlide => ({
        layout: 'passage',
        eyebrow: style.label,
        title: style.title,
        label: 'Example introduction · the thesis is in italics',
        body: style.body,
        accent: 'teal',
        notes: style.notes,
      })
    ),
    {
      layout: 'prompt',
      eyebrow: 'Writing activity',
      label: 'On your document',
      title: 'Write your introduction',
      accent: 'orange',
      body: 'Choose an introduction style that speaks to you and begin your essay:\n\n• Story or example that illustrates your topic\n• Rhetorical question\n• Quotation or fact\n• Definition\n\nRemember, the ==final sentence of your introduction is your thesis statement!== It’s already written.',
      notes:
        'Writing is decision making: this is the moment they decide how to start. On their document, a heading ("Introduction"), and they can paste their thesis below it so they know where they’re heading. Combining styles is fine if it’s intentional; ask students which style they chose as you walk around. Decide your policy on "I": a personal story may need it. They can ask the Tutor for feedback; it won’t write the intro for them, but it may suggest, say, a transition sentence before the thesis.',
    },
    {
      layout: 'figure',
      eyebrow: 'Your turn',
      title: 'What it looks like',
      image: 'yawp-editor-introduction.png',
      accent: 'sunshine',
      callouts: [
        'The Tutor says ==Introduction==',
        'A heading for your introduction',
        'Thesis already at the bottom',
        'Written some? Ask the Tutor for feedback',
      ],
      markers: [
        [0.215, 0.078],
        [0.4, 0.22],
        [0.735, 0.44],
        [0.16, 0.947],
      ],
      notes:
        'Today’s YAWP! editor on the Introduction step with a sample introduction leading into its thesis. Students are always amazed how fast the intro comes once they know their options.',
    },
    {
      layout: 'closer',
      eyebrow: 'YAWP!',
      line: 'Next time: body paragraphs.',
      notes:
        'Before next class, read through the introductions and comment. Some will need a transition sentence linking the intro to the thesis; help with that.',
    },
  ],
};
