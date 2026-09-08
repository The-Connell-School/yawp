import type {
  ExitTicketConfig,
  ExitTicketLessonNotes,
} from '../../../../services/web-app/app/domain/assignment-types/exit-ticket.ts';
import type { LocalDevPersonaRole } from './dev-personas.ts';

/**
 * The worked set of exit tickets the local-dev seed writes.
 *
 * Kept as data rather than as a run of seeding calls so the set can be checked
 * for coverage without a database: a preview is meant to show every shape an
 * exit ticket comes in — both modes, every focus, notes filled in fully, partly
 * and not at all, graded-for-points beside feedback-only, and a response in
 * every band — and a configuration is easy to drop by accident.
 * `exit-ticket-demo-data.test.ts` asserts the matrix.
 *
 * Prompts are not written here. The seed composes each one with the same
 * function the product uses, so the demo cannot drift from what a teacher
 * would really get.
 */

export type DemoExitTicketResponseState =
  /** Handed in, read, scored, released. */
  | 'graded'
  /** Handed in and waiting — what a teacher sees before the grading run. */
  | 'submitted'
  /** Started and never handed in. */
  | 'draft';

export type DemoExitTicketResponse = {
  personaKey: LocalDevPersonaRole;
  text: string;
  state: DemoExitTicketResponseState;
  /** Present only on a graded response, scored 0-100 against the bands. */
  score?: number;
  letterGrade?: string;
  overallComment?: string;
};

export type DemoExitTicket = {
  title: string;
  /** Why this one is in the set: the configuration it exists to show. */
  demonstrates: string;
  config: ExitTicketConfig;
  submitForGrade: boolean;
  pointValue: number | null;
  tutorEnabled: boolean;
  responses: DemoExitTicketResponse[];
};

/** A partly-filled set of notes: the fields a teacher left blank stay blank. */
function notes(partial: Partial<ExitTicketLessonNotes>): ExitTicketLessonNotes {
  return {
    mainPoints: partial.mainPoints ?? '',
    mustMention: partial.mustMention ?? '',
    watchFor: partial.watchFor ?? '',
  };
}

