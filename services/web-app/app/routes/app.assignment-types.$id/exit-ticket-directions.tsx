import { EXIT_TICKET_FOCUS_OPTIONS } from '~/domain/assignment-types/exit-ticket';

/**
 * What a teacher reads on the Exit Ticket page before they make one.
 *
 * Deliberately longer than the Daily Pages directions. Daily Pages explains a
 * mechanic; this has to make a pedagogical case, because an exit ticket only
 * works if the teacher understands what it is for — a five-minute check that
 * changes tomorrow, not a quiz and not a journal. The section on telling us
 * about the lesson is the one that most changes what teachers get back.
 */

const WHAT_MAKES_A_GOOD_ONE = [
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

export function ExitTicketDirections() {
  return (
    <section className="mb-6 space-y-5 rounded-lg border bg-muted/40 p-4">
      <div>
        <h3 className="mb-2 text-base font-semibold">
          What an exit ticket is for
        </h3>
        <p className="text-sm text-muted-foreground">
          An exit ticket is the last five minutes of a lesson. It is not a quiz
          and not a journal — it is how you find out whether today actually
          landed, while there is still time to do something about it. Students
          write; nothing is multiple choice, and nothing is auto-scored, because
          the point is to read what they say in their own words.
        </p>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold">Two ways to write one</h4>
        <p className="mb-2 text-sm text-muted-foreground">
          You never write the prompt yourself. Hit New → Assignment, answer the
          form, and the prompt students see is composed for you.
        </p>
        <ul className="space-y-2 text-sm text-foreground/80">
          <li>
            <span className="font-medium">Basic</span> — one click. Every
            student gets the same standard question: what did you learn today,
            in your own words. Good when you want to hear what stuck without
            steering them toward it.
          </li>
          <li>
            <span className="font-medium">Specific</span> — you name what you
            are checking for, and the topic it applies to. Good when the lesson
            had one idea you need evidence of.
          </li>
        </ul>
        <p className="mt-2 text-sm text-muted-foreground">
          A specific ticket asks you to choose what kind of understanding you
          want to see:{' '}
          {EXIT_TICKET_FOCUS_OPTIONS.map((option) => option.label.toLowerCase())
            .join(', ')
            .replace(/, ([^,]*)$/, ', or $1')}
          .
        </p>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold">
          The more you tell us, the more targeted it gets
        </h4>
        <p className="text-sm text-muted-foreground">
          When you make an exit ticket you can add notes about the lesson: the
          main points, what a response absolutely should mention, and the mix-up
          you expect. Students never see any of it. It is there so the responses
          can be read against what you actually taught.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Leaving it blank is a real choice, not a mistake. A vague exit ticket
          is open-ended, and open-ended tickets catch the thing you did not
          think to ask about — which is sometimes exactly what you need. But
          nothing can be measured against a target that was never named. Tell us
          what mattered and you will get back a much sharper read on who has it
          and who does not.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground/80">
            A basic ticket with no notes is the hardest one to read well.
          </span>{' '}
          Nothing names the lesson, so responses can only be judged on whether
          the student explained something with substance — not on whether they
          got the thing you were actually teaching. That is a genuine tool: it
          is the most honest way to find out what students think the lesson was
          about, and it is worth using deliberately for exactly that. Just reach
          for it on purpose rather than by default. If you want to know whether
          a particular idea landed, add the notes or make the ticket specific.
        </p>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold">
          What makes a good exit ticket
        </h4>
        <ul className="space-y-2 text-sm text-foreground/80">
          {WHAT_MAKES_A_GOOD_ONE.map((item) => (
            <li key={item.title}>
              <span className="font-medium">{item.title}</span> — {item.detail}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-sm text-muted-foreground">
        The tutor is switched off by default here. An exit ticket is asking what
        a student understands on their own, and a tutor in the document would
        answer the question for them. Turn it on if you want it.
      </p>
    </section>
  );
}
