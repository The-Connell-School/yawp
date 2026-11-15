/**
 * Lesson 3 of the Thesis-Driven Essay: Developing a Thesis Statement.
 *
 * Brian's "How to Write a Thesis Statement Slide Deck.pptx" (44 slides), in
 * the hybrid look. His words stay his. The review quiz that opens it comes
 * from `shared-slides.ts`. Speaker notes are from his lesson plan and the
 * Lesson 3 training video.
 */
import type { HybridDeck, HybridSlide } from './deck-types';
import { REVIEW_DIVIDER, reviewQuiz } from './shared-slides';

const OBSERVATIONS = [
  'Creative thinking is not prioritized in schools.',
  'Most classroom teachers teach the way they were taught.',
  'Schools place too much emphasis on right and wrong answers.',
];

const ANALYSIS: string[][] = [
  [
    '…this makes school boring for teachers and students',
    '…takes away their motivation and excitement',
    '…they don’t feel as accomplished',
  ],
  [
    '…this creates a situation where old ideas and methods are recycled, and new, current ideas are ignored',
    '…this is an ineffective teaching method',
  ],
  [
    '…this is a limited approach to learning',
    '…it puts too much emphasis on correctness',
    '…it ignores the personal expression of students’ experience',
  ],
];

const THESES = [
  'When schools fail to prioritize creativity in teaching, school becomes boring for both students and teachers, resulting in a lack of shared motivation, excitement, and accomplishment.',
  'Teachers too often teach the way they were taught, which creates an ineffective learning environment where old ideas and methods are recycled, while new, current ideas are ignored.',
  'The education system’s obsession with testing represents a limited approach to learning that puts too much emphasis on right and wrong answers and ignores the personal learning experience of individual students.',
];

const ADD_ANALYSIS_NOTES = [
  'With "creative thinking is not taught enough in schools," the analysis we might offer: this makes school boring for teachers and students; it takes away motivation and excitement; they don’t feel as accomplished as they could if they were creating things.',
  'Second observation. Some analysis: old ideas and methods get recycled and new, current ideas are ignored; or simply, this is an ineffective teaching method. We could offer more; these are two examples.',
  'Third observation. This is a limited approach to learning; it puts too much emphasis on correctness; it ignores the personal expression of students’ experience. Again, there is more analysis available; these are the three we’ll use.',
];

const COMBINE_NOTES = [
  'Combine observation and analysis and you get the thesis from the sample essay. It’s all in there: every piece of the observation and analysis, in one sentence.',
  'Same move: teachers too often teach the way they were taught, which creates an ineffective learning environment where old ideas and methods are recycled while new, current ideas are ignored. One single complex sentence.',
  'And the third: the education system’s obsession with testing represents a limited approach to learning… It’s all in there. A beautiful, complex thesis statement.',
];

const oaSlides = (withThesis: boolean): HybridSlide[] =>
  OBSERVATIONS.map((observation, index) => ({
    layout: 'oa',
    eyebrow: withThesis ? 'Combine O & A to form a thesis' : 'Add analysis',
    title: withThesis ? `Combine them: example ${index + 1}` : `Add analysis: example ${index + 1}`,
    observation: index === 0 && !withThesis ? 'Creative thinking is not taught enough in schools.' : index === 0 ? 'Creativity is not prioritized enough in schools.' : observation,
    analysis: ANALYSIS[index],
    ...(withThesis ? { thesis: THESES[index] } : {}),
    notes: withThesis ? COMBINE_NOTES[index] : ADD_ANALYSIS_NOTES[index],
  }));