export const EXIT_TICKET_DEMO_TICKETS: DemoExitTicket[] = [
  {
    title: 'Exit ticket: the water cycle',
    demonstrates:
      'Specific, all three notes, graded for points: the fully-specified case.',
    config: {
      schemaVersion: 1,
      mode: 'specific',
      focus: 'explain-concept',
      topic: 'how energy moves through the water cycle',
      lessonNotes: notes({
        mainPoints:
          'Energy enters as sunlight, is carried as latent heat in water vapour, and is released again when the vapour condenses.',
        mustMention:
          'That the energy is released when water vapour condenses, not when it evaporates.',
        watchFor:
          'Describing where the water goes without ever mentioning energy.',
      }),
    },
    submitForGrade: true,
    pointValue: 10,
    tutorEnabled: false,
    responses: [
      {
        personaKey: 'student-graded',
        state: 'graded',
        text: 'The sun puts energy into the water when it evaporates, and the water carries that energy with it as vapour. The part I did not get until today is that the energy does not disappear up there. It gets let go again when the vapour cools down and condenses into cloud, which is why storms have so much energy in them. So the water cycle is really moving energy around, not just moving water around.',
        score: 92,
        letterGrade: 'A',
        overallComment:
          'Rosa, you have got the thing this was checking for: you explained that the energy is released at condensation, not at evaporation, and you did it in your own words. The line about storms shows you following the idea somewhere of your own. Next step is saying where that energy came from in the first place.',
      },
      {
        personaKey: 'student-submitted',
        state: 'graded',
        text: 'The water cycle is evaporation, condensation, precipitation and collection. The water goes up into the clouds and then comes back down as rain and then it goes into rivers and back to the ocean and starts again.',
        score: 38,
        letterGrade: 'F',
        overallComment:
          'Marcus, this is an accurate list of the stages, but it is the list you were given rather than an explanation of it. The question was about energy, and energy is not mentioned anywhere here. Have another go at just one step: what happens to the sun energy when the vapour turns back into water?',
      },
    ],
  },

  {
    title: 'Exit ticket: balancing equations',
    demonstrates:
      'Specific, feedback only: the honest-confusion case the rubric protects.',
    config: {
      schemaVersion: 1,
      mode: 'specific',
      focus: 'clear-up-confusion',
      topic: 'how to balance a chemical equation',
      lessonNotes: notes({
        mainPoints:
          'Atoms are conserved, so coefficients change but subscripts never do.',
        mustMention: 'That you may only change coefficients, not subscripts.',
        watchFor:
          'Changing a subscript to make the counts match, which changes the substance.',
      }),
    },
    submitForGrade: false,
    pointValue: null,
    tutorEnabled: false,
    responses: [
      {
        personaKey: 'student',
        state: 'graded',
        text: 'I understand why we balance them. The number of atoms has to be the same on both sides because atoms do not just appear. What I keep getting stuck on is which number I am allowed to change. I know I am supposed to change the big number in front, but when I am halfway through and the oxygens still do not match, I end up changing the little number instead because it works. I think that is wrong because it makes it a different chemical, but I am not sure why that matters more than getting the counts even.',
        score: 74,
        letterGrade: 'C',
        overallComment:
          'Ana, this is exactly the kind of answer that helps me teach. You have the principle right, and you have found the precise place you come unstuck rather than saying you do not get it. You are also right about why changing the subscript is a problem: it makes it a different substance. Hold on to that instinct, and tomorrow we will work on what to do when the oxygens will not come out even.',
      },
    ],
  },

  {
    title: 'Exit ticket: how well do you have cell division?',
    demonstrates:
      'Specific, self-assessment: the miscalibrated confident answer.',
    config: {
      schemaVersion: 1,
      mode: 'specific',
      focus: 'judge-understanding',
      topic: 'today’s lesson on mitosis and meiosis',
      lessonNotes: notes({
        mainPoints:
          'Mitosis makes two identical cells; meiosis makes four cells with half the chromosomes.',
        mustMention: 'That meiosis halves the chromosome number.',
        watchFor: 'Saying both processes make identical cells.',
      }),
    },
    submitForGrade: false,
    pointValue: null,
    tutorEnabled: false,
    responses: [
      {
        personaKey: 'student-unreleased',
        state: 'graded',
        text: 'I understand this really well. I paid attention the whole lesson and the diagrams made sense to me. I could definitely explain mitosis and meiosis to someone else, they are both ways that cells divide to make new cells. I would say I am at a 9 out of 10 on this one.',
        score: 36,
        letterGrade: 'F',
        overallComment:
          'Jamal, you sound confident, and that is worth something. But the only thing you actually said about the two processes is that both divide cells, which is the part they share. This ticket was asking you to test yourself: try naming one way meiosis differs from mitosis. If that is harder than it felt in the lesson, that is useful to know now rather than on Friday.',
      },
    ],
  },

  {
    title: 'Exit ticket: two-step equations',
    demonstrates:
      'Specific, graded, whole class: every band on one ticket. The clearest demonstration of what this rubric rewards — the student who gets the wrong answer with sound reasoning outscores the one who gets it right and shows nothing.',
    config: {
      schemaVersion: 1,
      mode: 'specific',
      focus: 'apply-skill',
      topic: 'solving a two-step equation like 3x + 7 = 22',
      lessonNotes: notes({
        mainPoints:
          'Undo the addition or subtraction first, then undo the multiplication. Whatever you do to one side you do to the other.',
        mustMention: 'Why the +7 comes off before the 3 is divided out.',
        watchFor:
          'Dividing by 3 first, which leaves a fraction and usually ends in a wrong answer.',
      }),
    },
    submitForGrade: true,
    pointValue: 10,
    tutorEnabled: false,
    responses: [
      {
        personaKey: 'student-graded',
        state: 'graded',
        text: 'First I take the 7 off both sides, so 3x + 7 = 22 becomes 3x = 15. I do the 7 first because it is the thing furthest from the x, and I am peeling the equation back in the opposite order from how it was built. Then I divide both sides by 3 and get x = 5. I checked it by putting 5 back in: 3 times 5 is 15, plus 7 is 22, so it works.',
        score: 94,
        letterGrade: 'A',
        overallComment:
          'Rosa, you did not just do the steps, you said why they go in that order — peeling it back in the opposite order from how it was built is exactly it. Checking your answer by substituting back is a habit worth keeping.',
      },
      {
        personaKey: 'student',
        state: 'graded',
        text: 'You have to get rid of the 7 first because it is added on, and you can only undo the multiplying once the adding is gone. So 3x + 7 = 22 turns into 3x = 15. Then I divide by 3. I got x = 4 but I am not sure, I think I divided wrong at the end.',
        score: 72,
        letterGrade: 'C',
        overallComment:
          'Ana, your final answer is wrong, and your understanding is not. You explained why the +7 comes off first, which is the thing this was checking for, and you caught that the last step was where it went astray. Redo just that division: 15 divided by 3.',
      },
      {
        personaKey: 'student-submitted',
        state: 'graded',
        text: 'x = 5',
        score: 40,
        letterGrade: 'F',
        overallComment:
          'Marcus, that is the right answer, so something is working. But this ticket was asking for your thinking, and there is none here to read — I cannot tell whether you know why the 7 comes off before you divide, or whether you remembered the pattern. Show me the order next time and say why.',
      },
      {
        personaKey: 'student-unreleased',
        state: 'graded',
        text: 'idk',
        score: 0,
        letterGrade: 'F',
        overallComment:
          'Jamal, there is nothing here for me to work with. If you are stuck, tell me where — even "I do not know which number to move first" gives me something to teach to. Come find me before Friday.',
      },
    ],
  },

  {
    title: 'Exit ticket: the second stanza',
    demonstrates:
      'Specific, a text: the same reading, anchored and unanchored.',
    config: {
      schemaVersion: 1,
      mode: 'specific',
      focus: 'understand-text',
      topic: 'the second stanza of “Those Winter Sundays”',
      lessonNotes: notes({
        mainPoints:
          'The speaker is looking back as an adult and recognising love in his father’s labour that he could not see as a child.',
        mustMention:
          'That the recognition is retrospective — the child did not see it at the time.',
        watchFor:
          'Reading the cold as only weather rather than as the household’s mood.',
      }),
    },
    submitForGrade: false,
    pointValue: null,
    tutorEnabled: false,
    responses: [
      {
        personaKey: 'student-graded',
        state: 'graded',
        text: 'I think the stanza is about the speaker realising something late. He says he woke and heard the cold "splintering, breaking" which is not really about the temperature, it is about how the house felt, like something was about to crack. And he says he spoke "indifferently" to his father, which is a strange word to choose about yourself unless you are looking back and wincing at it. That word is what made me think he is telling this from years later, not as it happened.',
        score: 91,
        letterGrade: 'A',
        overallComment:
          'Rosa, you did the thing this was asking for: you told me what the stanza means and then pointed at the words that got you there. Picking "indifferently" as the tell is a genuinely good catch — that is close reading.',
      },
      {
        personaKey: 'student',
        state: 'graded',
        text: 'The stanza is about the speaker remembering his father and feeling bad about how he treated him. It is sad and it shows that he did not appreciate what his father did for him until later on when he was older.',
        score: 66,
        letterGrade: 'D',
        overallComment:
          'Ana, your reading is right, and it would be much stronger with the poem in it. Nothing here points at a word or a line, so I cannot tell whether you got this from the text or from our discussion. Go back and find the one word that shows he is looking back.',
      },
    ],
  },

  {
    title: 'Exit ticket: the New Deal',
    demonstrates:
      'Specific, connecting to earlier learning: a real mismatch beats a tidy connection.',
    config: {
      schemaVersion: 1,
      mode: 'specific',
      focus: 'connect-learning',
      topic: 'the New Deal',
      lessonNotes: notes({
        mainPoints:
          'The New Deal expanded federal power in ways the Progressive Era had started, but went much further and faced far less consensus.',
        mustMention:
          'A specific link to the Progressive Era reforms we studied.',
        watchFor:
          'Saying it is "just like" the Progressive Era without naming what was different.',
      }),
    },
    submitForGrade: false,
    pointValue: null,
    tutorEnabled: false,
    responses: [
      {
        personaKey: 'student-submitted',
        state: 'graded',
        text: 'It picks up where the Progressives left off, with the government stepping in on things it used to leave alone. But the part that does not fit is how people reacted. The Progressive reforms we read about had a lot of agreement behind them, and the New Deal had the Court striking things down and people calling it socialism. So it is the same direction but a completely different temperature, and I am not totally sure why the reaction was so different when the idea was similar.',
        score: 90,
        letterGrade: 'A',
        overallComment:
          'Marcus, the connection is good and the mismatch is better. Noticing that the same direction met a completely different reaction is the more interesting observation, and the question you end on is the one historians argue about. Bring it to Monday.',
      },
      {
        personaKey: 'student-unreleased',
        state: 'graded',
        text: 'The New Deal connects to the Progressive Era because they both wanted to help people and make the country better. They are both examples of the government doing more to fix problems in society.',
        score: 42,
        letterGrade: 'F',
        overallComment:
          'Jamal, this is true but it would be true of almost any two reforms — nothing here is specific to the New Deal or to what we actually read about the Progressives. Name one Progressive reform from our unit and say what the New Deal did that went further.',
      },
    ],
  },

  {
    title: 'Exit ticket: Thursday',
    demonstrates:
      'Basic, no notes: the open-ended case, and the hardest one to read.',
    config: { schemaVersion: 1, mode: 'basic' },
    submitForGrade: false,
    pointValue: null,
    tutorEnabled: false,
    responses: [
      {
        personaKey: 'student-graded',
        state: 'graded',
        text: 'What I actually got today was that the reason we do the reading before the discussion is not to check we did it. It is because the discussion is where you find out what you missed. I always thought the reading was the work and the talking was the easy bit, but I said something today that I only worked out while I was saying it. So maybe the talking is also the work.',
        score: 68,
        letterGrade: 'D',
        overallComment:
          'Rosa, this is a real observation about how you learn, and it is the kind of thing this ticket is good at catching. You noticed something true about yourself. It sits a little away from the content of the lesson, so I cannot tell from this what you took from the reading itself, but I am glad you wrote it.',
      },
    ],
  },

  {
    title: 'Exit ticket: end of Friday',
    demonstrates:
      'Basic with notes, graded for points at 5: the standard question, but the grader knows what the lesson was. The pairing with "Thursday" is the whole argument for filling the notes in.',
    config: {
      schemaVersion: 1,
      mode: 'basic',
      lessonNotes: notes({
        mainPoints:
          'Fractions can only be added once the denominators match, because the pieces have to be the same size before you can count them together.',
        mustMention:
          'That you cannot add fifths to thirds until both are cut into the same size pieces.',
        watchFor: 'Adding the numerators and the denominators straight across.',
      }),
    },
    submitForGrade: true,
    pointValue: 5,
    tutorEnabled: false,
    responses: [
      {
        personaKey: 'student-graded',
        state: 'graded',
        text: 'What I learned is that you cannot just add the tops and the bottoms, which is what I have been doing all year without anyone catching it. The reason is that a third and a fifth are different sized pieces, so counting them together does not mean anything until you cut them both into fifteenths. Then they are the same size and you can count them. It is like you cannot add three apples and five oranges and say you have eight apples.',
        score: 88,
        letterGrade: 'B',
        overallComment:
          'Rosa, the apples and oranges line is doing real work here — that is the idea, not a slogan about it. You also named the habit you are breaking, which is the honest part. Nothing to fix.',
      },
      {
        personaKey: 'student',
        state: 'graded',
        text: 'What I learned today was more about how I work than about the maths. I finally asked a question in front of everyone instead of waiting until the end, and nobody laughed, which I had genuinely been worried about. I think I will do that again.',
        score: 52,
        letterGrade: 'F',
        overallComment:
          'Ana, I am glad you wrote this and I hope you do it again — that took something. The ticket asked openly, so this is a fair answer to the question I asked. It just does not tell me whether the fractions landed, so I will check that with you directly on Monday rather than guess.',
      },
      {
        personaKey: 'student-submitted',
        state: 'graded',
        text: 'Today we did adding fractions with different denominators.',
        score: 22,
        letterGrade: 'F',
        overallComment:
          'Marcus, that is the topic, not what you learned about it. One more sentence would do it: what has to be true about two fractions before you are allowed to add them?',
      },
    ],
  },

  {
    title: 'Exit ticket: why the Senate is not proportional',
    demonstrates:
      'Specific with no notes at all: a named target, but nothing for the grader to read against beyond the question itself.',
    config: {
      schemaVersion: 1,
      mode: 'specific',
      focus: 'explain-concept',
      topic: 'why every state gets two senators regardless of population',
    },
    submitForGrade: false,
    pointValue: null,
    tutorEnabled: false,
    responses: [
      {
        personaKey: 'student-submitted',
        state: 'graded',
        text: 'It was a compromise, because the small states would not have joined otherwise. The big states wanted seats by population and the small ones wanted every state equal, so they did both — one house each way. The bit I find strange is that the compromise is still running now, when the reason for it was getting thirteen states to sign something in 1787.',
        score: 84,
        letterGrade: 'B',
        overallComment:
          'Marcus, you explained the trade rather than naming it, and the last line is a genuinely good question. Hold it for the unit on representation.',
      },
      {
        personaKey: 'student-unreleased',
        state: 'graded',
        text: 'Because of the Great Compromise. Every state gets two senators no matter how big it is.',
        score: 30,
        letterGrade: 'F',
        overallComment:
          'Jamal, both sentences are correct, and neither of them is an explanation — the second one restates the question and the first one names it. Why did the small states insist on it?',
      },
    ],
  },

  {
    title: 'Exit ticket: reading speed off a graph',
    demonstrates:
      'Specific with only the main points filled in, and the tutor deliberately left on: a skill check where the teacher wants students to have help while they work.',
    config: {
      schemaVersion: 1,
      mode: 'specific',
      focus: 'apply-skill',
      topic: 'working out speed from a distance-time graph',
      lessonNotes: notes({
        mainPoints:
          'Speed is the steepness of the line: distance covered divided by the time it took. A flat section means stopped, not slow.',
      }),
    },
    submitForGrade: true,
    pointValue: 10,
    tutorEnabled: true,
    responses: [
      {
        personaKey: 'student',
        state: 'graded',
        text: 'You take two points on the line and do the distance between them divided by the time between them, so for the first part it went 40 m in 8 s which is 5 m/s. The flat bit in the middle confused me at first because I thought it meant going slowly, but distance is not changing at all there, so they must have stopped. I am less sure about the last section because the line is curved and I do not think you can do it the same way.',
        score: 78,
        letterGrade: 'C',
        overallComment:
          'Ana, the method is right and you talked yourself out of the flat-section mistake, which is the one most people make. You are also right to be unsure about the curve — that is a real limit of the method, not a gap in you. That is next week.',
      },
      {
        personaKey: 'student-unreleased',
        state: 'graded',
        text: 'speed = distance / time',
        score: 15,
        letterGrade: 'F',
        overallComment:
          'Jamal, that is the formula, and the ticket was asking you to use it on the graph. Pick any two points on the first straight section and show me the numbers you would put in.',
      },
    ],
  },

  {
    title: 'Exit ticket: what still does not make sense about photosynthesis',
    demonstrates:
      'Handed in but not yet read, and one never handed in at all: what the ticket looks like before a grading run, not only after.',
    config: {
      schemaVersion: 1,
      mode: 'specific',
      focus: 'clear-up-confusion',
      topic: 'photosynthesis',
      lessonNotes: notes({
        watchFor:
          'Thinking the plant takes in food through its roots rather than making it.',
      }),
    },
    submitForGrade: false,
    pointValue: null,
    tutorEnabled: false,
    responses: [
      {
        personaKey: 'student-graded',
        state: 'submitted',
        text: 'The part I cannot get straight is where the actual stuff of the plant comes from. I understand the light and the water and the carbon dioxide going in, but a tree is heavy, and I do not see how something that heavy comes out of air and water. It feels like it has to be coming out of the soil even though you said it is not.',
      },
      {
        personaKey: 'student-submitted',
        state: 'draft',
        text: 'I think I get most of it except',
      },
    ],
  },
];
