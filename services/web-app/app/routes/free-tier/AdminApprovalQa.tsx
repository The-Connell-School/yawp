import React, { useId, useReducer, useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

type QaRow = {
  id: string;
  question: string;
  answer: React.ReactNode;
};

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return reduced;
}

function QaAccordionRow({
  row,
  open,
  onToggle,
  reducedMotion,
}: {
  row: QaRow;
  open: boolean;
  onToggle: () => void;
  reducedMotion: boolean;
}) {
  const panelId = useId();
  const buttonId = useId();
  const durationMs = open ? 200 : 160;

  return (
    <div className="free-tier-qa-row">
      <button
        type="button"
        id={buttonId}
        className="free-tier-qa-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span>{row.question}</span>
        <span
          aria-hidden
          className={`free-tier-qa-chevron-wrap${
            open ? ' free-tier-qa-chevron-wrap-open' : ''
          }${reducedMotion ? ' free-tier-qa-chevron-wrap-reduced' : ''}`}
          style={
            reducedMotion
              ? undefined
              : { transitionDuration: `${durationMs}ms` }
          }
        >
          <ChevronDown className="free-tier-qa-chevron" />
        </span>
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        inert={!open && !reducedMotion ? true : undefined}
        className={`free-tier-qa-panel${
          open ? ' free-tier-qa-panel-open' : ''
        }${reducedMotion ? ' free-tier-qa-panel-reduced' : ''}`}
        style={
          reducedMotion
            ? { display: open ? 'block' : 'none' }
            : { transitionDuration: `${durationMs}ms` }
        }
      >
        <div className="free-tier-qa-panel-inner">{row.answer}</div>
      </div>
    </div>
  );
}

function AboutYawpAnswer({ teacherName }: { teacherName: string }) {
  return (
    <div className="free-tier-qa-answer">
      <p>
        Yawp! gives teachers the tools to become expert writing instructors and
        build a culture of writing in their classrooms.
      </p>
      <ul>
        <li>
          Students practice writing alongside a restrained writing tutor that
          gives thoughtful, immediate feedback and never does the writing for
          them.
        </li>
        <li>
          Teachers grade quickly on the platform with a rubric-aligned grading
          assistant.
        </li>
        <li>
          Class summaries show each class&apos;s strengths and areas for growth.
        </li>
        <li>Real-time reports track student writing over the year.</li>
        <li>A lesson planner helps teachers close the gaps they find.</li>
      </ul>
    </div>
  );
}

function ItsFreeAnswer({ teacherName }: { teacherName: string }) {
  return (
    <p className="free-tier-qa-answer">
      {teacherName} has a free Yawp! license for one class of up to 35 students.
      There&apos;s no cost to the teacher or the school, no credit card, and
      nothing to purchase.
    </p>
  );
}

function WhyBuiltAnswer() {
  return (
    <div className="free-tier-qa-answer">
      <p>Yawp! was built by classroom teachers in response to problems we lived with:</p>
      <ul>
        <li>Students letting software do their writing for them</li>
        <li>
          The hours it takes to give thoughtful feedback, often on nights and
          weekends
        </li>
        <li>Students losing time waiting for that feedback</li>
        <li>
          Schools having little data on student writing beyond a test given once
          or twice a year
        </li>
        <li>
          Teachers (especially new teachers) lacking a strong writing curriculum
        </li>
      </ul>
      <p>
        Yawp! keeps the thinking with the student, the feedback timely, and the
        teacher in charge.
      </p>
    </div>
  );
}

function DoesntDoAnswer() {
  return (
    <ul className="free-tier-qa-answer">
      <li>It never writes for students.</li>
      <li>It doesn&apos;t collect student email addresses.</li>
      <li>It never uses student writing to train outside models.</li>
      <li>It doesn&apos;t cost the teacher or school anything on the free tier.</li>
    </ul>
  );
}

function WhyAskAnswer() {
  return (
    <p className="free-tier-qa-answer">
      Your approval gives you oversight and lets you see and support good work as
      it happens.
    </p>
  );
}

function PrivacyAnswers() {
  return (
    <ul className="free-tier-qa-answer free-tier-qa-privacy-list">
      <li>
        <strong>Is Yawp! FERPA compliant?</strong> Yes. Yawp! has completed the
        National Student Data Privacy Agreement (NDPA).
      </li>
      <li>
        <strong>What student information do you collect?</strong> Students join
        with a class code and their first and last name. We don&apos;t collect
        student email addresses.
      </li>
      <li>
        <strong>Is student writing used to train outside models?</strong> No.
      </li>
      <li>
        <strong>Who can see student work?</strong> Only the student and their
        teacher. (We encourage teachers to share student work and reports with
        administrators on request.)
      </li>
      <li>
        <strong>Can student data be deleted?</strong> Yes, on request.
      </li>
      <li>
        <strong>Who is it for?</strong> The free tier is for high school classes
        only.
      </li>
    </ul>
  );
}

export function AdminApprovalQa({ teacherName }: { teacherName: string }) {
  const reducedMotion = usePrefersReducedMotion();
  const [open, dispatch] = useReducer(
    (state: Record<string, boolean>, id: string) => ({
      ...state,
      [id]: !state[id],
    }),
    {}
  );

  const aboutRows: QaRow[] = [
    {
      id: 'what-is',
      question: 'What Yawp! is',
      answer: <AboutYawpAnswer teacherName={teacherName} />,
    },
    {
      id: 'its-free',
      question: "It's free",
      answer: <ItsFreeAnswer teacherName={teacherName} />,
    },
    {
      id: 'why-built',
      question: 'Why we built it',
      answer: <WhyBuiltAnswer />,
    },
    {
      id: 'doesnt-do',
      question: "What Yawp! doesn't do",
      answer: <DoesntDoAnswer />,
    },
    {
      id: 'why-ask',
      question: 'Why we ask you',
      answer: <WhyAskAnswer />,
    },
  ];

  const privacyRow: QaRow = {
    id: 'privacy',
    question: 'Questions about student privacy?',
    answer: <PrivacyAnswers />,
  };

  return (
    <div className="free-tier-approval-qa" data-testid="admin-approval-qa">
      <p className="free-tier-qa-group-label">About Yawp!</p>
      {aboutRows.map((row) => (
        <QaAccordionRow
          key={row.id}
          row={row}
          open={Boolean(open[row.id])}
          onToggle={() => dispatch(row.id)}
          reducedMotion={reducedMotion}
        />
      ))}
      <p className="free-tier-qa-group-label">Student privacy</p>
      <QaAccordionRow
        row={privacyRow}
        open={Boolean(open[privacyRow.id])}
        onToggle={() => dispatch(privacyRow.id)}
        reducedMotion={reducedMotion}
      />
    </div>
  );
}
