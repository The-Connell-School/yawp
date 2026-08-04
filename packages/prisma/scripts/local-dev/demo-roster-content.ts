/**
 * Static content for the local-dev demo roster: the students, the semester of
 * assignments they wrote for, and the sentence pools their essays are built
 * from.
 *
 * Everything here is hand-authored placeholder prose. It exists so the demo
 * environment has enough real-shaped writing for Class Summary and Reporter to
 * say something interesting — never to model a real student or school.
 */
import type { RubricKey } from '../../../../services/web-app/app/domain/grading/rubric.ts';

export type DemoClassKey = 'primary' | 'secondary';

/**
 * How a student's rubric levels move across the semester. Reporter growth
 * reports and "who needs attention" are only interesting when different
 * students are on visibly different trajectories.
 */
export type DemoArc =
  | 'rising'
  | 'late-bloomer'
  | 'steady-high'
  | 'steady-mid'
  | 'slipping'
  | 'struggling'
  | 'volatile';

export type DemoStudentSpec = {
  key: string;
  name: string;
  email: string;
  classKey: DemoClassKey;
  arc: DemoArc;
  /** Rubric level (1-5, fractional) the arc moves around. */
  baseline: number;
  /** The skill this student is reliably better at. */
  strength: RubricKey;
  /** The skill that drags their grade down. */
  weakness: RubricKey;
  /**
   * A short, student-specific image used in their closing sentence. Keeps every
   * essay in the seed textually distinct, the way real submissions are.
   */
  voice: string;
  /** Anchors always submit everything, so each assignment keeps a full spread. */
  anchor?: boolean;
};

export type DemoAssignmentState =
  | 'released'
  | 'graded-unreleased'
  | 'awaiting-grading';

export type DemoTopic = {
  subject: string;
  claimHigh: string;
  claimMid: string;
  claimLow: string;
  source: string;
  quote: string;
  counter: string;
};

export type DemoAssignmentSpec = {
  key: string;
  classKey: DemoClassKey;
  /** Which imported assignment type this maps onto. */
  assignmentTypeKey: 'thesis' | 'five-paragraph';
  title: string;
  prompt: string;
  pointValue: number;
  /** How long ago the assignment went out, in weeks. */
  weeksAgo: number;
  state: DemoAssignmentState;
  topic: DemoTopic;
};

function email(name: string) {
  const [first, ...rest] = name.toLowerCase().split(' ');
  const last = rest.join('').replace(/[^a-z]/g, '');
  return `demo.${first.replace(/[^a-z]/g, '')}.${last}@yawp.local`;
}

function student(
  spec: Omit<DemoStudentSpec, 'key' | 'email'> & { key?: string }
): DemoStudentSpec {
  return {
    ...spec,
    key: spec.key ?? spec.name.toLowerCase().replace(/[^a-z]+/g, '-'),
    email: email(spec.name),
  };
}

