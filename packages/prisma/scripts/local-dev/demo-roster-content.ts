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

/**
 * The teacher's course load. `primary` and `secondary` are the two classes the
 * persona seed already creates; the rest belong to the roster, so the demo
 * teacher carries five sections the way a real English teacher does.
 */
export type DemoClassKey =
  | 'primary'
  | 'secondary'
  | 'english10-p2'
  | 'english9-p1'
  | 'ap-lit-p7';

export type DemoClassSpec = {
  key: DemoClassKey;
  title: string;
  code: string;
  grade: string;
  period: string;
  /** Index into the schools the synthetic seed creates. */
  schoolIndex: number;
  /**
   * Index into CLASS_ART_LIBRARY — the painting, not the pool slot. The art
   * pool is (artwork x crop) pairs, so picking pool indices directly lets two
   * classes land on the same painting at different crops.
   */
  artworkIndex: number;
  /** Which crop of that painting to use. */
  cropIndex: number;
  /** Set when the persona seed already created this class row. */
  existing?: boolean;
  /**
   * The skill this class is collectively good and bad at. Without it, individual
   * strengths cancel out and every rubric category averages the same, leaving
   * "what is my class weakest at?" with no answer.
   */
  skillProfile: { strong: RubricKey; weak: RubricKey };
};

export const DEMO_ROSTER_CLASSES: DemoClassSpec[] = [
  {
    key: 'primary',
    title: 'English 10 - Period 3',
    code: 'DEV-CLASS-101',
    grade: '10',
    period: '3',
    schoolIndex: 0,
    artworkIndex: 0,
    cropIndex: 2,
    existing: true,
    skillProfile: { strong: 'voice_and_style', weak: 'evidence_and_support' },
  },
  {
    key: 'secondary',
    title: 'English 11 - Period 5',
    code: 'DEV-CLASS-202',
    grade: '11',
    period: '5',
    schoolIndex: 1,
    artworkIndex: 1,
    cropIndex: 2,
    existing: true,
    skillProfile: {
      strong: 'evidence_and_support',
      weak: 'organization_and_structure',
    },
  },
  {
    key: 'english10-p2',
    title: 'English 10 - Period 2',
    code: 'DEV-CLASS-102',
    grade: '10',
    period: '2',
    schoolIndex: 0,
    artworkIndex: 2,
    cropIndex: 1,
    skillProfile: {
      strong: 'organization_and_structure',
      weak: 'voice_and_style',
    },
  },
  {
    key: 'english9-p1',
    title: 'English 9 - Period 1',
    code: 'DEV-CLASS-091',
    grade: '9',
    period: '1',
    schoolIndex: 0,
    artworkIndex: 4,
    cropIndex: 1,
    skillProfile: {
      strong: 'thesis_and_content',
      weak: 'grammar_and_mechanics',
    },
  },
  {
    key: 'ap-lit-p7',
    title: 'AP English Literature - Period 7',
    code: 'DEV-CLASS-AP7',
    grade: '12',
    period: '7',
    schoolIndex: 0,
    artworkIndex: 3,
    cropIndex: 0,
    skillProfile: {
      strong: 'thesis_and_content',
      weak: 'voice_and_style',
    },
  },
];

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

/**
 * What the students hand in. Essays get the full argument structure; free
 * writes are short reflective warmups that are never graded.
 */
export type DemoAssignmentForm = 'essay' | 'free-write';

/**
 * Assignments the persona seed already created. The roster fills these rather
 * than creating its own copy, so no assignment in the demo classes is left
 * standing empty.
 */
export type DemoExistingAssignmentKey = 'civic-responsibility' | 'daily-pages';