export const THESIS_DECK: HybridDeck = {
  title: 'How to Write a Thesis Statement',
  subtitle: 'Thesis-Driven Essay · Lesson 3',
  slides: [
    {
      layout: 'title',
      eyebrow: 'Thesis-Driven Essay · Lesson 3',
      title: 'Thesis Statement',
      subtitle: 'From the mines, with treasure',
      notes:
        'Thesis day. If all goes to plan, by the end of class every student has a strong, complex thesis statement and can begin actually writing. In pre-writing they went down into the mines, digging; today they come up with their treasure. Before you start, check student docs: anyone who still hasn’t found a specific focus may need a few more minutes of pre-writing on their diamond first.',
    },
    REVIEW_DIVIDER,
    ...reviewQuiz(3),
    {
      layout: 'photo',
      eyebrow: 'Warm-up · Observe',
      title: 'What details do you see in this picture?',
      image: 'elephant.jpg',
      icon: 'eye',
      accent: 'teal',
      lines: ['What more can you ==find?==', 'Then: what’s going on in this picture?'],
      notes:
        '"What’s happening in this picture?" again, same process as last time: first only what they SEE. An elephant; people up on store balconies; signs and advertisements; sacks of grain or rice in front; a man in a red and white turban; a cart with blue wire; something in the elephant’s rear (a dart?); a lamppost with exposed wires; motorcycles and bicycles; people running up stairs. Let them go, then ask what they think is going on. When students offer a theory, ask: "What do you see that makes you say that?" That is the observation-to-analysis move they will make in their thesis today. (The New York Times "What’s Going On in This Picture?" series has hundreds more of these.)',
    },
    {
      layout: 'quote',
      eyebrow: 'The reveal',
      title: 'What was going on',
      accent: 'sunshine',
      body: 'This elephant wandered out of a forest and into the streets of a city in North Bengal, India, attacking houses, shops and vehicles over a period of hours. The elephant was finally calmed with three tranquilizer darts. The clash appeared to have a happy ending: the authorities said they returned the creature to the forest.',
      attribution: 'Photo caption, The New York Times',
      image: 'elephant.jpg',
      notes:
        'Read the caption. Plenty of students guess India. Point out what they just did: observed details, then analyzed them into a theory. That is exactly what a thesis statement does.',
    },
    {
      layout: 'statement',
      eyebrow: 'Quick review',
      title: 'What do we need to figure out before we can write a great essay?',
      body: 'Hopefully someone in the room says it: ==a thesis statement.==',
      icon: 'question',
      accent: 'coral',
      notes: 'Let a student answer. The thesis statement: the starred spot at the bottom of the introduction on the form.',
    },
    {
      layout: 'figure',
      eyebrow: 'The form',
      title: 'The Critical Essay Form',
      image: 'critical-essay-form.png',
      accent: 'teal',
      callouts: [
        'Introduction',
        '==Thesis statement== ★ the most important part',
        'Body paragraphs',
        'Conclusion',
      ],
      markers: [
        [0.27, 0.22],
        [0.62, 0.37],
        [0.66, 0.53],
        [0.73, 0.82],
      ],
      notes: 'There it is in our form: starred, the last sentence of the introduction, the most important part of the essay.',
    },
    {
      layout: 'statement',
      eyebrow: 'Remember',
      title: 'Great thesis statements lead to great essays!',
      body: '(And weak or non-existent thesis statements lead to ==weak essays!==)',
      icon: 'lightbulb',
      accent: 'sunshine',
      notes:
        'Pre-writing was a light lift for most kids, and it produced a topic that is theirs. That investment is what keeps them off the internet and off ChatGPT: they already know what they want to say.',
    },
    {
      layout: 'compare',
      eyebrow: 'Where we are',
      title: 'All of your pre-writing…',
      left: {
        label: 'What it’s for',
        accent: 'teal',
        lines: [
          '…serves the purpose of ==narrowing your topic== so that you can write your thesis.',
          'Flush out all of your ideas and opinions about the subject. Ask and answer, ask and answer, ask and answer.',
        ],
      },
      right: {
        label: 'Where it leads',
        accent: 'orange',
        lines: [
          'Your discussion should become more specific as you go, until your answers start to resemble some pretty intelligent thoughts and conclusions.',
          'When you get to this point, you’re very close to ==pinning down your thesis.==',
        ],
      },
      notes:
        'A recap of the pre-writing process, to get them ready to develop a thesis on the specific topic they landed on.',
    },
    {
      layout: 'section',
      eyebrow: 'Step 2',
      kicker: 'Step 2',
      title: 'Develop a Thesis Statement',
      line: 'Observation + analysis, in one sentence.',
      notes:
        'Many students have never written an essay like this, so "thesis statement" may be an abstract idea to them. Don’t dwell on the definition; the examples will do the work.',
    },
    {
      layout: 'statement',
      eyebrow: 'Definition',
      title: 'Your thesis statement represents the ==focal point== of your essay.',
      body: 'Everything else in the essay points back to it.',
      icon: 'diamond',
      accent: 'pink',
      notes: 'Go through these slides with the students. Have them read parts aloud if it keeps them engaged.',
    },
    {
      layout: 'steps',
      eyebrow: 'Wording your thesis statement',
      title: 'Three rules for the sentence',
      accent: 'coral',
      items: [
        'Your thesis should be ==one sentence== long.',
        'Your thesis should include ==observation== as well as ==analysis.==',
        'Your thesis should be ==specific.==',
      ],
      notes:
        'The number one problem with student thesis statements is that they are too general: "There are many themes in The Great Gatsby worth discussing." "Violence is a major problem in my community" is better but could be far more specific. Beware the 5-paragraph habit of three broad reasons; each of those is really its own essay. Specific is the goal.',
    },
    {
      layout: 'statement',
      eyebrow: 'Observation',
      title: 'What do we mean by ==“observation”?==',
      body: 'Ask the room first.',
      icon: 'eye',
      accent: 'teal',
      notes: 'See if students can define it before you show the next slide.',
    },
    {
      layout: 'statement',
      eyebrow: 'Observation',
      title: 'An observation is something we ==notice or see== about a subject.',
      body: 'Like the picture: what we see. Let’s look at some examples…',
      icon: 'eye',
      accent: 'teal',
      notes:
        'The next three observations are all real, from Brian’s students pre-writing on the prompt "What’s wrong with education today?" The first is Haley’s, whose sample essay you may have read with the class.',
    },
    ...OBSERVATIONS.map(
      (observation, index): HybridSlide => ({
        layout: 'statement',
        eyebrow: `Observation · example ${index + 1}`,
        title: 'Is this true? Does it reflect reality?',
        body: `“${observation}”`,
        icon: 'eye',
        accent: 'teal',
        notes:
          index === 0
            ? 'Haley’s observation, from her pre-writing. Ask: is this true? If it reflects reality, it’s true.'
            : index === 1
              ? 'Ask whether it reflects reality. Some kids will say "for some teachers, not for others." If it reflects reality somewhere, it’s true.'
              : 'Does this reflect reality? Yes. So it’s true. All three are good observations.',
      })
    ),
    {
      layout: 'steps',
      eyebrow: 'Observation',
      title: 'Three good observations',
      accent: 'teal',
      items: OBSERVATIONS,
      notes: 'There they all are. Good observations. But…',
    },
    {
      layout: 'statement',
      eyebrow: 'But',
      title: 'So what????',
      body: 'Without ==analysis,== your thesis statement will fall flat.',
      icon: 'question',
      accent: 'coral',
      notes:
        'These are great observations, but they are not thesis statements yet. They are the start of one. Now we add analysis.',
    },
    {
      layout: 'statement',
      eyebrow: 'Analysis',
      title: 'What do we mean by ==“analysis”?==',
      body: 'Ask the room first.',
      icon: 'question',
      accent: 'orange',
      notes: 'Call on students to read these.',
    },
    {
      layout: 'statement',
      eyebrow: 'Analysis',
      title: 'Analysis is a ==reaction, argument, examination, or conclusion== based on an observation.',
      body: 'If I asked what’s happening in the picture and you just said “elephant, motorcycles, people,” I’d wonder what was wrong with you.',
      icon: 'lightbulb',
      accent: 'orange',
      notes:
        'Think about the picture again. Calling out observations is not what I asked for; I asked you to analyze. Now let’s look at some analysis.',
    },
    ...oaSlides(false),
    {
      layout: 'prompt',
      eyebrow: 'Writing activity',
      label: 'On your document',
      title: 'Your observation and analysis',
      accent: 'teal',
      body: 'On your document, create your own ==Observation== and ==2–4 points of analysis.== Use this model:\n\nObservation: Schools place too much emphasis on right and wrong answers.\nAnalysis:\n• this is a limited approach to learning\n• it puts too much emphasis on correctness\n• it ignores the personal expression of students’ experience',
      notes:
        'Their observation is basically the specific topic they arrived at through pre-writing: "my essay is going to be about how schools place too much emphasis on right and wrong answers." Then 2–4 pieces of analysis: opinions, reactions, conclusions. Make sure everyone is on the "Thesis Statement" step at the top of the Tutor. Work the room; don’t sit down. The more specific they get, the better: we’re putting the topic under a microscope. Students sometimes think a long essay needs a big topic; it’s the opposite. Big and general makes a boring essay.',
    },
    {
      layout: 'figure',
      eyebrow: 'Your turn',
      title: 'What it looks like',
      image: 'yawp-editor-thesis.png',
      accent: 'sunshine',
      callouts: [
        'The Tutor says ==Thesis Statement==',
        'Observation first',
        '2–4 points of analysis',
        'Then combine them into your thesis',
      ],
      markers: [
        [0.2, 0.078],
        [0.72, 0.22],
        [0.7, 0.3],
        [0.74, 0.375],
      ],
      notes:
        'Today’s YAWP! editor on the Thesis Statement step, with a sample observation, analysis and thesis typed in. The Tutor’s instructions are on the left; when students have a draft thesis, they can ask the Tutor for feedback.',
    },
    ...oaSlides(true),
    {
      layout: 'equation',
      eyebrow: 'The 2 components of an effective thesis',
      title: 'The equation for a thesis statement',
      terms: ['Observation', 'Analysis'],
      result: 'Complex thesis',
      line: 'Now combine yours.',
      notes:
        'The English equation for a great thesis. Now have students combine their own observation and analysis into one sentence on their document. They can ask the Tutor for feedback; it will help clean up and refine the wording and keep the room moving instead of waiting on you. Watch for the Tutor sterilizing a student’s voice; help them keep their own words.',
    },
    {
      layout: 'statement',
      eyebrow: 'Don’t forget',
      title: 'Crafting a thesis statement that works is vital to the rest of your essay…',
      body: '…so don’t ever begin writing your essay until you’ve created a ==strong thesis statement!==',
      icon: 'thumbs',
      accent: 'sunshine',
      notes:
        'Reinforce it: no essay until the thesis exists. After class, check every document for a working thesis; leave a positive comment, and where one is wordy or tangled, keep the original and add a "Revised thesis" below it so the student can see the difference. Don’t move on to the Introduction lesson until everyone who was here has one.',
    },
    {
      layout: 'steps',
      eyebrow: 'Thesis review',
      title: 'Thesis review',
      accent: 'coral',
      items: [
        'One, complex, ==concise== sentence. (Concise does not equal brief!)',
        'Includes ==observation + analysis.==',
        'Specific, not general.',
      ],
      notes: 'The end of the core lesson. Everything after this is optional: "thesis 2.0."',
    },
    {
      layout: 'section',
      eyebrow: 'Optional',
      kicker: 'Thesis 2.0',
      title: 'Avoid the verb “to be”',
      line: 'Optional: for you, or for a class that’s ready.',
      notes:
        'Optional second half. Use it for your own understanding, or share it if your students’ writing is ready for it. You can also end the lesson here.',
    },
    {
      layout: 'statement',
      eyebrow: 'Thesis 2.0',
      title: 'Avoid the verb ==“to be”==',
      body: 'It creates wordy situations. It’s a little word that needs other words to make it work. For example…',
      icon: 'pencil',
      accent: 'pink',
      notes:
        'It isn’t that "to be" is never allowed. The problem is that it creates wordy situations, which is why some teachers ban it outright.',
    },
    {
      layout: 'example',
      eyebrow: 'With the verb “to be”',
      title: 'Spot the clutter',
      accent: 'pink',
      body: 'Creative design in lesson plans **is** really important and **is** something that **isn’t** taught in teacher training programs.',
      notes: 'Three forms of "to be" in one sentence, and the sentence sags under them.',
    },
    {
      layout: 'statement',
      eyebrow: 'Change to',
      title: 'Teacher training programs don’t emphasize creative design in lesson plans.',
      body: 'This is much better. It gives the sentence a stronger, more direct feel. This is called being ==concise.== And being concise should be your goal in critical writing.',
      icon: 'pencil',
      accent: 'teal',
      notes:
        'Editing "to be" out forces a rephrase. Read the new sentence aloud next to the old one and ask which sounds stronger.',
    },
    {
      layout: 'compare',
      eyebrow: 'Before and after',
      title: 'Edit the verb “to be” out',
      left: {
        label: 'With the verb to be',
        accent: 'coral',
        lines: ['Creative design in lesson plans is really important and is something that isn’t taught in teacher training programs.'],
      },
      right: {
        label: 'Without the verb to be',
        accent: 'teal',
        lines: ['Teacher training programs don’t emphasize creative design in lesson plans.'],
      },
      notes:
        'Taking "to be" out forces a rephrase, and the result is stronger and more direct. This is called being concise, and concise should be the goal in critical writing.',
    },
    {
      layout: 'statement',
      eyebrow: 'But wait',
      title: 'But wait, there’s more!',
      body: 'Now that the “to be” clutter is gone, there’s room for ==more good stuff.==',
      icon: 'lightbulb',
      accent: 'sunshine',
      notes: 'The sentence is shorter now, and that is the point: there is space to say more.',
    },
    {
      layout: 'statement',
      eyebrow: 'Weeding the garden',
      title: 'Room for better stuff to grow',
      body: 'Taking the verb “to be” out of a sentence is like ==weeding a garden:== you remove the stuff you don’t need, and then there’s room for better stuff to grow. Check it out…',
      icon: 'lightbulb',
      accent: 'teal',
      notes: 'Set up the reveal on the next slide: the same sentence, grown into a real thesis.',
    },
    {
      layout: 'thesis-parts',
      eyebrow: 'This can now become this',
      title: 'From a sentence to a thesis',
      accent: 'teal',
      thesis:
        'When teacher training programs do not emphasize creative design in lesson plans, teachers fail to understand their role as entertainers, resulting in boring lessons.',
      parts: [
        { span: 'teacher training programs do not emphasize creative design in lesson plans', label: 'Observation' },
        { span: 'teachers fail to understand their role as entertainers', label: 'Analysis' },
        { span: 'resulting in boring lessons', label: 'Analysis' },
      ],
      notes:
        '"Teacher training programs don’t emphasize creative design in lesson plans" can now become: when teacher training programs do not emphasize creative design in lesson plans, teachers fail to understand their role as entertainers, resulting in boring lessons.',
    },
    {
      layout: 'statement',
      eyebrow: 'Whoa',
      title: 'WHOA, DID YOU SEE THAT??????',
      body: '(How that lame thesis statement from before just became ==kind of awesome?==)',
      icon: 'thumbs',
      accent: 'coral',
      notes: 'That is the power of removing "to be": it clears out words that have no power of their own. Officially the end of the lesson.',
    },
    {
      layout: 'closer',
      eyebrow: 'YAWP!',
      line: 'Next time: introductions.',
      notes:
        'Before next class, read through the theses and comment. Everyone needs a working thesis before they start the introduction; absent students can catch up with the Tutor.',
    },
  ],
};