export const DEMO_ROSTER_STUDENTS: DemoStudentSpec[] = [
  // --- English 10, Period 3 -------------------------------------------------
  student({
    name: 'Amara Whitfield',
    classKey: 'primary',
    arc: 'struggling',
    baseline: 2,
    strength: 'voice_and_style',
    weakness: 'evidence_and_support',
    voice: 'a bus ride where nobody looked up',
    anchor: true,
  }),
  student({
    name: 'Diego Salcedo',
    classKey: 'primary',
    arc: 'steady-high',
    baseline: 4.6,
    strength: 'organization_and_structure',
    weakness: 'grammar_and_mechanics',
    voice: 'a chess clock running down',
    anchor: true,
  }),
  student({
    name: 'Priya Raghunathan',
    classKey: 'primary',
    arc: 'rising',
    baseline: 3.4,
    strength: 'thesis_and_content',
    weakness: 'grammar_and_mechanics',
    voice: 'a lab notebook with the margins full',
  }),
  student({
    name: 'Noah Feldman',
    classKey: 'primary',
    arc: 'slipping',
    baseline: 3.6,
    strength: 'voice_and_style',
    weakness: 'organization_and_structure',
    voice: 'a group chat that never sleeps',
  }),
  student({
    name: 'Imani Brooks',
    classKey: 'primary',
    arc: 'rising',
    baseline: 3.1,
    strength: 'evidence_and_support',
    weakness: 'voice_and_style',
    voice: 'a track meet in the rain',
  }),
  student({
    name: 'Tobias Lindqvist',
    classKey: 'primary',
    arc: 'steady-mid',
    baseline: 3.2,
    strength: 'grammar_and_mechanics',
    weakness: 'thesis_and_content',
    voice: 'a bike chain that keeps slipping',
  }),
  student({
    name: 'Sofia Marchetti',
    classKey: 'primary',
    arc: 'volatile',
    baseline: 3.5,
    strength: 'thesis_and_content',
    weakness: 'organization_and_structure',
    voice: 'a kitchen at closing time',
  }),
  student({
    name: 'Elias Barrera',
    classKey: 'primary',
    arc: 'struggling',
    baseline: 2.2,
    strength: 'voice_and_style',
    weakness: 'organization_and_structure',
    voice: 'a job application left open in a tab',
  }),
  student({
    name: 'Nadia Haddad',
    classKey: 'primary',
    arc: 'steady-high',
    baseline: 4.3,
    strength: 'evidence_and_support',
    weakness: 'voice_and_style',
    voice: 'a library card older than my phone',
  }),
  student({
    name: 'Marcus Okonkwo',
    classKey: 'primary',
    arc: 'late-bloomer',
    baseline: 3,
    strength: 'organization_and_structure',
    weakness: 'evidence_and_support',
    voice: 'a marching band rehearsal at dawn',
  }),
  student({
    name: 'Wren Delacroix',
    classKey: 'primary',
    arc: 'slipping',
    baseline: 3.8,
    strength: 'voice_and_style',
    weakness: 'evidence_and_support',
    voice: 'a sketchbook I stopped carrying',
  }),
  student({
    name: 'Hana Sugiyama',
    classKey: 'primary',
    arc: 'rising',
    baseline: 3.3,
    strength: 'grammar_and_mechanics',
    weakness: 'thesis_and_content',
    voice: 'a translation app getting it almost right',
  }),
  student({
    name: 'Julian Ferreira',
    classKey: 'primary',
    arc: 'steady-mid',
    baseline: 3,
    strength: 'thesis_and_content',
    weakness: 'grammar_and_mechanics',
    voice: 'a soccer field two blocks from the highway',
  }),
  student({
    name: 'Camille Boudreaux',
    classKey: 'primary',
    arc: 'volatile',
    baseline: 3.3,
    strength: 'organization_and_structure',
    weakness: 'voice_and_style',
    voice: 'a hurricane box we never unpacked',
  }),
  student({
    name: 'Omar Nazari',
    classKey: 'primary',
    arc: 'struggling',
    baseline: 2.4,
    strength: 'thesis_and_content',
    weakness: 'grammar_and_mechanics',
    voice: 'a night shift at my uncle’s shop',
  }),
  student({
    name: 'Beatrix Kowalski',
    classKey: 'primary',
    arc: 'steady-mid',
    baseline: 3.4,
    strength: 'evidence_and_support',
    weakness: 'thesis_and_content',
    voice: 'a debate round that ran long',
  }),
  student({
    name: 'Theo Ramaswamy',
    classKey: 'primary',
    arc: 'rising',
    baseline: 2.9,
    strength: 'voice_and_style',
    weakness: 'organization_and_structure',
    voice: 'a robotics build the week before regionals',
  }),
  student({
    name: 'Lucia Ibarra',
    classKey: 'primary',
    arc: 'steady-high',
    baseline: 4.1,
    strength: 'thesis_and_content',
    weakness: 'grammar_and_mechanics',
    voice: 'a grandmother who edits my drafts out loud',
  }),
  student({
    name: 'Simone Achebe',
    classKey: 'primary',
    arc: 'late-bloomer',
    baseline: 2.8,
    strength: 'evidence_and_support',
    weakness: 'voice_and_style',
    voice: 'a chorus room with one broken chair',
  }),
  student({
    name: 'Dashiell Moreau',
    classKey: 'primary',
    arc: 'volatile',
    baseline: 3.1,
    strength: 'voice_and_style',
    weakness: 'thesis_and_content',
    voice: 'a film reel my dad refuses to digitize',
  }),
  student({
    name: 'Yara Suleiman',
    classKey: 'primary',
    arc: 'slipping',
    baseline: 3.9,
    strength: 'organization_and_structure',
    weakness: 'thesis_and_content',
    voice: 'a swim practice I keep skipping',
  }),
  student({
    name: 'Colton Reyes',
    classKey: 'primary',
    arc: 'steady-mid',
    baseline: 2.9,
    strength: 'grammar_and_mechanics',
    weakness: 'evidence_and_support',
    voice: 'a truck bed full of somebody else’s furniture',
  }),

  // --- English 11, Period 5 -------------------------------------------------
  student({
    name: 'Anais Trudeau',
    classKey: 'secondary',
    arc: 'struggling',
    baseline: 2.1,
    strength: 'voice_and_style',
    weakness: 'thesis_and_content',
    voice: 'a diner counter at six in the morning',
    anchor: true,
  }),
  student({
    name: 'Ravi Chandrasekar',
    classKey: 'secondary',
    arc: 'steady-high',
    baseline: 4.5,
    strength: 'thesis_and_content',
    weakness: 'voice_and_style',
    voice: 'a spreadsheet nobody asked me to build',
    anchor: true,
  }),
  student({
    name: 'Margot Ellsworth',
    classKey: 'secondary',
    arc: 'rising',
    baseline: 3.3,
    strength: 'organization_and_structure',
    weakness: 'evidence_and_support',
    voice: 'a horse barn in January',
  }),
  student({
    name: 'Kwame Boateng',
    classKey: 'secondary',
    arc: 'slipping',
    baseline: 3.9,
    strength: 'evidence_and_support',
    weakness: 'grammar_and_mechanics',
    voice: 'a phone call home that costs too much',
  }),
  student({
    name: 'Isabel Navarro',
    classKey: 'secondary',
    arc: 'steady-mid',
    baseline: 3.2,
    strength: 'voice_and_style',
    weakness: 'organization_and_structure',
    voice: 'a mural half-finished on Eighth Street',
  }),
  student({
    name: 'Finnegan OShea',
    classKey: 'secondary',
    arc: 'volatile',
    baseline: 3.4,
    strength: 'thesis_and_content',
    weakness: 'grammar_and_mechanics',
    voice: 'a fishing boat with a bad radio',
  }),
  student({
    name: 'Leila Farhadi',
    classKey: 'secondary',
    arc: 'rising',
    baseline: 3.5,
    strength: 'evidence_and_support',
    weakness: 'voice_and_style',
    voice: 'a passport stamp I cannot read',
  }),
  student({
    name: 'August Vandermeer',
    classKey: 'secondary',
    arc: 'steady-mid',
    baseline: 3.1,
    strength: 'grammar_and_mechanics',
    weakness: 'thesis_and_content',
    voice: 'a greenhouse that smells like rust',
  }),
  student({
    name: 'Rosalind Achterberg',
    classKey: 'secondary',
    arc: 'steady-high',
    baseline: 4.2,
    strength: 'organization_and_structure',
    weakness: 'evidence_and_support',
    voice: 'a metronome I finally stopped fighting',
  }),
  student({
    name: 'Mateo Quintero',
    classKey: 'secondary',
    arc: 'late-bloomer',
    baseline: 2.9,
    strength: 'voice_and_style',
    weakness: 'organization_and_structure',
    voice: 'a bakery van idling at four a.m.',
  }),
  student({
    name: 'Thandiwe Mokoena',
    classKey: 'secondary',
    arc: 'rising',
    baseline: 3.2,
    strength: 'thesis_and_content',
    weakness: 'grammar_and_mechanics',
    voice: 'a radio station that only plays at night',
  }),
  student({
    name: 'Jasper Lindgren',
    classKey: 'secondary',
    arc: 'struggling',
    baseline: 2.3,
    strength: 'grammar_and_mechanics',
    weakness: 'evidence_and_support',
    voice: 'a snowplow route I memorized by accident',
  }),
  student({
    name: 'Delphine Moreau',
    classKey: 'secondary',
    arc: 'steady-mid',
    baseline: 3.5,
    strength: 'evidence_and_support',
    weakness: 'voice_and_style',
    voice: 'a violin case with someone else’s initials',
  }),
  student({
    name: 'Nikhil Bhatt',
    classKey: 'secondary',
    arc: 'volatile',
    baseline: 3.3,
    strength: 'organization_and_structure',
    weakness: 'thesis_and_content',
    voice: 'a cricket match watched at three in the morning',
  }),
  student({
    name: 'Cora Whitehead',
    classKey: 'secondary',
    arc: 'slipping',
    baseline: 3.7,
    strength: 'voice_and_style',
    weakness: 'evidence_and_support',
    voice: 'a diner job I quit twice',
  }),
  student({
    name: 'Emeka Nwosu',
    classKey: 'secondary',
    arc: 'late-bloomer',
    baseline: 3,
    strength: 'thesis_and_content',
    weakness: 'voice_and_style',
    voice: 'a church basement with folding chairs',
  }),
  student({
    name: 'Solveig Andersen',
    classKey: 'secondary',
    arc: 'steady-high',
    baseline: 4,
    strength: 'grammar_and_mechanics',
    weakness: 'thesis_and_content',
    voice: 'a ferry schedule taped to the fridge',
  }),
  student({
    name: 'Bennett Kaur',
    classKey: 'secondary',
    arc: 'steady-mid',
    baseline: 3.4,
    strength: 'thesis_and_content',
    weakness: 'organization_and_structure',
    voice: 'a bookstore that closed the year I found it',
  }),
];