export type DemoAssignmentSpec = {
  key: string;
  /** Every class this assignment is handed to. Two sections of one course share a row. */
  classKeys: DemoClassKey[];
  /** Which imported assignment type this maps onto. */
  assignmentTypeKey: 'thesis' | 'five-paragraph' | 'daily-pages';
  title: string;
  prompt: string;
  pointValue: number;
  /** How long ago the assignment went out, in weeks. */
  weeksAgo: number;
  state: DemoAssignmentState;
  form?: DemoAssignmentForm;
  /** Set when the row already exists and the roster only supplies the papers. */
  existingKey?: DemoExistingAssignmentKey;
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

  // --- English 10, Period 2 -------------------------------------------------
  student({
    name: 'Rosa Villanueva',
    classKey: 'english10-p2',
    arc: 'struggling',
    baseline: 2.1,
    strength: 'thesis_and_content',
    weakness: 'grammar_and_mechanics',
    voice: 'a laundromat with one working dryer',
    anchor: true,
  }),
  student({
    name: 'Henrik Aaltonen',
    classKey: 'english10-p2',
    arc: 'steady-high',
    baseline: 4.5,
    strength: 'evidence_and_support',
    weakness: 'voice_and_style',
    voice: 'a weather station nobody checks',
    anchor: true,
  }),
  student({
    name: 'Talia Mensah',
    classKey: 'english10-p2',
    arc: 'rising',
    baseline: 3.2,
    strength: 'organization_and_structure',
    weakness: 'evidence_and_support',
    voice: 'a stairwell that echoes on purpose',
  }),
  student({
    name: 'Desmond Pryor',
    classKey: 'english10-p2',
    arc: 'slipping',
    baseline: 3.8,
    strength: 'thesis_and_content',
    weakness: 'grammar_and_mechanics',
    voice: 'a barbershop where everyone argues',
  }),
  student({
    name: 'Sunniva Berg',
    classKey: 'english10-p2',
    arc: 'steady-mid',
    baseline: 3.3,
    strength: 'grammar_and_mechanics',
    weakness: 'thesis_and_content',
    voice: 'a ski lift running in the off season',
  }),
  student({
    name: 'Arjun Deshpande',
    classKey: 'english10-p2',
    arc: 'volatile',
    baseline: 3.4,
    strength: 'thesis_and_content',
    weakness: 'organization_and_structure',
    voice: 'a spice cabinet organized by nobody',
  }),
  student({
    name: 'Marisol Quintanilla',
    classKey: 'english10-p2',
    arc: 'rising',
    baseline: 3,
    strength: 'voice_and_style',
    weakness: 'evidence_and_support',
    voice: 'a quinceañera photo I am not in',
  }),
  student({
    name: 'Gideon Farrow',
    classKey: 'english10-p2',
    arc: 'struggling',
    baseline: 2.3,
    strength: 'organization_and_structure',
    weakness: 'thesis_and_content',
    voice: 'a hardware store aisle I know by heart',
  }),
  student({
    name: 'Neve Callaghan',
    classKey: 'english10-p2',
    arc: 'steady-high',
    baseline: 4.2,
    strength: 'thesis_and_content',
    weakness: 'grammar_and_mechanics',
    voice: 'a rowing shell before anyone is awake',
  }),
  student({
    name: 'Idris Bakare',
    classKey: 'english10-p2',
    arc: 'late-bloomer',
    baseline: 2.9,
    strength: 'evidence_and_support',
    weakness: 'voice_and_style',
    voice: 'a generator humming through a blackout',
  }),
  student({
    name: 'Colette Baptiste',
    classKey: 'english10-p2',
    arc: 'steady-mid',
    baseline: 3.1,
    strength: 'voice_and_style',
    weakness: 'organization_and_structure',
    voice: 'a second language I only speak at home',
  }),
  student({
    name: 'Peter Mwangi',
    classKey: 'english10-p2',
    arc: 'rising',
    baseline: 3.3,
    strength: 'evidence_and_support',
    weakness: 'grammar_and_mechanics',
    voice: 'a bus route that takes an hour longer',
  }),
  student({
    name: 'Annika Sorensen',
    classKey: 'english10-p2',
    arc: 'slipping',
    baseline: 3.7,
    strength: 'organization_and_structure',
    weakness: 'voice_and_style',
    voice: 'a swim cap with my sister’s name in it',
  }),
  student({
    name: 'Emilio Vasquez',
    classKey: 'english10-p2',
    arc: 'volatile',
    baseline: 3.2,
    strength: 'voice_and_style',
    weakness: 'thesis_and_content',
    voice: 'a taquería that closes when it feels like it',
  }),
  student({
    name: 'Phoebe Lindenbaum',
    classKey: 'english10-p2',
    arc: 'steady-mid',
    baseline: 3.5,
    strength: 'thesis_and_content',
    weakness: 'evidence_and_support',
    voice: 'a piano with two dead keys',
  }),
  student({
    name: 'Kai Tanaka-Reyes',
    classKey: 'english10-p2',
    arc: 'rising',
    baseline: 2.8,
    strength: 'grammar_and_mechanics',
    weakness: 'thesis_and_content',
    voice: 'a skate park after it rains',
  }),
  student({
    name: 'Miriam Blanchard',
    classKey: 'english10-p2',
    arc: 'late-bloomer',
    baseline: 3,
    strength: 'thesis_and_content',
    weakness: 'grammar_and_mechanics',
    voice: 'a greenhouse my mother refuses to sell',
  }),
  student({
    name: 'Osric Nwachukwu',
    classKey: 'english10-p2',
    arc: 'struggling',
    baseline: 2.5,
    strength: 'voice_and_style',
    weakness: 'evidence_and_support',
    voice: 'a phone with a cracked screen I keep anyway',
  }),
  student({
    name: 'Linnea Halvorsen',
    classKey: 'english10-p2',
    arc: 'steady-mid',
    baseline: 3.4,
    strength: 'organization_and_structure',
    weakness: 'thesis_and_content',
    voice: 'a knitting pattern I did not follow',
  }),
  student({
    name: 'Zaid Al-Amin',
    classKey: 'english10-p2',
    arc: 'volatile',
    baseline: 3.6,
    strength: 'evidence_and_support',
    weakness: 'organization_and_structure',
    voice: 'a mosque parking lot at sunset',
  }),

  // --- English 9, Period 1 --------------------------------------------------
  student({
    name: 'June Ashworth',
    classKey: 'english9-p1',
    arc: 'struggling',
    baseline: 2,
    strength: 'voice_and_style',
    weakness: 'organization_and_structure',
    voice: 'a locker I still cannot open',
    anchor: true,
  }),
  student({
    name: 'Malik Osei',
    classKey: 'english9-p1',
    arc: 'steady-high',
    baseline: 4.3,
    strength: 'thesis_and_content',
    weakness: 'grammar_and_mechanics',
    voice: 'a bassline I heard through a wall',
    anchor: true,
  }),
  student({
    name: 'Clementine Ruiz',
    classKey: 'english9-p1',
    arc: 'rising',
    baseline: 2.9,
    strength: 'voice_and_style',
    weakness: 'evidence_and_support',
    voice: 'a hallway that smells like paint',
  }),
  student({
    name: 'Bode Kristiansen',
    classKey: 'english9-p1',
    arc: 'steady-mid',
    baseline: 3,
    strength: 'organization_and_structure',
    weakness: 'grammar_and_mechanics',
    voice: 'a tent that leaks on one side',
  }),
  student({
    name: 'Aditi Venkatesan',
    classKey: 'english9-p1',
    arc: 'rising',
    baseline: 3.4,
    strength: 'thesis_and_content',
    weakness: 'voice_and_style',
    voice: 'a math competition I lost on purpose',
  }),
  student({
    name: 'Rafferty Doyle',
    classKey: 'english9-p1',
    arc: 'struggling',
    baseline: 2.2,
    strength: 'evidence_and_support',
    weakness: 'grammar_and_mechanics',
    voice: 'a dog that only listens to my brother',
  }),
  student({
    name: 'Nour Zaidan',
    classKey: 'english9-p1',
    arc: 'volatile',
    baseline: 3.2,
    strength: 'voice_and_style',
    weakness: 'organization_and_structure',
    voice: 'a grandmother’s recipe with no measurements',
  }),
  student({
    name: 'Teddy Kowalczyk',
    classKey: 'english9-p1',
    arc: 'slipping',
    baseline: 3.5,
    strength: 'grammar_and_mechanics',
    weakness: 'thesis_and_content',
    voice: 'a science fair volcano that worked too well',
  }),
  student({
    name: 'Ifeoma Adeyemi',
    classKey: 'english9-p1',
    arc: 'steady-high',
    baseline: 4,
    strength: 'evidence_and_support',
    weakness: 'voice_and_style',
    voice: 'a braid that took three hours',
  }),
  student({
    name: 'Sawyer Pike',
    classKey: 'english9-p1',
    arc: 'late-bloomer',
    baseline: 2.7,
    strength: 'thesis_and_content',
    weakness: 'organization_and_structure',
    voice: 'a creek behind the baseball field',
  }),
  student({
    name: 'Valentina Costa',
    classKey: 'english9-p1',
    arc: 'rising',
    baseline: 3.1,
    strength: 'organization_and_structure',
    weakness: 'grammar_and_mechanics',
    voice: 'a soccer jersey two sizes too big',
  }),
  student({
    name: 'Emmett Braddock',
    classKey: 'english9-p1',
    arc: 'steady-mid',
    baseline: 2.9,
    strength: 'grammar_and_mechanics',
    weakness: 'evidence_and_support',
    voice: 'a tractor that starts on the third try',
  }),
  student({
    name: 'Zuri Chikwe',
    classKey: 'english9-p1',
    arc: 'volatile',
    baseline: 3.3,
    strength: 'thesis_and_content',
    weakness: 'voice_and_style',
    voice: 'a double-dutch rope hitting pavement',
  }),
  student({
    name: 'Lars Petterson',
    classKey: 'english9-p1',
    arc: 'struggling',
    baseline: 2.4,
    strength: 'organization_and_structure',
    weakness: 'thesis_and_content',
    voice: 'an ice rink at six in the morning',
  }),
  student({
    name: 'Amelie Duchamp',
    classKey: 'english9-p1',
    arc: 'steady-mid',
    baseline: 3.2,
    strength: 'voice_and_style',
    weakness: 'evidence_and_support',
    voice: 'a bakery window I walk past twice',
  }),
  student({
    name: 'Rashad Toure',
    classKey: 'english9-p1',
    arc: 'rising',
    baseline: 2.8,
    strength: 'evidence_and_support',
    weakness: 'grammar_and_mechanics',
    voice: 'a barber who talks about history',
  }),
  student({
    name: 'Winona Blackfeather',
    classKey: 'english9-p1',
    arc: 'steady-high',
    baseline: 3.9,
    strength: 'voice_and_style',
    weakness: 'grammar_and_mechanics',
    voice: 'a drum I am not old enough to play',
  }),
  student({
    name: 'Grigor Petrov',
    classKey: 'english9-p1',
    arc: 'late-bloomer',
    baseline: 2.6,
    strength: 'thesis_and_content',
    weakness: 'voice_and_style',
    voice: 'a chess set missing a bishop',
  }),
  student({
    name: 'Saoirse Mullen',
    classKey: 'english9-p1',
    arc: 'slipping',
    baseline: 3.6,
    strength: 'voice_and_style',
    weakness: 'evidence_and_support',
    voice: 'a fiddle case older than my mother',
  }),
  student({
    name: 'Hugo Bellamy',
    classKey: 'english9-p1',
    arc: 'steady-mid',
    baseline: 3,
    strength: 'evidence_and_support',
    weakness: 'organization_and_structure',
    voice: 'a comic I have redrawn four times',
  }),
  student({
    name: 'Priyanka Sethi',
    classKey: 'english9-p1',
    arc: 'rising',
    baseline: 3.3,
    strength: 'organization_and_structure',
    weakness: 'voice_and_style',
    voice: 'a debate flowchart nobody else can read',
  }),
  student({
    name: 'Cormac Delaney',
    classKey: 'english9-p1',
    arc: 'volatile',
    baseline: 2.9,
    strength: 'grammar_and_mechanics',
    weakness: 'thesis_and_content',
    voice: 'a fishing pier at low tide',
  }),

  // --- AP English Literature, Period 7 --------------------------------------
  student({
    name: 'Genevieve Okonjo',
    classKey: 'ap-lit-p7',
    arc: 'steady-high',
    baseline: 4.8,
    strength: 'thesis_and_content',
    weakness: 'grammar_and_mechanics',
    voice: 'a margin note I wrote two years ago',
    anchor: true,
  }),
  student({
    name: 'Byron Halloway',
    classKey: 'ap-lit-p7',
    arc: 'struggling',
    baseline: 3.1,
    strength: 'voice_and_style',
    weakness: 'evidence_and_support',
    voice: 'a college essay draft I keep deleting',
    anchor: true,
  }),
  student({
    name: 'Sunita Raval',
    classKey: 'ap-lit-p7',
    arc: 'rising',
    baseline: 3.9,
    strength: 'evidence_and_support',
    weakness: 'voice_and_style',
    voice: 'a library carrel I consider mine',
  }),
  student({
    name: 'Theodore Mbeki',
    classKey: 'ap-lit-p7',
    arc: 'steady-high',
    baseline: 4.4,
    strength: 'organization_and_structure',
    weakness: 'voice_and_style',
    voice: 'a debate trophy I never unpacked',
  }),
  student({
    name: 'Odette Lavigne',
    classKey: 'ap-lit-p7',
    arc: 'slipping',
    baseline: 4.1,
    strength: 'voice_and_style',
    weakness: 'organization_and_structure',
    voice: 'a ballet shoe I refuse to throw out',
  }),
  student({
    name: 'Ignacio Serrano',
    classKey: 'ap-lit-p7',
    arc: 'steady-mid',
    baseline: 3.6,
    strength: 'thesis_and_content',
    weakness: 'grammar_and_mechanics',
    voice: 'a night shift that pays for the application fees',
  }),
  student({
    name: 'Harriet Ozawa',
    classKey: 'ap-lit-p7',
    arc: 'volatile',
    baseline: 3.8,
    strength: 'evidence_and_support',
    weakness: 'voice_and_style',
    voice: 'a darkroom timer I still hear at night',
  }),
  student({
    name: 'Cassius Bright',
    classKey: 'ap-lit-p7',
    arc: 'rising',
    baseline: 3.5,
    strength: 'voice_and_style',
    weakness: 'thesis_and_content',
    voice: 'an open mic where I read once',
  }),
  student({
    name: 'Yusra Rahimi',
    classKey: 'ap-lit-p7',
    arc: 'steady-high',
    baseline: 4.5,
    strength: 'thesis_and_content',
    weakness: 'voice_and_style',
    voice: 'a dictionary my father annotated',
  }),
  student({
    name: 'Beckett Lorne',
    classKey: 'ap-lit-p7',
    arc: 'slipping',
    baseline: 4,
    strength: 'organization_and_structure',
    weakness: 'evidence_and_support',
    voice: 'a senior year I am already leaving',
  }),
  student({
    name: 'Tomiko Arai',
    classKey: 'ap-lit-p7',
    arc: 'steady-mid',
    baseline: 3.7,
    strength: 'grammar_and_mechanics',
    weakness: 'voice_and_style',
    voice: 'a tea ceremony I only half remember',
  }),
  student({
    name: 'Ezekiel Vance',
    classKey: 'ap-lit-p7',
    arc: 'late-bloomer',
    baseline: 3.4,
    strength: 'evidence_and_support',
    weakness: 'organization_and_structure',
    voice: 'a pulpit I grew up underneath',
  }),
  student({
    name: 'Lucienne Marchand',
    classKey: 'ap-lit-p7',
    arc: 'rising',
    baseline: 3.8,
    strength: 'organization_and_structure',
    weakness: 'grammar_and_mechanics',
    voice: 'a translation I argued with for a week',
  }),
  student({
    name: 'Anwar Haddadi',
    classKey: 'ap-lit-p7',
    arc: 'volatile',
    baseline: 3.9,
    strength: 'thesis_and_content',
    weakness: 'organization_and_structure',
    voice: 'a chessboard set up for nobody',
  }),
];

