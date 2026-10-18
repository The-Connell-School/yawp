/**
 * Lesson 1 of the Thesis-Driven Essay: Introduce Students to YAWP! (Day 1).
 *
 * Brian's "Day 1 Intro to YAWP! Slide Deck.pptx" (13 slides), in the hybrid
 * look. His own Two Truths and a Lie slides stay as they are; their notes
 * tell teachers to make their own the same way, or delete them. His last
 * slide (a screenshot of the old sign-up and Welcome exercise) is now three
 * slides of today's free-tier join flow: the teacher's join link, the
 * student's sign-up page, and the dashboard they land on. Notes are from his
 * lesson plan and the Lesson 1 training video.
 */
import type { HybridDeck } from './deck-types';

const MAKE_YOUR_OWN =
  'These are Brian’s own slides, left as an example. Make your own the same way: three statements about you, two true and one believable lie, and a photo or two that make you human (self-deprecating works best). Or delete these slides and play the game without them.';

export const DAY_ONE_DECK: HybridDeck = {
  title: 'Introduce Students to YAWP!',
  subtitle: 'Thesis-Driven Essay · Lesson 1',
  slides: [
    {
      layout: 'title',
      eyebrow: 'Thesis-Driven Essay · Lesson 1',
      title: 'Day 1',
      subtitle: 'Introduce students to YAWP!',
      notes:
        'A light day of definition and context: what we are doing and why. Brian takes a full class period; you can also fold it into another lesson. Goals: students understand the purpose of YAWP!, read a sample essay, and create their YAWP! accounts. Have the sample essay (“Bored in the USA,” or your own) printed or shared, and your class’s join link ready.',
    },
    {
      layout: 'steps',
      eyebrow: '2 Truths and a Lie',
      title: '2 Truths and a Lie',
      accent: 'teal',
      intro: 'The rules: the ==truths have to be true,== and the ==lie has to be believable.== Which one is the lie?',
      items: [
        'I have a twin who is a blonde-haired version of me.',
        'I was born in Canada.',
        'I met my wife in high school.',
      ],
      notes: `${MAKE_YOUR_OWN} How Brian plays it: let students ask questions and "vibe it out," take guesses, then a vote by show of hands for each one. The reveal: he was not born in Canada.`,
    },
    {
      layout: 'photo',
      eyebrow: 'The reveal',
      title: 'I am Brian Connell',
      image: 'brian-twins.jpg',
      accent: 'teal',
      lines: [
        'I’m here because I ==love writing== and helping other people become better writers.',
      ],
      notes: `${MAKE_YOUR_OWN} Brian’s line: "Here’s my blonde-haired, blue-eyed twin brother Patrick and me, on our first day of kindergarten at a school that made us wear these uniforms. I’m obviously the handsome fella on the left."`,
    },
    {
      layout: 'photo',
      eyebrow: 'The reveal',
      title: 'I am also Brian Connell',
      image: 'brian-1990s.jpg',
      accent: 'sunshine',
      lines: ['(The late 1900s were ==amazing.==)'],
      notes: `${MAKE_YOUR_OWN} Brian’s line: "A short 12 or 13 years later, I looked like this. My wife and I did in fact meet in high school; this is us in our freshman year of college."`,
    },
    {
      layout: 'statement',
      eyebrow: '2 Truths and a Lie',
      title: 'Your turn…',
      body: 'Write your own. Remember, the truths have to be true, and ==the lie has to be believable!==',
      icon: 'pencil',
      accent: 'coral',
      notes:
        'Students write three statements at their desks. Keep the lies believable ("I have eight children" or "I can fly" won’t work). Then share with a neighbor or table and guess. Watch the room come to life. Invite a few to try to stump the whole class, or you. The point is to disarm the room and have fun together at the top of the program.',
    },
    {
      layout: 'section',
      eyebrow: 'What is a yawp?',
      kicker: 'What is a yawp?',
      title: 'YAWP!',
      line: 'Writing Program',
      notes: 'Now introduce the program itself.',
    },
    {
      layout: 'quote',
      eyebrow: 'Walt Whitman',
      title: 'What do you think “yawp” means?',
      accent: 'sunshine',
      body: 'I sound my barbaric yawp over the roofs of the world.',
      attribution: 'Walt Whitman, “Song of Myself”',
      notes:
        'Ask what they think "yawp" means. A yell, a sound, a scream from a rooftop: all good. Say "yes, and" to every answer; how you respond matters to the whole room, not just the student who spoke. Then Brian’s framing: your yawp is your voice. Imagine everything inside you, your thoughts, opinions, experiences, relationships, the music in your head, and give it all one big, mighty sound. That is your yawp, and it is unique to you. In this program we unleash it through writing.',
    },
    {
      layout: 'steps',
      eyebrow: 'Why do we write?',
      title: 'Why do we write?',
      accent: 'coral',
      items: [
        'Because we have ==things to say!== (Our individual “yawp.”)',
        'Because writing is one of the most effective ways of ==expressing ourselves.== (What other ways can we express ourselves?)',
        'Because ==writing is power.==',
      ],
      notes:
        'Lead a quick discussion. How might a happy person express it without words? (Smile, laugh.) An angry one? Then: writing articulates something for yourself and others, and it lasts. That permanence is why writing is power. Most students hear this and think, "I want some of that." Day 1 is about getting them to buy in.',
    },
    {
      layout: 'section',
      eyebrow: 'Read together',
      kicker: 'Sample essay',
      title: '“Bored in the USA”',
      line: 'Highlight anything you find interesting.',
      notes:
        'Use "Bored in the USA" (the Sample essay handout, next to this deck in the Modules), or your own sample, as long as it follows our form (intro ending in a thesis, body paragraphs, conclusion). Everyone has a copy. Before reading, ask everyone to underline or highlight anything interesting, at least one thing per paragraph. Volunteers read aloud, a paragraph each. Don’t overanalyze.',
    },
    {
      layout: 'steps',
      eyebrow: 'Class discussion',
      title: 'Class discussion',
      accent: 'teal',
      items: ['What do you like about this essay?', 'Do you agree with the writer?', 'What is the ==main point or argument?=='],
      notes:
        'Keep it simple: "Tell me one thing you underlined and why." The point is that they’re talking. The question you must land is the third: the main point is the thesis statement, the last sentence of the introduction. Have everyone underline it. It’s one sentence that captures the main argument of the whole essay, and you’ll come back to it for weeks.',
    },
    {
      layout: 'figure',
      eyebrow: 'The form',
      title: 'The Critical Essay Form',
      image: 'critical-essay-form.png',
      accent: 'teal',
      callouts: ['Introduction', '==Thesis statement== ★ the sentence you just underlined', 'Body paragraphs', 'Conclusion'],
      markers: [
        [0.27, 0.22],
        [0.62, 0.37],
        [0.66, 0.53],
        [0.73, 0.82],
      ],
      notes:
        'The shape of the essay they just read and the one they are about to write. Point at the thesis: the most important part, the last sentence of the intro. Don’t spend long here; it’s also a handout, and you’ll come back to it.',
    },
    {
      layout: 'steps',
      eyebrow: 'Why we’re here',
      title: 'What are we doing here?',
      accent: 'orange',
      intro:
        'Over the course of our sessions, you will learn how to write a ==thoughtful, original, critical essay== like the one we just read. To accomplish this, we will:',
      items: ['Analyze and discuss our opinions about the topic', 'Learn a writing process', 'Write a lot'],
      notes: 'You can tell them the topic is coming later. This is a writing class: they’ll spend real time writing and thinking about what they think.',
    },
    {
      layout: 'steps',
      eyebrow: 'Get everyone in',
      title: 'Share your class’s join link',
      accent: 'teal',
      items: [
        'Open your class in YAWP! and go to its ==Students== tab',
        'Copy the ==join link==, or put the QR code up on the board',
        'Students open it on their device and create an account',
        'No email needed: just a ==handle== and a password',
      ],
      strip: 'yawp-join-link-card.png',
      notes:
        'The current sign-up flow. Each class has its own join link and QR code on its Students tab. The class code shown there is for your reference only; it is not enough to join. Students pick a display name, a handle and a password. Keep a note of handles and passwords, or give the class a pattern to follow, to avoid the inevitable forgotten passwords; you can reset a student’s password from the Students tab.',
    },
    {
      layout: 'figure',
      eyebrow: 'For students',
      title: 'Create your student account',
      image: 'yawp-join-page.png',
      accent: 'sunshine',
      callouts: [
        'Open the link or scan the QR code',
        'Your ==display name==: what your teacher sees',
        'A ==handle==: how you log in',
        'A password, twice, then ==Join class==',
      ],
      markers: [
        [0.9, 0.335],
        [0.87, 0.535],
        [0.87, 0.63],
        [0.87, 0.94],
      ],
      notes:
        'Walk the room while students sign up. Handles are 3 to 30 characters: letters, numbers, dots, underscores and hyphens. Already have an account? They can log in from the same page.',
    },
    {
      layout: 'figure',
      eyebrow: 'You’re in',
      title: 'Your YAWP! dashboard',
      image: 'yawp-student-dashboard.png',
      accent: 'coral',
      callouts: [
        'Your class is on your dashboard',
        'Open it to see your assignments',
        'Start an assignment to open your document',
        'The ==Tutor== guides you from the left',
      ],
      notes:
        'Once they’re in, have them open the class and start the first assignment you’ve given them, which creates their document. Next class they open the same document (not a new one) and begin pre-writing.',
    },
    {
      layout: 'closer',
      eyebrow: 'YAWP!',
      line: 'Next time: pre-writing.',
      notes:
        'Before students leave, make sure everyone has joined your class and started the assignment. Collect any forgotten handles now; it saves time next class.',
    },
  ],
};