export const DEMO_ROSTER_ASSIGNMENTS: DemoAssignmentSpec[] = [
  {
    key: 'p1-turning-point',
    classKey: 'primary',
    assignmentTypeKey: 'five-paragraph',
    title: 'Personal Narrative: The Turn',
    prompt:
      'Write a narrative essay about a moment that changed how you saw something you thought you understood. Ground the turn in concrete detail.',
    pointValue: 100,
    weeksAgo: 30,
    state: 'released',
    topic: {
      subject: 'the moment a familiar place stops feeling familiar',
      claimHigh:
        'The turn was not the moment anything changed outside of me; it was the moment I ran out of ways to explain it away.',
      claimMid: 'That day changed how I saw a place I thought I already knew.',
      claimLow: 'That day was the day everything changed for me.',
      source: 'my own notes from that week',
      quote: 'nothing moved but me',
      counter: 'a single afternoon cannot really change a person',
    },
  },
  {
    key: 'p2-cost-of-convenience',
    classKey: 'primary',
    assignmentTypeKey: 'thesis',
    title: 'Thesis Essay: The Cost of Convenience',
    prompt:
      'Build a thesis-driven argument about what convenience actually costs us. Use at least two sources and answer the strongest objection to your claim.',
    pointValue: 100,
    weeksAgo: 24,
    state: 'released',
    topic: {
      subject: 'the cost of convenience',
      claimHigh:
        'Convenience is never free; it is a loan taken out against attention, and the interest is collected quietly.',
      claimMid: 'Convenience always costs something, even when it looks free.',
      claimLow: 'Convenience is not free and it costs us alot.',
      source: "Klein's essay on frictionless design",
      quote: 'the tax we pay in attention',
      counter: 'the time saved is worth whatever it costs',
    },
  },
  {
    key: 'p3-who-speaks',
    classKey: 'primary',
    assignmentTypeKey: 'thesis',
    title: 'Literary Analysis: Who Speaks in Night?',
    prompt:
      'Analyze how narration shapes what a reader is allowed to believe in Night. Anchor every claim in the text itself.',
    pointValue: 100,
    weeksAgo: 17,
    state: 'released',
    topic: {
      subject: 'who is permitted to speak in a memoir',
      claimHigh:
        'The narrator survives by refusing to speak for the dead, and that refusal is the memoir’s most demanding act of witness.',
      claimMid:
        'The narrator chooses carefully what to say and what to leave out.',
      claimLow: 'The narrator tells us alot but he also leaves things out.',
      source: 'the memoir itself',
      quote: 'I did not speak, and the silence held',
      counter: 'the silences are simply what memory does to a story',
    },
  },
  {
    key: 'p4-rules-worth-breaking',
    classKey: 'primary',
    assignmentTypeKey: 'thesis',
    title: 'Argument Essay: Rules Worth Breaking',
    prompt:
      'Argue for one school or community rule that should be broken or rewritten. Anticipate the objection a reasonable adult would raise.',
    pointValue: 100,
    weeksAgo: 10,
    state: 'released',
    topic: {
      subject: 'when a rule stops doing the work it was written to do',
      claimHigh:
        'A rule that survives only because nobody has asked what it protects has already stopped being a rule and become a habit.',
      claimMid:
        'Some rules stay in place long after the reason for them is gone.',
      claimLow: 'Some rules are old and they dont make sense anymore.',
      source: 'the district handbook',
      quote: 'for the safety and order of the community',
      counter: 'rules exist precisely because students want to break them',
    },
  },
  {
    key: 'p5-attention-for-sale',
    classKey: 'primary',
    assignmentTypeKey: 'thesis',
    title: 'Synthesis Essay: Attention for Sale',
    prompt:
      'Synthesize at least three sources into one argument about who profits from your attention and what that costs the people around you.',
    pointValue: 100,
    weeksAgo: 5,
    state: 'graded-unreleased',
    topic: {
      subject: 'the market for human attention',
      claimHigh:
        'Attention is the only resource a person cannot manufacture more of, which is exactly why an entire industry was built to harvest it.',
      claimMid:
        'Companies make money from our attention, and that changes how we live.',
      claimLow: 'Companys make money off our attention every day.',
      source: "Okafor's study of engagement metrics",
      quote: 'the product is the interval between one glance and the next',
      counter: 'people freely choose what to look at',
    },
  },
  {
    key: 'p6-later-start',
    classKey: 'primary',
    assignmentTypeKey: 'thesis',
    title: 'Persuasive Essay: A Later Start',
    prompt:
      'Take a position on whether the school day should start later. Use evidence, and make the strongest version of the other side before you answer it.',
    pointValue: 100,
    weeksAgo: 1,
    state: 'awaiting-grading',
    topic: {
      subject: 'when the school day should begin',
      claimHigh:
        'A later start is not a concession to tired teenagers; it is an admission that the schedule was built for buses rather than for learning.',
      claimMid:
        'Starting school later would help students learn more during the day.',
      claimLow: 'School should start later because kids are tired.',
      source: 'the district transportation report',
      quote: 'routing efficiency drives the bell schedule',
      counter: 'a later start would wreck athletics and family schedules',
    },
  },

  {
    key: 's1-speech-that-moved',
    classKey: 'secondary',
    assignmentTypeKey: 'thesis',
    title: 'Rhetorical Analysis: The Speech That Moved a Country',
    prompt:
      'Analyze the rhetorical strategy of a speech that changed public opinion. Explain how the moves work, not just that they exist.',
    pointValue: 100,
    weeksAgo: 28,
    state: 'released',
    topic: {
      subject: 'how a speech earns the right to ask for something',
      claimHigh:
        'The speech persuades not by raising its voice but by spending its first three minutes agreeing with the people least likely to agree with it.',
      claimMid:
        'The speaker builds trust first and only then asks the audience for something.',
      claimLow: 'The speaker uses alot of pathos to make people listen.',
      source: 'the transcript',
      quote: 'I will begin where you began',
      counter: 'the speech only worked because of the moment it landed in',
    },
  },
  {
    key: 's2-progress-and-price',
    classKey: 'secondary',
    assignmentTypeKey: 'thesis',
    title: 'Thesis Essay: Progress and Its Price',
    prompt:
      'Argue what a specific kind of progress costs, and who pays. Use sources that disagree with each other.',
    pointValue: 100,
    weeksAgo: 21,
    state: 'released',
    topic: {
      subject: 'who pays for progress',
      claimHigh:
        'Progress is rarely refused; it is simply billed to people who were never asked whether they wanted it.',
      claimMid:
        'Progress helps many people, but the cost usually lands on a few.',
      claimLow: 'Progress is good but it also hurts some people alot.',
      source: "Marchetti's history of the interstate",
      quote: 'the route was drawn where resistance was cheapest',
      counter: 'every improvement requires someone to be inconvenienced',
    },
  },
  {
    key: 's3-unreliable-narrator',
    classKey: 'secondary',
    assignmentTypeKey: 'thesis',
    title: 'Literary Analysis: The Unreliable Narrator',
    prompt:
      'Analyze how an unreliable narrator changes what a novel is able to argue. Quote precisely and read the quotation, do not merely drop it.',
    pointValue: 100,
    weeksAgo: 14,
    state: 'released',
    topic: {
      subject: 'what a reader owes a narrator who lies',
      claimHigh:
        'The narrator’s lies are not obstacles between the reader and the truth; they are the novel’s argument about how truth is assembled.',
      claimMid:
        'Because the narrator lies, the reader has to work to find the truth.',
      claimLow: 'The narrator lies so we cant trust him at all.',
      source: 'the novel',
      quote: 'I have told this correctly, or near enough',
      counter: 'an unreliable narrator is just a trick to keep readers reading',
    },
  },
  {
    key: 's4-what-we-owe',
    classKey: 'secondary',
    assignmentTypeKey: 'thesis',
    title: 'Synthesis Essay: What We Owe the Future',
    prompt:
      'Synthesize three sources into a claim about obligations to people who do not exist yet. Answer the strongest objection.',
    pointValue: 100,
    weeksAgo: 6,
    state: 'released',
    topic: {
      subject: 'obligations to people who do not exist yet',
      claimHigh:
        'An obligation to the future is not sentimental; it is the only way a society can explain why it maintains anything it will not live to use.',
      claimMid:
        'We owe something to future generations even though we will never meet them.',
      claimLow: 'We owe the future alot because they cant speak for themselfs.',
      source: "Reyes' essay on long-term thinking",
      quote: 'the people who planted these trees knew the arithmetic',
      counter: 'we cannot owe anything to people who do not yet exist',
    },
  },
  {
    key: 's5-against-certainty',
    classKey: 'secondary',
    assignmentTypeKey: 'thesis',
    title: 'Argument Essay: The Case Against Certainty',
    prompt:
      'Argue that certainty is overvalued in some specific domain. Make the objection real before you answer it.',
    pointValue: 100,
    weeksAgo: 2,
    state: 'awaiting-grading',
    topic: {
      subject: 'the cost of being certain too early',
      claimHigh:
        'Certainty is cheapest at the beginning of an inquiry, which is exactly when it does the most damage.',
      claimMid:
        'Being certain too early stops people from finding better answers.',
      claimLow: 'Being to certain is bad because you stop looking.',
      source: 'the case study',
      quote: 'the conclusion was reached before the second interview',
      counter: 'decisions cannot wait forever for perfect information',
    },
  },
];

