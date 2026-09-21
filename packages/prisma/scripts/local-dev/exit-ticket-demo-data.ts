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
      answerType: 'objective',
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
          'Casey, you have got the thing this was checking for: you explained that the energy is released at condensation, not at evaporation, and you did it in your own words. The line about storms shows you following the idea somewhere of your own. Next step is saying where that energy came from in the first place.',
      },
      {
        personaKey: 'student-submitted',
        state: 'graded',
        text: 'The water cycle is evaporation, condensation, precipitation and collection. The water goes up into the clouds and then comes back down as rain and then it goes into rivers and back to the ocean and starts again.',
        score: 38,
        letterGrade: 'F',
        overallComment:
          'Riley, this is an accurate list of the stages, but it is the list you were given rather than an explanation of it. The question was about energy, and energy is not mentioned anywhere here. Have another go at just one step: what happens to the sun energy when the vapour turns back into water?',
      },
    ],
  },

  {
    title: 'Exit ticket: balancing equations',
    demonstrates:
      'Ask a question, feedback only: the honest-confusion case the rubric protects.',
    config: {
      schemaVersion: 1,
      mode: 'specific',
      focus: 'ask-question',
      topic: 'how to balance a chemical equation',
      answerType: 'subjective',
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
          'Sam, this is exactly the kind of answer that helps me teach. You have the principle right, and you have found the precise place you come unstuck rather than saying you do not get it. You are also right about why changing the subscript is a problem: it makes it a different substance. Hold on to that instinct, and tomorrow we will work on what to do when the oxygens will not come out even.',
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
      focus: 'explain-concept',
      topic: 'why you undo the +7 before dividing by 3 in 3x + 7 = 22',
      answerType: 'objective',
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
          'Casey, you did not just do the steps, you said why they go in that order — peeling it back in the opposite order from how it was built is exactly it. Checking your answer by substituting back is a habit worth keeping.',
      },
      {
        personaKey: 'student',
        state: 'graded',
        text: 'You have to get rid of the 7 first because it is added on, and you can only undo the multiplying once the adding is gone. So 3x + 7 = 22 turns into 3x = 15. Then I divide by 3. I got x = 4 but I am not sure, I think I divided wrong at the end.',
        score: 72,
        letterGrade: 'C',
        overallComment:
          'Sam, your final answer is wrong, and your understanding is not. You explained why the +7 comes off first, which is the thing this was checking for, and you caught that the last step was where it went astray. Redo just that division: 15 divided by 3.',
      },
      {
        personaKey: 'student-submitted',
        state: 'graded',
        text: 'x = 5',
        score: 40,
        letterGrade: 'F',
        overallComment:
          'Riley, that is the right answer, so something is working. But this ticket was asking for your thinking, and there is none here to read — I cannot tell whether you know why the 7 comes off before you divide, or whether you remembered the pattern. Show me the order next time and say why.',
      },
      {
        personaKey: 'student-unreleased',
        state: 'graded',
        text: 'idk',
        score: 0,
        letterGrade: 'F',
        overallComment:
          'Taylor, there is nothing here for me to work with. If you are stuck, tell me where — even "I do not know which number to move first" gives me something to teach to. Come find me before Friday.',
      },
    ],
  },

  {
    title: 'Exit ticket: the second stanza',
    demonstrates:
      'Understand a text, with no desired response: the same reading, anchored and unanchored. The clearest case for the open setting — a defensible reading the teacher did not expect is still a good reading.',
    config: {
      schemaVersion: 1,
      mode: 'specific',
      focus: 'understand-text',
      topic: 'the second stanza of “Those Winter Sundays”',
      answerType: 'subjective',
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
          'Casey, you did the thing this was asking for: you told me what the stanza means and then pointed at the words that got you there. Picking "indifferently" as the tell is a genuinely good catch — that is close reading.',
      },
      {
        personaKey: 'student',
        state: 'graded',
        text: 'The stanza is about the speaker remembering his father and feeling bad about how he treated him. It is sad and it shows that he did not appreciate what his father did for him until later on when he was older.',
        score: 66,
        letterGrade: 'D',
        overallComment:
          'Sam, your reading is right, and it would be much stronger with the poem in it. Nothing here points at a word or a line, so I cannot tell whether you got this from the text or from our discussion. Go back and find the one word that shows he is looking back.',
      },
    ],
  },

  {
    title: 'Exit ticket: the New Deal',
    demonstrates:
      'Explain a concept, with no desired response: a real mismatch beats a tidy connection, and the grader is told not to expect one particular comparison.',
    config: {
      schemaVersion: 1,
      mode: 'specific',
      focus: 'explain-concept',
      topic:
        'how the New Deal compares to the Progressive Era reforms we studied',
      answerType: 'subjective',
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
          'Riley, the connection is good and the mismatch is better. Noticing that the same direction met a completely different reaction is the more interesting observation, and the question you end on is the one historians argue about. Bring it to Monday.',
      },
      {
        personaKey: 'student-unreleased',
        state: 'graded',
        text: 'The New Deal connects to the Progressive Era because they both wanted to help people and make the country better. They are both examples of the government doing more to fix problems in society.',
        score: 42,
        letterGrade: 'F',
        overallComment:
          'Taylor, this is true but it would be true of almost any two reforms — nothing here is specific to the New Deal or to what we actually read about the Progressives. Name one Progressive reform from our unit and say what the New Deal did that went further.',
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
          'Casey, this is a real observation about how you learn, and it is the kind of thing this ticket is good at catching. You noticed something true about yourself. It sits a little away from the content of the lesson, so I cannot tell from this what you took from the reading itself, but I am glad you wrote it.',
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
          'Casey, the apples and oranges line is doing real work here — that is the idea, not a slogan about it. You also named the habit you are breaking, which is the honest part. Nothing to fix.',
      },
      {
        personaKey: 'student',
        state: 'graded',
        text: 'What I learned today was more about how I work than about the maths. I finally asked a question in front of everyone instead of waiting until the end, and nobody laughed, which I had genuinely been worried about. I think I will do that again.',
        score: 52,
        letterGrade: 'F',
        overallComment:
          'Sam, I am glad you wrote this and I hope you do it again — that took something. The ticket asked openly, so this is a fair answer to the question I asked. It just does not tell me whether the fractions landed, so I will check that with you directly on Monday rather than guess.',
      },
      {
        personaKey: 'student-submitted',
        state: 'graded',
        text: 'Today we did adding fractions with different denominators.',
        score: 22,
        letterGrade: 'F',
        overallComment:
          'Riley, that is the topic, not what you learned about it. One more sentence would do it: what has to be true about two fractions before you are allowed to add them?',
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
      answerType: 'objective',
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
          'Riley, you explained the trade rather than naming it, and the last line is a genuinely good question. Hold it for the unit on representation.',
      },
      {
        personaKey: 'student-unreleased',
        state: 'graded',
        text: 'Because of the Great Compromise. Every state gets two senators no matter how big it is.',
        score: 30,
        letterGrade: 'F',
        overallComment:
          'Taylor, both sentences are correct, and neither of them is an explanation — the second one restates the question and the first one names it. Why did the small states insist on it?',
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
      focus: 'explain-concept',
      topic: 'how to work out speed from a distance-time graph',
      answerType: 'objective',
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
          'Sam, the method is right and you talked yourself out of the flat-section mistake, which is the one most people make. You are also right to be unsure about the curve — that is a real limit of the method, not a gap in you. That is next week.',
      },
      {
        personaKey: 'student-unreleased',
        state: 'graded',
        text: 'speed = distance / time',
        score: 15,
        letterGrade: 'F',
        overallComment:
          'Taylor, that is the formula, and the ticket was asking you to use it on the graph. Pick any two points on the first straight section and show me the numbers you would put in.',
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
      focus: 'ask-question',
      topic: 'photosynthesis',
      answerType: 'subjective',
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

  // ---------------------------------------------------------------------
  // The English classroom set.
  //
  // Yawp is an English product, and a preview stocked mostly with chemistry
  // and two-step equations shows a teacher the mechanics without ever showing
  // them their own subject. These are the lessons an English teacher actually
  // closes on: a symbol, a claim, a quotation, a scene, a punctuation mark
  // they have taught four times, a speech, a seminar, a narrator.
  //
  // Every response here is already graded, so the rotation reads as a marked
  // class set rather than an empty queue.
  // ---------------------------------------------------------------------

  {
    title: 'Exit ticket: the green light',
    demonstrates:
      'Understand a text, no desired response, graded for points: a symbol has more than one defensible reading, and the scale still separates them.',
    config: {
      schemaVersion: 1,
      mode: 'specific',
      focus: 'understand-text',
      topic: 'what the green light means to Gatsby at the end of chapter 1',
      answerType: 'subjective',
      lessonNotes: notes({
        mainPoints:
          'The light is a want, not a place. Gatsby reaches for it before we know what it is, so the reaching is the characterisation, not Daisy.',
        mustMention:
          'Something from the text itself — the reaching, the trembling, the single light across the water.',
        watchFor:
          'Saying “it symbolises hope” or “the American Dream” as a label without anything from chapter 1 behind it.',
      }),
    },
    submitForGrade: true,
    pointValue: 15,
    tutorEnabled: false,
    responses: [
      {
        personaKey: 'student-graded',
        state: 'graded',
        text: 'I do not think the light is Daisy, or at least it is not only Daisy. Nick says Gatsby stretched his arms out toward the water and was trembling, and at that point we do not know who lives across the bay and neither do we know what he wants. So what we see first is a man reaching for something far away in the dark, and the object gets attached afterward. That made me think the point is the reaching. If it turned out to be a lighthouse he would still be standing there wanting something.',
        score: 95,
        letterGrade: 'A',
        overallComment:
          'Casey, "the point is the reaching" is exactly the reading this was checking for, and you got there from the text rather than from the back of the book. The trembling and the not-knowing-yet are the right details to have noticed. Push one step further next time: what does it cost Gatsby that the want came before the object?',
      },
      {
        personaKey: 'student',
        state: 'graded',
        text: 'The green light is at the end of Daisy’s dock and it represents Gatsby’s hope and his dream of being with her. It is also a symbol of the American Dream and how people are always chasing something they cannot have.',
        score: 41,
        letterGrade: 'F',
        overallComment:
          'Sam, every sentence here is a label, and none of them came from chapter 1 — the American Dream line would fit a book you had not opened. Go back to the last page of the chapter and find me one thing Gatsby physically does. Start there and the reading will be yours.',
      },
      {
        personaKey: 'student-submitted',
        state: 'graded',
        text: 'He is looking at a light across the water that belongs to Daisy. I think it means he wants her back. The thing I noticed is that he does not go over there, he just looks, even though it is not very far. Maybe he likes wanting it more than he would like having it.',
        score: 79,
        letterGrade: 'C',
        overallComment:
          'Riley, that last sentence is a genuinely sharp idea and it is doing more work than the two before it. You noticed the distance is small — that is a real textual observation. Say which line gave you that and this moves up a band.',
      },
      {
        personaKey: 'student-unreleased',
        state: 'graded',
        text: 'green light = hope',
        score: 12,
        letterGrade: 'F',
        overallComment:
          'Taylor, that is a note to yourself, not an answer to me. You were asked what it means to Gatsby and why you think so. Two sentences would have done it. Find me at lunch and we will do it out loud.',
      },
    ],
  },

  {
    title: 'Exit ticket: claim or summary',
    demonstrates:
      'Explain a concept with a right answer, feedback only: the distinction the whole essay unit rests on, checked in four minutes.',
    config: {
      schemaVersion: 1,
      mode: 'specific',
      focus: 'explain-concept',
      topic:
        'the difference between a claim about a text and a summary of it',
      answerType: 'objective',
      lessonNotes: notes({
        mainPoints:
          'A summary says what happened. A claim says something arguable about what happened — someone could disagree with it and still have read the book.',
        mustMention:
          'That a claim is arguable, or that someone could reasonably disagree with it.',
        watchFor:
          'Saying a claim is “your opinion”, which lets anything unsupported count.',
      }),
    },
    submitForGrade: false,
    pointValue: null,
    tutorEnabled: false,
    responses: [
      {
        personaKey: 'student-graded',
        state: 'graded',
        text: 'A summary is something nobody can argue with. If I say Curley’s wife is lonely and she talks to Lennie in the barn, that just happened, you can check it. A claim has to be something a person who read the same book could disagree with. So "Curley’s wife is the loneliest person on the ranch" is a claim, because someone could say no, Crooks is, and then we would actually have something to argue about. That is the test I am going to use: could somebody say no.',
        score: 93,
        letterGrade: 'A',
        overallComment:
          'Casey, "could somebody say no" is a better test than the one I gave you in class, and you built it yourself out of two examples. That is the whole distinction. Keep it — you will use it every time you draft a thesis this year.',
      },
      {
        personaKey: 'student',
        state: 'graded',
        text: 'A summary is when you retell the story and a claim is your own opinion about it. So a summary would be saying what happens in the chapter and a claim is saying what you think about it.',
        score: 58,
        letterGrade: 'F',
        overallComment:
          'Sam, you have the first half right and the second half is the trap I was watching for. "Your opinion" lets anything count, including things the book cannot support. What has to be true about a claim for it to be worth arguing? Come back to me with one more word.',
      },
      {
        personaKey: 'student-submitted',
        state: 'graded',
        text: 'A claim is arguable and a summary is not. You can disagree with a claim but you cannot disagree with a summary because it is just what the book says. Also a claim needs evidence and a summary is the evidence.',
        score: 87,
        letterGrade: 'B',
        overallComment:
          'Riley, the first two sentences nail it. That third one — "a summary is the evidence" — is almost right and more interesting than you realise: summary is where evidence comes from, but a quoted line is not yet an argument. Worth five minutes together.',
      },
    ],
  },

  {
    title: 'Exit ticket: dropping a quotation in',
    demonstrates:
      'Specific with only two notes filled in, graded at 20: the mechanics lesson, where the mistake is visible in the writing itself.',
    config: {
      schemaVersion: 1,
      mode: 'specific',
      focus: 'explain-concept',
      topic:
        'how to work a quotation into your own sentence instead of dropping it in alone',
      answerType: 'objective',
      lessonNotes: notes({
        mainPoints:
          'A quotation is part of your sentence, not a sentence of its own. Introduce it with your own words, keep the grammar running through it, and follow it with what it proves.',
        watchFor:
          'A quotation standing alone as its own sentence with no lead-in and nothing after it.',
      }),
    },
    submitForGrade: true,
    pointValue: 20,
    tutorEnabled: true,
    responses: [
      {
        personaKey: 'student-graded',
        state: 'graded',
        text: 'The quote has to sit inside a sentence I wrote, not be its own sentence sitting there by itself. So instead of writing: She was lonely. "I never get to talk to nobody." I should write: Curley’s wife admits how cut off she is when she says she "never gets to talk to nobody," which tells us the loneliness is something she knows about herself. The part I had to fix was the grammar — I had to change "get" to "gets" so it ran on from my own words instead of clanging.',
        score: 96,
        letterGrade: 'A',
        overallComment:
          'Casey, you did the thing and then showed me the repair, which is better than either on its own. Noticing you had to change "get" to "gets" is the detail almost nobody catches — that is what integrating actually means. Nothing to fix here.',
      },
      {
        personaKey: 'student-submitted',
        state: 'graded',
        text: 'You are supposed to put your own words before the quote so it does not just sit there. Like you say who is talking and then put the quote. Then after you explain what it means. I think the main thing is you cannot just have a quote as a whole sentence on its own.',
        score: 76,
        letterGrade: 'C',
        overallComment:
          'Riley, you have all three moves in the right order and the rule at the end is correct. What is missing is a worked example — you described the recipe without cooking anything. Do it once with any line from the chapter and you will be at the top of the scale.',
      },
      {
        personaKey: 'student',
        state: 'graded',
        text: 'You have to use quotation marks and put the page number in brackets after it.',
        score: 20,
        letterGrade: 'F',
        overallComment:
          'Sam, both of those are true and neither is what the lesson was about — that is citation, not integration. The question was how the quotation joins your own sentence. Look at the two examples on the handout and tell me what is different about the second one.',
      },
      {
        personaKey: 'student-unreleased',
        state: 'graded',
        text: 'idk',
        score: 0,
        letterGrade: 'F',
        overallComment:
          'Taylor, there is nothing here I can teach to. Even "I do not know where to put my own words" would give me somewhere to start. This one is easy to fix and I would rather fix it with you than mark it again.',
      },
    ],
  },

  {
    title: 'Exit ticket: the knocking at the gate',
    demonstrates:
      'Understand a text, no desired response, feedback only: a scene where the honest “I noticed something and I am not sure why it works” beats a confident label.',
    config: {
      schemaVersion: 1,
      mode: 'specific',
      focus: 'understand-text',
      topic:
        'why Shakespeare puts the knocking at the gate right after the murder in Macbeth',
      answerType: 'subjective',
      lessonNotes: notes({
        mainPoints:
          'The knocking drags the ordinary world back into the scene at the worst possible moment, and it starts before either of them is ready.',
        mustMention:
          'The effect of the timing — that it comes immediately after, not later.',
        watchFor:
          'Retelling the murder scene without getting to the knocking at all.',
      }),
    },
    submitForGrade: false,
    pointValue: null,
    tutorEnabled: false,
    responses: [
      {
        personaKey: 'student-graded',
        state: 'graded',
        text: 'The knocking is somebody normal at the door wanting to be let in, and it lands about four seconds after the worst thing in the play. They are still covered in it. What it does to me reading it is that it makes the murder feel real in a way the murder itself did not, because up until then it was just the two of them in the dark talking in a way nobody talks. The knocking is the outside world arriving and not knowing yet, and you realise they are going to have to open the door and be normal.',
        score: 94,
        letterGrade: 'A',
        overallComment:
          'Casey, "the outside world arriving and not knowing yet" is very close to what De Quincey spent an entire essay saying, and you got there from the scene. The observation that the murder felt less real than the knocking is the one I want you to bring to the essay.',
      },
      {
        personaKey: 'student',
        state: 'graded',
        text: 'It creates suspense and tension for the audience. It is also dramatic irony because we know what they did and the person at the door does not.',
        score: 47,
        letterGrade: 'F',
        overallComment:
          'Sam, the dramatic irony is correctly named, and "suspense and tension" is the phrase we agreed to stop using because it fits every scene ever written. You have the term — now tell me what the knocking does that a silence would not have done.',
      },
      {
        personaKey: 'student-submitted',
        state: 'graded',
        text: 'Honestly I noticed that the knocking made me feel worse than the actual killing did and I have been trying to work out why. I think it is because during the murder everything is whispering and it does not feel like it is really happening, and then a loud normal noise happens and it does. I am not sure that is a proper literary answer but it is what happened when I read it.',
        score: 85,
        letterGrade: 'B',
        overallComment:
          'Riley, that is a proper literary answer — it is a reading of an effect, supported by the contrast you noticed between whispering and a loud noise. Do not apologise for it. The only thing missing is a line from the scene to hang it on.',
      },
    ],
  },

  {
    title: 'Exit ticket: what still trips you up about semicolons',
    demonstrates:
      'Ask a question with only the watch-for note filled in: the mechanics check where an honest account of the confusion is the whole point.',
    config: {
      schemaVersion: 1,
      mode: 'specific',
      focus: 'ask-question',
      topic: 'semicolons',
      answerType: 'subjective',
      lessonNotes: notes({
        watchFor:
          'Thinking a semicolon is a fancier comma, which produces comma splices with a semicolon in them.',
      }),
    },
    submitForGrade: false,
    pointValue: null,
    tutorEnabled: false,
    responses: [
      {
        personaKey: 'student',
        state: 'graded',
        text: 'I can do the test where both sides have to work as their own sentence, and I get that right when you give me two halves and ask. Where I fall apart is in my own writing, because when I am actually writing I do not stop and check, and I think I use one whenever the sentence feels long. So I probably do it wrong in essays even though I can do it on a worksheet. What I want to know is whether there is a reason to use one at all, or if I could just use a full stop every time and never be wrong.',
        score: 90,
        letterGrade: 'A',
        overallComment:
          'Sam, this is the most useful ticket in the pile, because you identified that you can pass the test and still not have the habit — that is a real diagnosis. And your last question is a good one that I will answer properly on Monday: a full stop is never wrong, but it is not always what you mean.',
      },
      {
        personaKey: 'student-unreleased',
        state: 'graded',
        text: 'I think I get it now, it is like a comma but stronger.',
        score: 25,
        letterGrade: 'F',
        overallComment:
          'Taylor, that is the exact belief the lesson was trying to take off you, so "I think I get it now" worries me more than it reassures me. A comma and a semicolon do not join the same things. Two minutes with me tomorrow and this will stick.',
      },
      {
        personaKey: 'student-graded',
        state: 'graded',
        text: 'I do not really have a question about semicolons, I think I understand them. What I am less sure about is the colon. I know one of them introduces something but I could not tell you which without looking it up.',
        score: 71,
        letterGrade: 'C',
        overallComment:
          'Casey, that is an honest answer and it names something real, so it is worth having. It is also not the question I asked, so I still do not know whether the semicolon is solid for you. Write me one sentence with a semicolon in it tomorrow and we will both find out.',
      },
    ],
  },

  {
    title: 'Exit ticket: where the speech gets its power',
    demonstrates:
      'Explain a concept with no desired response, graded at 15: a rhetoric lesson where naming the appeal is the easy half and the evidence is the real check.',
    config: {
      schemaVersion: 1,
      mode: 'specific',
      focus: 'explain-concept',
      topic:
        'which appeal does the most work in the speech we read, and how you can tell',
      answerType: 'subjective',
      lessonNotes: notes({
        mainPoints:
          'Ethos, pathos and logos are usually all present. The interesting question is which one carries the argument and what in the text shows it.',
        mustMention: 'Something specific from the speech, not only the label.',
        watchFor:
          'Listing all three appeals with an example of each and never answering which one does the most.',
      }),
    },
    submitForGrade: true,
    pointValue: 15,
    tutorEnabled: false,
    responses: [
      {
        personaKey: 'student-submitted',
        state: 'graded',
        text: 'I think it is ethos, and not in the way I expected. He spends the opening not arguing at all, just establishing that he has been there and we have not, and by the time he gets to the actual argument we have already decided to trust him. The logos is honestly a bit thin if you pull it out on its own — the numbers are vague. But it works because of who is saying it, which is what makes ethos the one doing the lifting.',
        score: 92,
        letterGrade: 'A',
        overallComment:
          'Riley, you answered the actual question — which one carries it — and then you tested your answer by pulling the logos out to see if it stood up alone. That is analysis, not labelling. Bring the vague-numbers observation to the essay; it is a paragraph on its own.',
      },
      {
        personaKey: 'student',
        state: 'graded',
        text: 'The speech uses ethos when he talks about his experience, pathos when he talks about the children, and logos when he uses the statistics. All three of them together make the speech powerful and persuasive to the audience.',
        score: 44,
        letterGrade: 'F',
        overallComment:
          'Sam, that is the list I was watching for. You have found one example of each, which means you can spot them — but the question was which one does the most work and why, and that is not answered anywhere here. Pick one and make a case.',
      },
      {
        personaKey: 'student-graded',
        state: 'graded',
        text: 'Pathos, because of the part about the children. That bit made the room go quiet when you read it out and I think that is the proof. The statistics did not do anything to anyone.',
        score: 81,
        letterGrade: 'B',
        overallComment:
          'Casey, short and it still answers the question, with a genuinely good piece of evidence — the room going quiet is real data about how the speech works. Quote the line that did it and this is an A.',
      },
    ],
  },

  {
    title: 'Exit ticket: after the seminar',
    demonstrates:
      'Basic with notes, graded at 5: the standard question asked after a discussion, where the grader knows what the discussion was supposed to land.',
    config: {
      schemaVersion: 1,
      mode: 'basic',
      lessonNotes: notes({
        mainPoints:
          'Today’s seminar was on whether George is right at the end of Of Mice and Men. There is no settled answer; the work was in holding a position while taking the other side seriously.',
        mustMention:
          'Something that came up in the discussion, not only what they thought before it.',
        watchFor:
          'Reporting the plot of the ending instead of what the conversation did to their thinking.',
      }),
    },
    submitForGrade: true,
    pointValue: 5,
    tutorEnabled: false,
    responses: [
      {
        personaKey: 'student-graded',
        state: 'graded',
        text: 'I came in certain George was wrong and I left less certain, which I did not expect. What did it was Riley saying that the question is not whether it was right but whether George had a version of the day that ended any better, and nobody in the room could describe one. I still do not think I could do it. But "I could not do it" is not the same as "it was wrong", and I had those two things glued together when I walked in.',
        score: 97,
        letterGrade: 'A',
        overallComment:
          'Casey, separating "I could not do it" from "it was wrong" is a genuinely hard move and you made it in one lesson, out loud, in front of people. That is what the seminar was for. Write this up as the opening of your essay — it is already an argument.',
      },
      {
        personaKey: 'student',
        state: 'graded',
        text: 'Today we talked about the end of Of Mice and Men and whether George was right to do what he did. Some people thought he was right and some people thought he was wrong. It was a good discussion and lots of people shared their ideas.',
        score: 29,
        letterGrade: 'F',
        overallComment:
          'Sam, this is the minutes of the meeting rather than what you took from it. I know there was a discussion; I was there. What I do not know is whether anything anybody said moved you. One sentence about that is worth the whole paragraph above.',
      },
      {
        personaKey: 'student-unreleased',
        state: 'graded',
        text: 'I learned that Lennie dies at the end and George is the one who does it because he does not want Curley to get him first.',
        score: 35,
        letterGrade: 'F',
        overallComment:
          'Taylor, that is the plot, and we read it last week — it is not what you learned today. The seminar was about whether he was right. Where did you land, and did anyone shift you?',
      },
    ],
  },

  {
    title: 'Exit ticket: can we trust the narrator',
    demonstrates:
      'Specific with no notes at all, feedback only: a named target and nothing for the grader to read against, on a question where the answer really is settled.',
    config: {
      schemaVersion: 1,
      mode: 'specific',
      focus: 'understand-text',
      topic:
        'one place where the narrator tells us something the story itself contradicts',
      answerType: 'objective',
    },
    submitForGrade: false,
    pointValue: null,
    tutorEnabled: false,
    responses: [
      {
        personaKey: 'student-graded',
        state: 'graded',
        text: 'He tells us he is "one of the few honest people" he has ever known, and then about ten pages earlier he has already described sitting quietly through a conversation he knew was a lie and saying nothing. He does not seem to notice the two things are next to each other. That is the place for me, because it is not the story catching him out later, it is him catching himself out in the same book and not hearing it.',
        score: 91,
        letterGrade: 'A',
        overallComment:
          'Casey, you found the exact line and then said what makes it damning — that he is the one supplying both halves. "Not hearing it" is the right description of how this narrator works. Excellent.',
      },
      {
        personaKey: 'student-submitted',
        state: 'graded',
        text: 'He says he does not judge people at the start but he judges basically everyone in the whole book. He is pretty harsh about Tom straight away.',
        score: 73,
        letterGrade: 'C',
        overallComment:
          'Riley, that is a real contradiction and you are right about it. It would be much stronger with the words — "reserving judgements" is the phrase, and quoting it would let you show how fast he breaks it. Find the line and you have the top band.',
      },
      {
        personaKey: 'student',
        state: 'graded',
        text: 'The narrator is unreliable because he is biased and he only tells us his side of the story so we cannot fully trust what he says.',
        score: 33,
        letterGrade: 'F',
        overallComment:
          'Sam, that is a definition of unreliable narration rather than an answer about this book — it would be true of any first-person novel. The ticket asked for one place. Open to the first two pages and find something he says about himself.',
      },
    ],
  },
];
