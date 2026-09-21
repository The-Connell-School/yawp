// The teacher-facing explanation of exit tickets: what the type is for, the
// two shapes it comes in, what telling us about the lesson buys, how a
// response is scored, and what separates a ticket worth reading from one that
// is not.
//
// Split out of the component for the same reason the Daily Pages copy is: the
// claims here about scoring have to be checkable against the bands the grader
// is actually given, and copy that describes the assistant and then drifts
// from what the assistant does is worse than no copy at all. See the parity
// test in `content.test.ts`.

export const ABOUT_HEADING = 'About exit tickets';

export const ABOUT_LEDE =
  'An exit ticket is the last five minutes of a lesson. It is not a quiz and not a journal — it is how you find out whether today actually landed, while there is still time to do something about it. Students write: there is nothing to pick from and no answer key, because the point is what they say in their own words.';

export const TWO_WAYS_HEADING = 'Two ways to write one';

export const TWO_WAYS_INTRO =
  'You never write the prompt yourself. Hit New → Assignment, answer the form, and the prompt students see is composed for you.';

export const TWO_WAYS: { mode: string; detail: string }[] = [
  {
    mode: 'Basic',
    detail:
      'One click. Every student gets the same standard question: what did you learn today, in your own words. Good when you want to hear what stuck without steering them toward it.',
  },
  {
    mode: 'Specific',
    detail:
      'You name what you are checking for, and the topic it applies to. Good when the lesson had one idea you need evidence of.',
  },
];

/** Precedes the focus list, which the page reads off the form's own options. */
export const FOCUS_INTRO =
  'A specific ticket asks you to choose what kind of understanding you want to see:';

export const DESIRED_RESPONSE_LEAD =
  'It also asks whether there is a desired response, and you have to answer.';

export const DESIRED_RESPONSE_DETAIL =
  'Some things you check for have a right answer and some do not, and nothing about a topic tells us which. Say there is one and a response that contradicts it is marked wrong, plainly. Say there is not and the response is judged on its reasoning and what it is anchored to, never on whether it landed where you would have — so a student is not told they are wrong for a defensible answer you did not expect. There is no default on the form because the wrong guess is not a neutral one.';

export const TELL_US_HEADING = 'The more you tell us, the more targeted it gets';

export const TELL_US_INTRO =
  'When you make an exit ticket you can add notes about the lesson: the main points, what a response absolutely should mention, and the mix-up you expect. Students never see any of it. It is there so the responses can be read against what you actually taught.';

export const TELL_US_BLANK_IS_A_CHOICE =
  'Leaving it blank is a real choice, not a mistake. A vague exit ticket is open-ended, and open-ended tickets catch the thing you did not think to ask about — which is sometimes exactly what you need. But nothing can be measured against a target that was never named. Tell us what mattered and you will get back a much sharper read on who has it and who does not.';

export const TELL_US_BASIC_NO_NOTES_LEAD =
  'A basic ticket with no notes is the hardest one to read well.';

export const TELL_US_BASIC_NO_NOTES_DETAIL =
  'Nothing names the lesson, so responses can only be judged on whether the student explained something with substance — not on whether they got the thing you were actually teaching. That is a genuine tool: it is the most honest way to find out what students think the lesson was about, and it is worth using deliberately for exactly that. Just reach for it on purpose rather than by default. If you want to know whether a particular idea landed, add the notes or make the ticket specific.';

export const SCORING_HEADING = 'How they are scored';

export const SCORING_INTRO =
  'Every response is scored, on the one question of how much of the idea the student can explain. What you choose when you make the ticket is whether that score counts.';

export const SCORING_MODES: { label: string; detail: string }[] = [
  {
    label: 'Feedback and understanding only',
    detail:
      'Keeps it out of the gradebook — you still see the score and who understood it, and a student loses nothing by admitting what they missed.',
  },
  {
    label: 'For points',
    detail: 'Records the same score as a grade.',
  },
];

export const SCORING_SCALE_NOTE =
  'That is the whole scale, and it is the same text the grader is given. Two lines in it are deliberate rather than accidental: “idk” earns a zero instead of a low score, and a bare correct answer handed in without the reasoning the ticket asked for stays under half credit, because the answer was never the thing being checked.';

export const GOOD_TICKET_HEADING = 'What makes a good exit ticket';

export const WHAT_MAKES_A_GOOD_ONE: { title: string; detail: string }[] = [
  {
    title: 'Ask for one thing',
    detail:
      'An exit ticket that asks three questions gets three shallow answers. Pick the single idea the lesson turned on.',
  },
  {
    title: 'Ask them to explain, not to recall',
    detail:
      '“Define photosynthesis” tells you who remembered a sentence. “Explain how the plant gets what it needs” tells you who understood.',
  },
  {
    title: 'Make honesty worth it',
    detail:
      'A student who writes “I thought I had this, but I cannot explain the second step” has given you the most useful ticket in the pile. Say out loud that this is what you want.',
  },
  {
    title: 'Read them before you plan tomorrow',
    detail:
      'The whole value is the timing. An exit ticket read on Friday is a record; read tonight, it changes Tuesday.',
  },
];

export const TUTOR_HEADING = 'Why the tutor starts off';

export const TUTOR_NOTE =
  'The tutor is switched off by default here. An exit ticket is asking what a student understands on their own, and a tutor in the document would answer the question for them. Turn it on if you want it.';