type Sentence = (topic: DemoTopic) => string;

export const ESSAY_POOLS: Record<
  'high' | 'mid' | 'low',
  {
    openers: Sentence[];
    evidence: Sentence[];
    analysis: Sentence[];
    counters: Sentence[];
    rebuttals: Sentence[];
    closers: Sentence[];
  }
> = {
  high: {
    openers: [
      (t) =>
        `Any honest account of ${t.subject} has to begin with what it quietly costs.`,
      (t) =>
        `It is easy to treat ${t.subject} as a settled question, which is precisely why it deserves a second look.`,
      (t) =>
        `Most arguments about ${t.subject} fail because they answer a question nobody actually asked.`,
      (t) =>
        `Before anyone can argue about ${t.subject}, they have to admit how little of it they chose.`,
      (t) =>
        `The usual conversation about ${t.subject} skips the only part that matters.`,
    ],
    evidence: [
      (t) =>
        `${t.source} puts it plainly: "${t.quote}." The phrase does more work than it first appears.`,
      (t) =>
        `The most useful line in ${t.source} is the least dramatic one, that "${t.quote}."`,
      (t) =>
        `Read slowly, ${t.source} concedes the whole argument in four words: "${t.quote}."`,
      (t) =>
        `When ${t.source} records that "${t.quote}," it is describing a decision, not an accident.`,
    ],
    analysis: [
      () =>
        `That phrasing matters. It converts a choice made by particular people into a condition that simply happened, and once something has simply happened, nobody is responsible for it.`,
      () =>
        `The wording does the arguing here. It describes an outcome in the passive voice so that the person who benefited never has to appear in the sentence.`,
      () =>
        `What looks like description is actually permission. The sentence establishes a norm and then treats the norm as evidence for itself.`,
      () =>
        `The claim survives on momentum: it is repeated often enough that repetition begins to function as proof.`,
    ],
    counters: [
      (t) =>
        `The fairest objection is that ${t.counter}, and that objection deserves a real answer rather than a dismissal.`,
      (t) =>
        `A reader could reasonably respond that ${t.counter}. That response is not unserious.`,
      (t) =>
        `It would be dishonest not to admit the strongest version of the other side: ${t.counter}.`,
    ],
    rebuttals: [
      () =>
        `But the objection assumes the tradeoff was offered rather than imposed, and nothing in the record suggests anyone was asked.`,
      () =>
        `The answer is that the objection measures the wrong thing. It counts what was gained without counting who was not in the room when the gain was defined.`,
      () =>
        `That answer holds only if the cost falls on the person collecting the benefit, and here it does not.`,
      () =>
        `The objection is right about the short term and wrong about everything after it.`,
    ],
    closers: [
      () =>
        `None of this argues for refusing the benefit. It argues for naming the bill before it arrives.`,
      () =>
        `The point is not that the tradeoff is indefensible, but that it has never actually been defended.`,
      () =>
        `What is required is smaller than a revolution and harder than one: saying out loud what is being exchanged.`,
      () =>
        `The question worth carrying forward is not whether this is worth it, but who was allowed to decide that it was.`,
    ],
  },
  mid: {
    openers: [
      (t) => `There is a lot of disagreement about ${t.subject}.`,
      (t) => `People do not think very carefully about ${t.subject}.`,
      (t) => `${capitalize(t.subject)} is more complicated than it looks.`,
      (t) => `Almost everyone has an opinion about ${t.subject}.`,
      (t) => `It is worth looking closely at ${t.subject}.`,
    ],
    evidence: [
      (t) => `In ${t.source}, the author says "${t.quote}."`,
      (t) =>
        `${capitalize(t.source)} makes this point when it says "${t.quote}."`,
      (t) => `One important quote from ${t.source} is "${t.quote}."`,
      (t) =>
        `This idea shows up in ${t.source}, which states that "${t.quote}."`,
    ],
    analysis: [
      () =>
        `This quote shows that the situation is not as simple as people assume, because the wording hides who made the decision.`,
      () =>
        `This matters because it shows the problem is not an accident. Someone decided it, even if the sentence does not say who.`,
      () =>
        `The quote helps my argument because it shows the cost is real, not just something people complain about.`,
      () =>
        `This is evidence that the issue affects real people, even if it is easy to ignore.`,
    ],
    counters: [
      (t) => `Some people would say that ${t.counter}.`,
      (t) => `On the other hand, ${t.counter}.`,
      (t) => `A counterargument is that ${t.counter}.`,
    ],
    rebuttals: [
      () =>
        `However, this argument does not consider who actually pays the cost.`,
      () =>
        `That may be true, but it only works if everyone is affected the same way, and they are not.`,
      () => `This is a fair point, but it misses the long term effects.`,
      () => `Even so, the benefit and the cost do not land on the same people.`,
    ],
    closers: [
      () =>
        `In conclusion, this issue deserves more attention than it usually gets.`,
      () =>
        `Overall, the tradeoff is real, and people should at least know they are making it.`,
      () =>
        `This does not mean nothing should change. It means the change should be honest about the cost.`,
      () => `In the end, the question is who gets to decide.`,
    ],
  },
  low: {
    openers: [
      (t) => `Their is alot of arguments about ${t.subject}.`,
      (t) => `${capitalize(t.subject)} is a big problem today.`,
      (t) => `Everyone knows about ${t.subject} but they dont think about it.`,
      (t) => `In this essay I will talk about ${t.subject}.`,
      (t) => `${capitalize(t.subject)} effects everybody.`,
    ],
    evidence: [
      (t) => `In ${t.source} it says "${t.quote}", this is important.`,
      (t) => `${capitalize(t.source)} said "${t.quote}" and I agree with it.`,
      (t) => `One quote is "${t.quote}" from ${t.source}.`,
      (t) => `The author of ${t.source} wrote "${t.quote}."`,
    ],
    analysis: [
      () => `This quote proves my point and it shows that I am right.`,
      () => `This shows the problem is bad, it happens to alot of people.`,
      () => `Which means that people should care more then they do.`,
      () => `This is why the quote is important to my essay.`,
    ],
    counters: [
      (t) => `Some people says that ${t.counter}.`,
      (t) => `Other people think ${t.counter}.`,
      (t) => `But some would argue ${t.counter}.`,
    ],
    rebuttals: [
      () => `But there wrong because they dont see the whole picture.`,
      () => `I disagree, because it effects the people who cant do nothing.`,
      () => `That is not true for everybody, some people have it worse.`,
      () => `Still it is not fair to the other people.`,
    ],
    closers: [
      () => `In conclusion this is a important issue that we should fix.`,
      () => `So thats why I think people should pay attention to it.`,
      () => `In conclusion, everybody should think about this more.`,
      () => `That is why this topic matter alot to me.`,
    ],
  },
};

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export const OVERALL_COMMENTS: Record<'high' | 'mid' | 'low', string[]> = {
  high: [
    'A genuinely strong piece. The thesis takes a real position and the counterargument is handled honestly instead of waved away. Push the evidence one layer deeper next time — you are ready for sources that complicate you.',
    'This is the sharpest work you have turned in. Your analysis reads the quotation rather than decorating with it. Watch for paragraphs that end on the evidence instead of on your own claim.',
    'Confident, well-built argument. The structure earns each turn, and the closing resists the easy summary. Next step: vary sentence rhythm so the prose sounds as controlled as the thinking.',
    'Excellent control of the argument. You anticipate the objection before the reader can raise it. To go further, spend a sentence on what your claim would cost if you are wrong.',
  ],
  mid: [
    'Solid work with a clear position. The evidence is relevant, but it is still doing the arguing for you — tell me what the quotation means before you move on. Tighten the transitions between body paragraphs.',
    'You have a real claim here and you stay with it. The counterargument section is thin; give the other side its best sentence, then answer it. Watch comma splices in the second half.',
    'Good progress. The organization holds up and the introduction sets a genuine question. Your analysis paragraphs stop one sentence too early — the sentence after the quote is where the essay lives.',
    'Clear and readable. Add one more specific piece of evidence in the third paragraph, and revise the conclusion so it extends the argument instead of restating it.',
  ],
  low: [
    'There is a real idea in here, and I want to see it developed. Right now the essay tells me the topic matters without showing me why. Start with one quotation and write three sentences about it before adding anything else.',
    'You are close to a thesis but not there yet — the opening announces the topic rather than taking a position. Let us meet before the next draft and turn that first paragraph into a claim.',
    'The argument gets lost between paragraphs because each one starts a new topic. Try one idea per paragraph, with the quotation in the middle and your explanation after it. Grammar needs a careful read-through too.',
    'I can hear your voice here, which is the hardest part to teach. Now we need structure and evidence to carry it. Focus this week on integrating quotations instead of dropping them in.',
  ],
};