export const DEMO_ROSTER_ASSIGNMENTS: DemoAssignmentSpec[] = [
  {
    key: 'p1-turning-point',
    classKeys: ['primary', 'english10-p2'],
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
    classKeys: ['primary', 'english10-p2'],
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
    classKeys: ['primary', 'english10-p2'],
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
    classKeys: ['primary', 'english10-p2'],
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
    classKeys: ['primary', 'english10-p2'],
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
    classKeys: ['primary', 'english10-p2'],
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
    classKeys: ['secondary'],
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
    classKeys: ['secondary'],
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
    classKeys: ['secondary'],
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
    classKeys: ['secondary'],
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
    classKeys: ['secondary'],
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

  // --- English 9, Period 1 --------------------------------------------------
  {
    key: 'n1-first-time',
    classKeys: ['english9-p1'],
    assignmentTypeKey: 'five-paragraph',
    title: 'Personal Narrative: The First Time',
    prompt:
      'Write about the first time you did something that scared you. Use specific detail — put the reader in the room.',
    pointValue: 100,
    weeksAgo: 29,
    state: 'released',
    topic: {
      subject: 'the first time I did something that scared me',
      claimHigh:
        'I did not stop being afraid that day; I only learned that being afraid and going anyway are allowed to happen at the same time.',
      claimMid:
        'That day taught me that being scared does not have to stop you.',
      claimLow: 'That day I was scared but I did it anyway.',
      source: 'what I remember',
      quote: 'you can go now',
      counter: 'one moment does not really change anybody',
    },
  },
  {
    key: 'n2-museum',
    classKeys: ['english9-p1'],
    assignmentTypeKey: 'thesis',
    title: 'Argument Essay: What Belongs in a Museum',
    prompt:
      'Argue what a museum owes the people an object came from. Use at least two sources and answer the other side.',
    pointValue: 100,
    weeksAgo: 22,
    state: 'released',
    topic: {
      subject: 'who an object in a glass case actually belongs to',
      claimHigh:
        'A museum does not preserve an object so much as it preserves a decision about who was allowed to keep it.',
      claimMid:
        'Museums protect objects, but they also decide who gets to see them and who does not.',
      claimLow: 'Museums should give some things back to were they came from.',
      source: 'the museum’s own catalog',
      quote: 'acquired during the expedition of 1889',
      counter: 'the objects are safer and better cared for where they are',
    },
  },
  {
    key: 'n3-who-belongs',
    classKeys: ['english9-p1'],
    assignmentTypeKey: 'thesis',
    title: 'Literary Analysis: Who Gets to Belong',
    prompt:
      'Analyze how a character is kept outside the group in the novel. Quote the text and explain what the quote shows.',
    pointValue: 100,
    weeksAgo: 15,
    state: 'released',
    topic: {
      subject: 'how a group decides who is outside it',
      claimHigh:
        'Nobody in the novel ever votes him out; he is excluded by a hundred small courtesies that never quite include him.',
      claimMid:
        'The other characters never say he does not belong, but they treat him like he does not.',
      claimLow: 'He doesnt belong and the other characters make that clear.',
      source: 'the novel',
      quote: 'they made room, but not for him',
      counter: 'he keeps himself apart as much as they keep him out',
    },
  },
  {
    key: 'n4-rumor',
    classKeys: ['english9-p1'],
    assignmentTypeKey: 'thesis',
    title: 'Informative Essay: How a Rumor Works',
    prompt:
      'Explain how a rumor spreads and why it changes as it travels. Ground your explanation in evidence, not opinion.',
    pointValue: 100,
    weeksAgo: 8,
    state: 'released',
    topic: {
      subject: 'why a story changes every time it is retold',
      claimHigh:
        'A rumor does not survive because it is believable; it survives because each teller improves it slightly in their own favor.',
      claimMid:
        'A rumor changes because everyone who repeats it adds a little of themselves.',
      claimLow: 'Rumors change alot because people add stuff to them.',
      source: 'the study we read in class',
      quote: 'each retelling shortened the story and sharpened the blame',
      counter: 'people mostly repeat what they hear without changing it',
    },
  },
  {
    key: 'n5-phones',
    classKeys: ['english9-p1'],
    assignmentTypeKey: 'thesis',
    title: 'Argument Essay: Phones in the Building',
    prompt:
      'Take a position on the phone policy. Make the strongest version of the opposing argument before you answer it.',
    pointValue: 100,
    weeksAgo: 2,
    state: 'awaiting-grading',
    topic: {
      subject: 'what a phone policy is actually trying to fix',
      claimHigh:
        'The policy is written as though attention were a discipline problem, which is why it keeps failing to solve one.',
      claimMid: 'The phone rule treats a hard problem like it is a simple one.',
      claimLow: 'The phone rule is not fair and it doesnt even work.',
      source: 'the policy memo',
      quote: 'devices shall remain stowed during instructional time',
      counter: 'without a firm rule nobody would put anything away at all',
    },
  },

  // --- AP English Literature, Period 7 --------------------------------------
  {
    key: 'a1-sonnet-turn',
    classKeys: ['ap-lit-p7'],
    assignmentTypeKey: 'thesis',
    title: 'Close Reading: The Turn in a Sonnet',
    prompt:
      'Close-read a single sonnet. Build your argument from the volta outward, and do not summarize.',
    pointValue: 100,
    weeksAgo: 27,
    state: 'released',
    topic: {
      subject: 'what a sonnet concedes at the moment it turns',
      claimHigh:
        'The volta is not a change of mind but a confession: the octave was an argument the speaker was making to himself, and it did not hold.',
      claimMid:
        'The turn shows the speaker was not as sure as the first eight lines pretended.',
      claimLow: 'The turn is were the poem changes its mind.',
      source: 'the sonnet',
      quote: 'and yet I do not think it so',
      counter: 'the turn is a convention of the form, not a real reversal',
    },
  },
  {
    key: 'a2-domestic-power',
    classKeys: ['ap-lit-p7'],
    assignmentTypeKey: 'thesis',
    title: 'Critical Lens: Power in the Domestic Novel',
    prompt:
      'Apply a critical lens to the novel’s treatment of household authority. The lens should sharpen the reading, not replace it.',
    pointValue: 100,
    weeksAgo: 20,
    state: 'released',
    topic: {
      subject: 'where authority actually sits in a household novel',
      claimHigh:
        'The novel locates power not in whoever gives the orders but in whoever is permitted to leave the room.',
      claimMid:
        'The person with real power in the house is not the one who speaks the most.',
      claimLow: 'The men have the power but the women control things anyway.',
      source: 'the novel',
      quote: 'she rose, and no one asked her where she was going',
      counter: 'reading domestic scenes as political flattens them',
    },
  },
  {
    key: 'a3-two-elegies',
    classKeys: ['ap-lit-p7'],
    assignmentTypeKey: 'thesis',
    title: 'Comparative Analysis: Two Elegies',
    prompt:
      'Compare how two elegies handle the thing they cannot say. Structure the comparison around an argument, not a list.',
    pointValue: 100,
    weeksAgo: 13,
    state: 'released',
    topic: {
      subject: 'what an elegy refuses to say out loud',
      claimHigh:
        'Both poems mourn by describing furniture, because the grief itself is the one subject neither speaker can approach directly.',
      claimMid:
        'Both poems talk about small ordinary things instead of the loss itself.',
      claimLow: 'Both poems are sad but they show it in diffrent ways.',
      source: 'the second elegy',
      quote: 'the chair is where the chair has always been',
      counter: 'the indirection is just decorum, not meaning',
    },
  },
  {
    key: 'a4-unfinished-ending',
    classKeys: ['ap-lit-p7'],
    assignmentTypeKey: 'thesis',
    title: 'Literary Argument: The Unfinished Ending',
    prompt:
      'Argue what the novel’s refusal to resolve accomplishes. Anticipate the reader who calls it a failure of nerve.',
    pointValue: 100,
    weeksAgo: 6,
    state: 'released',
    topic: {
      subject: 'what a novel gains by refusing to end',
      claimHigh:
        'The unresolved ending is the novel’s last argument: it withholds the closure the reader wants in order to prove the reader wanted it too badly.',
      claimMid:
        'By not resolving, the novel makes the reader sit with the same uncertainty the characters do.',
      claimLow: 'The ending is unfinished which makes the reader think.',
      source: 'the final chapter',
      quote: 'there was, of course, more to say',
      counter: 'an unresolved ending is usually a writer running out of road',
    },
  },
  {
    key: 'a5-timed-prose',
    classKeys: ['ap-lit-p7'],
    assignmentTypeKey: 'thesis',
    title: 'Timed Essay: Prose Passage Analysis',
    prompt:
      'Forty minutes, one passage. Make a defensible claim about how the prose works and support it with the passage itself.',
    pointValue: 100,
    weeksAgo: 1,
    state: 'awaiting-grading',
    topic: {
      subject: 'how a passage controls the reader’s sympathy',
      claimHigh:
        'The passage earns sympathy for a character it never defends, by letting the narrator notice what the character cannot afford to.',
      claimMid:
        'The narration makes the reader feel for a character the story never argues for.',
      claimLow: 'The passage makes you feel bad for him even tho he is wrong.',
      source: 'the passage',
      quote: 'he did not look at the window again',
      counter: 'the sympathy comes from the plot, not the prose',
    },
  },

  // --- Rows the persona seed already created --------------------------------
  // These exist before the roster runs and would otherwise sit empty, showing
  // an assignment with no papers behind it on the class page.
  {
    key: 'legacy-civic-responsibility',
    existingKey: 'civic-responsibility',
    classKeys: ['primary'],
    assignmentTypeKey: 'thesis',
    title: 'Thesis essay: civic responsibility',
    prompt:
      'Write a thesis-driven essay about how schools can prepare students for civic responsibility.',
    pointValue: 100,
    weeksAgo: 3,
    state: 'released',
    topic: {
      subject: 'what a school owes the citizens it graduates',
      claimHigh:
        'A school teaches civic responsibility in how it settles an argument, not in the semester it spends naming the branches of government.',
      claimMid:
        'Schools teach citizenship best by how they handle disagreement, not just by what they cover in class.',
      claimLow: 'Schools should teach us more about being a citizen.',
      source: 'the student handbook',
      quote: 'students are expected to participate constructively',
      counter: 'civics is a family responsibility, not a school one',
    },
  },
  {
    key: 'legacy-daily-pages',
    existingKey: 'daily-pages',
    classKeys: ['primary'],
    assignmentTypeKey: 'daily-pages',
    title: 'Daily Pages - week 2',
    prompt:
      'Write freely for ten minutes about something that surprised you this week.',
    pointValue: 0,
    weeksAgo: 2,
    state: 'awaiting-grading',
    form: 'free-write',
    topic: {
      subject: 'something that surprised me this week',
      claimHigh:
        'What surprised me was not the thing itself but how long I had been walking past it.',
      claimMid: 'Something small this week caught me off guard.',
      claimLow: 'This week something suprised me alot.',
      source: 'nothing in particular',
      quote: 'ten minutes, no stopping',
      counter: 'nothing much happened this week',
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

/**
 * Free writes are a different animal from the essays: ten minutes, no thesis,
 * no sources. Separate pools keep a Daily Pages entry from reading like an
 * argument essay that lost its citations.
 */
export const FREE_WRITE_POOLS: Record<
  'high' | 'mid' | 'low',
  { openers: Sentence[]; middles: Sentence[]; closers: Sentence[] }
> = {
  high: {
    openers: [
      (t) =>
        `Ten minutes is not long enough to be careful, so here is ${t.subject}, unedited.`,
      () =>
        `I did not plan to write about this and I am already three sentences in, which probably means something.`,
      () =>
        `The prompt says write freely, so I am going to start in the middle and see where it lands.`,
      () =>
        `I keep circling the same small thing this week, so I might as well put it down.`,
    ],
    middles: [
      () =>
        `It was not dramatic. It was the kind of thing you notice once and then cannot stop noticing, which is worse, because now it follows me around.`,
      () =>
        `What gets me is the ordinariness of it. Nobody announced anything. It had been true for a while and I had simply been too busy to look directly at it.`,
      () =>
        `I have been trying to decide whether this is a real observation or just something I want to be true because it makes a better story.`,
      () =>
        `The strange part is how quickly it stopped being strange. Two days later it was just the way things are, and I had to work to remember being surprised at all.`,
    ],
    closers: [
      () =>
        `I do not have an ending for this yet. That is probably the honest place to stop.`,
      () =>
        `If I wrote this again tomorrow it would come out differently, and I think that is the point of doing it every day.`,
      () =>
        `Ten minutes is up and I am somewhere I did not expect to be, which counts as a good session.`,
    ],
  },
  mid: {
    openers: [
      (t) => `This week I want to write about ${t.subject}.`,
      () => `I am not totally sure what to write, so I will just start.`,
      () => `Something happened this week that I keep thinking about.`,
      () => `Free writing is hard for me, but here goes.`,
    ],
    middles: [
      () =>
        `It was not a big deal at the time. Looking back, it stuck with me more than I expected it to, and I am still not sure why.`,
      () =>
        `I noticed it in the middle of doing something else, which is usually when I notice anything at all.`,
      () =>
        `At first I thought it was just me being tired. Then it happened again and I started paying attention.`,
      () =>
        `I told one person about it and they did not think it was interesting, which made me think about it even more.`,
    ],
    closers: [
      () => `Anyway, that is what has been on my mind this week.`,
      () => `I am still figuring out what I think about it.`,
      () => `That is all I have for ten minutes.`,
    ],
  },
  low: {
    openers: [
      (t) => `Today I am writing about ${t.subject}.`,
      () => `I dont really know what to write about so I will just write.`,
      () => `This week was pretty normal but one thing happened.`,
      () => `Free write time. Here we go.`,
    ],
    middles: [
      () =>
        `It wasnt a big thing but it stuck with me. I kept thinking about it later when I was supposed to be doing other stuff.`,
      () =>
        `I noticed it and then I forgot about it, then I remembered it again which is weird.`,
      () =>
        `My friend didnt think it was a big deal, but it was to me for some reason.`,
      () =>
        `I dont have alot to say about it but it was different then normal.`,
    ],
    closers: [
      () => `Thats pretty much it for today.`,
      () => `I ran out of things to say but the timer isnt done.`,
      () => `Anyway thats what I was thinking about.`,
    ],
  },
};

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
