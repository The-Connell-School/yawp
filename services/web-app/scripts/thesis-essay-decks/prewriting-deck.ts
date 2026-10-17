/**
 * Lesson 2 of the Thesis-Driven Essay: Pre-Writing.
 *
 * Brian's original "Pre-Writing Slide Deck.pptx" (Teacher Training, Lesson 2),
 * slide for slide, in the hybrid look. His words stay his; what is new is the
 * layout, and speaker notes on every slide drawn from his lesson plan and his
 * training video, so a teacher picking this up cold knows what to say.
 */
import type { HybridDeck } from './deck-types';

export const PREWRITING_DECK: HybridDeck = {
  title: 'Pre-Writing',
  subtitle: 'Thesis-Driven Essay · Lesson 2',
  slides: [
    {
      layout: 'title',
      eyebrow: 'Thesis-Driven Essay · Lesson 2',
      title: 'Pre-Writing',
      subtitle: 'Finding what you actually want to say',
      notes:
        'Refresh their memories: what this assignment is and why we are here, especially for anyone who was out on Day 1. If you can, teach these lessons on consecutive days; the momentum and focus help.',
    },
    {
      layout: 'steps',
      eyebrow: 'Why we’re here',
      title: 'What are we doing here?',
      intro:
        'Over the course of our sessions, you will learn how to write a ==thoughtful, original, critical essay.== To do that, we will:',
      items: ['Analyze and discuss our opinions about the topic', 'Learn a writing process', 'Write a lot'],
      notes:
        'A quick reset of the big picture. Pre-writing is all about critical thinking: it is messy and stream of consciousness, and it gets cleaner and more specific as we go.',
    },
    {
      layout: 'photo',
      eyebrow: 'Warm-up · Observe',
      title: 'Look at this picture.',
      image: 'fallen-man.jpg',
      icon: 'eye',
      accent: 'teal',
      lines: ['What do you ==see?==', 'Just the details. List as many as you can.'],
      notes:
        'The game is "What’s Going On in This Picture?" Ask only what they SEE, not yet what they think is happening. Students can list quietly (a great way to settle a room) or call things out. Point at each detail on the board as it is named and push for more: what is the man on the bike wearing? Which way is he looking? Every student talking about the picture is a win.',
    },
    {
      layout: 'photo',
      eyebrow: 'Warm-up · Analyze',
      title: 'What has happened here?',
      image: 'fallen-man.jpg',
      icon: 'question',
      accent: 'coral',
      lines: [
        'What time of day is it?',
        'Where might this be?',
        'When in history are we?',
        'What is anyone feeling?',
      ],
      notes:
        'Once observation is exhausted, move to analysis: what do they think is happening? Let every theory run; never shut down a student who is engaging. Use the questions to go deeper. Deliveries suggest a morning rush, the shopping bag suggests midday. The cars and clothes put us in the past. Some will spot Paris; hold the reveal. Notice together that nobody seems to be helping the man on the ground.',
    },
    {
      layout: 'quote',
      eyebrow: 'The reveal',
      title: 'Fallen Man, Paris, France, 1967',
      image: 'fallen-man.jpg',
      accent: 'sunshine',
      body: 'I was out on the Right Bank just strolling… and came to this Metro stop and noticed a crowd and a man down, and as I inserted myself into the space to get closer, this worker with the hammer came quickly around the pole to make his way to some construction going on behind me, and BOOM! as he stepped over the man it all came together…',
      attribution: 'Joel Meyerowitz, street photographer',
      notes:
        'Reveal the title and the photographer. This is nearly all we know: a real moment on a real street. Point out that the class just did exactly what a critical essay does: noticed details, asked questions, and built a theory.',
    },
    {
      layout: 'prompt',
      eyebrow: 'The prompt',
      label: 'Option A · Your community',
      title: 'Your essay prompt',
      accent: 'teal',
      body: 'Write an essay about ==a problem in your community== and how we might solve it. “Community” might refer to your neighborhood, school, grade, city, state, country, age group, race, gender, or any other group you belong to. Your essay can focus on any problems that you see or feel. Use your personal experience and observations to develop your position, and evidence from your own experience to support your ideas. How do you propose we solve this problem? Your essay should be organized formally, with ==an introduction, thesis statement, body paragraphs, and a conclusion.==',
      notes:
        'Read it aloud, or have a student read it. Then break it down: what exactly is it asking? What counts as a community? What are you allowed to use as evidence? The key question: what kind of essay is this? A one-paragraph response? No: introduction, thesis statement, body paragraphs, and a conclusion. Optional: ask for a few first ideas.',
    },
    {
      layout: 'prompt',
      eyebrow: 'The prompt',
      label: 'Option B · A book you’ve read',
      title: 'Your essay prompt',
      accent: 'orange',
      body: 'Write a critical essay about ==The Great Gatsby.== You can choose ==any aspect of the novel that interests you.== Consider the themes we’ve discussed, the characters, the settings, or anything you’ve noticed about the story that you think is worthy of discussion. Use your observations and opinions to develop your position, and quotations from the book to support your ideas. Your essay should be organized formally, with ==an introduction, thesis statement, body paragraphs, and a conclusion.==',
      notes:
        'Use this one (with your own book) if the essay is about a text. Students will ask, "Can we really write about anything in the book?" Yes. Narrow prompts produce a hundred near-identical essays nobody cares about; open prompts let students write about what matters to them. Keep a few specific prompts in your pocket for students who want more direction. Delete whichever prompt slide you are not using.',
    },
    {
      layout: 'statement',
      eyebrow: 'Getting started',
      title: 'So, how do you begin writing a critical essay?',
      body: '(Like the one we read together?) ==Let’s look at the form…==',
      icon: 'puzzle',
      accent: 'sunshine',
      notes:
        'Ask how they feel when they first read a prompt: anxious? overwhelmed? confused? excited? It can feel like a lot. Tell them you are going to show them a practical process for getting started.',
    },
    {
      layout: 'figure',
      eyebrow: 'The form',
      title: 'The Critical Essay Form',
      image: 'critical-essay-form.png',
      accent: 'teal',
      callouts: [
        'Introduction',
        '==Thesis statement== ★',
        'Body paragraphs',
        'Conclusion',
        'We never start by typing the introduction. Why?',
      ],
      notes:
        'Walk the form top to bottom. Then ask: should we just open a document and start the introduction? No, because we don’t know exactly what we are saying yet. Which part matters most? The thesis statement, because it is what the essay is about. The handout version of this form is in the Day 1 resources.',
    },
    {
      layout: 'steps',
      eyebrow: 'The MVP',
      title: 'Thesis statement = the MVP of your essay',
      accent: 'coral',
      items: [
        'Without it, your essay might be rambling and disorganized',
        'Great thesis statements lead to great essays',
        '==Don’t ever start an essay until you know what you’re going to say!==',
      ],
      notes:
        'The thesis gives the whole essay direction and focus, so we cannot write the essay until we have it. Land on the question that sets up today: but how do you develop a thesis statement?',
    },
    {
      layout: 'section',
      eyebrow: 'Step 1',
      kicker: 'Step 1',
      title: 'Pre-Writing',
      line: 'But how do you develop a thesis statement?',
      notes:
        'This is the first step of the process and the writing activity for today. Developing a thesis takes time, and it begins with critical thinking: figuring out what we think about a topic.',
    },
    {
      layout: 'compare',
      eyebrow: 'Why pre-write',
      title: 'The problem, and the fix',
      left: {
        label: 'The problem',
        accent: 'coral',
        lines: [
          'Most people just start writing their essays without much understanding of what they’re actually going to say.',
          'This results in really rambling essays that may not make any sense at all (to you or the reader).',
        ],
      },
      right: {
        label: 'The solution: pre-writing',
        accent: 'teal',
        lines: [
          'Take time before you write your essay to critically think about the prompt and to ==develop a thesis statement.==',
          'This simple act will make the difference between a focused, effective essay and a big, hot mess.',
        ],
      },
      notes:
        'Students already did this today with the photo: they noticed, asked, answered, and built a theory. Pre-writing is the same move on the page.',
    },
    {
      layout: 'compare',
      eyebrow: 'Critical thinking',
      title: 'Critical thinking is simply ==asking questions and seeking answers== about a topic.',
      left: {
        label: '3 friends go see a movie…',
        accent: 'sunshine',
        lines: ['“I loved it!” Why? “Because it was awesome.” Why? “Because I loved it.”'],
      },
      right: {
        label: 'The 5-year-old',
        accent: 'pink',
        lines: ['Why? Why? Why? Why? Every answer earns another question.'],
      },
      notes:
        'Movie example: ask the class for a movie in theaters and use a real student as Student A. "I loved it!" Why? "Because it was awesome." Why? "Because I loved it." They know how they feel but can’t say why; that is not analysis yet. Same for "I hated it." Then the 5-year-old who asks why about everything: be that kid. Critical thinking turns opinions into smart, scholarly analysis.',
    },
    {
      layout: 'example',
      eyebrow: 'Pre-write example',
      title: 'Pre-write example: the Creed movies',
      accent: 'teal',
      body: 'I love the Creed movies. **Why?** Because they’re amazing! **Why?** They’re really uplifting. **How?** In that Cinderella story, underdog way. **Are they uplifting in other ways?** Yes, the love story between Adonis and Bianca is really touching, and the relationship between Adonis and Rocky is really moving. **So it’s more than just a sports story?** Definitely—it’s really a movie about relationships and overcoming things. **Like what?** Well, Adonis overcomes the fact that he didn’t really have a dad—Apollo Creed was not really in his life that much, even though he was this huge celebrity back in the day. **How does he overcome that?** I think his relationship with Rocky becomes like the dad he never had. And Rocky is having trouble with his own son. So Rocky and Adonis both fill these father-son roles for each other. And then Adonis gets to be a dad! ==The movies are about boxing, but they’re also about fatherhood and the power of the father-son relationship.==',
      notes:
        'Read it aloud and point at the questions in colour. Each answer earns a new question, and the writer ends somewhere much more specific than where they started: from "they’re amazing" to fatherhood. That ending is a possible thesis.',
    },
    {
      layout: 'example',
      eyebrow: 'Pre-write example',
      title: 'Pre-write example 2: Disney movies',
      accent: 'orange',
      body: 'I love Disney movies. **Why?** They make me feel so happy! **Why?** I really love how in most of the stories the characters go through something hard and challenging. **Like what?** In a lot of them, they lose a parent early in the movie. This leaves them feeling sad and alone. **Then what happens?** Then they usually face some other challenge, like a mean stepmother (Cinderella) or someone trying to hurt them (Lion King) or trying to find a treasure (Aladdin). **How do they handle these challenges?** Almost always someone comes along and helps them—the Fairy Godmother, Simba’s friends, the Genie. **How do they help?** They guide them and show them the way, but they also usually show the main character the gifts and talents they have inside of them. ==That’s interesting—the main character is the hero, but they almost always need a helper character to show them their hero qualities.==',
      notes:
        'Use one example or both. Explain the process they are about to go through in detail: write, ask yourself a question, answer it, repeat.',
    },
    {
      layout: 'steps',
      eyebrow: 'Your turn',
      title: 'Open YAWP! and start pre-writing',
      accent: 'teal',
      items: [
        'Sign in to ==yawp.school==',
        'Open the document you created on Day 1 (don’t create a new one!)',
        'Check out my comments: one way I’ll give you feedback',
        'Make sure the Tutor box says ==“Pre-Writing,”== then follow the Tutor’s instructions',
      ],
      strip: 'yawp-my-documents.png',
      notes:
        'Students find their Day 1 draft under My Documents; its tag shows the step it is on. Before they start, check every student is on the Pre-Writing step, not in a new document. Ask if there are any questions.',
    },
    {
      layout: 'figure',
      eyebrow: 'Your turn',
      title: 'What it looks like',
      image: 'yawp-editor-prewriting.png',
      accent: 'sunshine',
      callouts: [
        'The Tutor is on the left',
        'Check it says ==Pre-writing==',
        'Your prompt and writing are in the middle',
        'My comments are on the right',
        'Written a bunch? Click ==Give me feedback!==',
      ],
      markers: [
        [0.245, 0.2],
        [0.145, 0.078],
        [0.5, 0.55],
        [0.86, 0.25],
        [0.16, 0.947],
      ],
      notes:
        'This is today’s YAWP! editor with a sample pre-write in it. Point to each part of the screen: the Tutor’s pre-writing instructions, the assignment prompt above the page, comments on the right. If you can, project your own screen with a student document open.',
    },
    {
      layout: 'statement',
      eyebrow: 'Pre-writing goal',
      title: 'Figure out your ==specific== topic',
      body: 'Identify a ==specific== problem in your community that you’ll talk about in your essay.',
      icon: 'lightbulb',
      accent: 'sunshine',
      notes:
        'If you used the book prompt, change this to: identify a specific aspect of the book you will talk about in your essay.',
    },
    {
      layout: 'compare',
      eyebrow: 'Pre-writing',
      title: 'Pre-writing: do and don’t',
      left: {
        label: 'Do',
        accent: 'teal',
        lines: [
          'Flesh out ideas',
          'Keep writing!',
          'Ask and answer as many questions as possible',
          'Unleash the 5-year-old within!',
        ],
      },
      right: {
        label: 'Don’t',
        accent: 'coral',
        lines: ['Worry about grammar', '…try to organize your essay', '…stop writing!'],
      },
      sticker: 'Pro-tip: Stay off the internet!',
      notes:
        'Don’t worry about grammar, syntax, or organization. Don’t edit as you go; just get it all out. Pre-writing is a purge: opinions, reactions, ideas, anything goes. The more you write at this stage, the better.',
    },
    {
      layout: 'timer',
      eyebrow: 'Writing time',
      title: 'Pre-write',
      minutes: 5,
      line: 'Ask. Answer. Keep going.',
      accent: 'orange',
      notes:
        'Work the room. After a few minutes, ask individual students if you can quickly read their work. Check in with anyone who isn’t writing. Give positive and constructive feedback. At about five minutes, have them read over what they wrote and ask the Tutor for feedback.',
    },
    {
      layout: 'statement',
      eyebrow: 'Narrowing down',
      title: 'Find the diamonds',
      body: 'A lot of your pre-write will be rambling and might feel kind of random. But there will be parts that stand out: interesting, sharp, worthy of more discussion. ==These are “the diamonds,”== and they could be a specific focus for your essay.',
      icon: 'diamond',
      accent: 'pink',
      notes:
        '"It’s always a good idea to read over what you just wrote. Some of it may be messy, but some moments will stand out." The Tutor helps each student find their diamonds, choose one, and pre-write on it. Give them time: each round gets more specific, until the Tutor wraps up the pre-writing with them.',
    },
    {
      layout: 'grid',
      eyebrow: 'Before you go',
      title: 'What have we learned today?',
      items: [
        'Critical thinking is simply asking and answering questions in a smart way.',
        'Pre-writing is one of the most important steps in the writing process.',
        'Generating ideas requires effort and time. It’s not always easy, but it pays off.',
        'The more questions you ask, the more ideas and theories you start to form.',
        'The internet destroys originality. Stay off it while you pre-write!',
      ],
      notes: 'Ask individual students to read each point aloud.',
    },
    {
      layout: 'equation',
      eyebrow: 'Remember',
      title: 'Generating ideas requires energy. Don’t expect it to be easy.',
      terms: ['Critical thinking', 'Time'],
      result: 'Original ideas',
      line: 'Ask why. Then ask again.',
      notes: 'The takeaway: ideas come from critical thinking plus time. Nobody gets them for free.',
    },
    {
      layout: 'closer',
      eyebrow: 'YAWP!',
      line: 'Next time: thesis statements.',
      notes:
        'Leave this up as they pack up. Next lesson they turn today’s diamond into a thesis statement.',
    },
  ],
};