export const CATEGORY_COMMENTS: Record<
  RubricKey,
  { strong: string[]; weak: string[] }
> = {
  thesis_and_content: {
    strong: [
      'The thesis takes a position that could actually be argued against.',
      'Real critical thinking here — the claim earns its complexity.',
    ],
    weak: [
      'The opening announces a topic instead of making a claim.',
      'The thesis shifts between paragraph two and paragraph four.',
    ],
  },
  organization_and_structure: {
    strong: [
      'Each paragraph hands off cleanly to the next.',
      'The structure is doing argumentative work, not just holding order.',
    ],
    weak: [
      'Paragraph order feels like the order you thought of things, not the order the reader needs.',
      'The conclusion restates rather than extends.',
    ],
  },
  evidence_and_support: {
    strong: [
      'Quotations are integrated and then actually read.',
      'The evidence is precise and it deepens the analysis.',
    ],
    weak: [
      'The quotation is dropped in and left to argue for itself.',
      'One source is doing all the work; bring in a second that disagrees.',
    ],
  },
  voice_and_style: {
    strong: [
      'The voice is yours and it stays consistent throughout.',
      'Precise, engaging language — nothing here is filler.',
    ],
    weak: [
      'The tone shifts from formal to casual mid-essay.',
      'Several sentences say the same thing twice in different words.',
    ],
  },
  grammar_and_mechanics: {
    strong: [
      'Clean mechanics; nothing gets in the way of the argument.',
      'Careful proofreading shows.',
    ],
    weak: [
      'Comma splices throughout — read this one aloud before submitting.',
      'Subject-verb agreement and spelling need a full pass.',
    ],
  },
};

export const INLINE_COMMENTS: Record<
  'thesis' | 'evidence' | 'closing',
  Record<'high' | 'mid' | 'low', string[]>
> = {
  thesis: {
    high: [
      'This is the sentence the whole essay is built on, and it holds.',
      'Strong, arguable claim — you commit to something a reader could refuse.',
    ],
    mid: [
      'Good start on a claim. Can you name what is at stake in it?',
      'This is close. Add the "because" and it becomes a thesis.',
    ],
    low: [
      'This announces the topic. What do you want to argue about it?',
      'Turn this into a claim someone could disagree with.',
    ],
  },
  evidence: {
    high: [
      'Nicely integrated — the quotation arrives already doing work.',
      'This is the right line to pull. Your reading of it is the best part of the essay.',
    ],
    mid: [
      'Explain this quotation in your own words before you move on.',
      'What in this line supports your claim? Say it explicitly.',
    ],
    low: [
      'The quotation cannot argue on its own. What does it show?',
      'Introduce this quote before you use it, then explain it after.',
    ],
  },
  closing: {
    high: [
      'A conclusion that opens rather than closes. Well done.',
      'This last move extends the argument instead of summarizing it.',
    ],
    mid: [
      'Push past summary here — what should the reader do with this?',
      'Your last sentence is the most important one. Make it new.',
    ],
    low: [
      'This repeats the introduction. End with something you learned.',
      'Try ending on your strongest idea instead of a restatement.',
    ],
  },
};
