import { useId, useState, type ReactNode } from 'react';
import { FileCheck, Shield } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';

const ADMIN_FAQ = [
  {
    id: 'what',
    question: 'What Yawp! is',
    answer:
      'Yawp! is a writing platform for middle school, high school and college classrooms. Students learn a writing process, draft essays and get feedback from the Yawp! tutor. Teachers set assignments and follow each student’s progress.',
  },
  {
    id: 'free',
    question: 'It’s free',
    answer:
      'The Free plan costs nothing for the teacher or the school, and nobody is asked for payment details. Paid plans exist for schools that want more, and moving to one is always a separate decision you make.',
  },
  {
    id: 'why-built',
    question: 'Why we built it',
    answer:
      'The name comes from Whitman: “I sound my barbaric yawp over the roofs of the world.” We built Yawp! so every student can find their own voice in writing and learn how to make it heard, with feedback between drafts instead of only at the end.',
  },
  {
    id: 'doesnt',
    question: 'What it doesn’t do',
    answer:
      'The Yawp! tutor guides, it never writes. It won’t write essays, paragraphs or sentences for students, and it doesn’t grade work in place of the teacher. There are no ads in Yawp!.',
  },
  {
    id: 'why-ask',
    question: 'Why we ask for your approval',
    answer:
      'Yawp! stores student writing, so using it means adopting a tool that handles student records. That decision belongs with you: no student data enters Yawp! until you approve.',
  },
  {
    id: 'privacy',
    question: 'Student privacy',
    answer:
      'Student writing belongs to the student and the school. Yawp! uses it to give feedback in the classroom and for nothing else: not for advertising and not to train AI models. Under the NDPA you can ask us to delete your students’ data at any time.',
  },
] as const;

function AdminPrivacyTrustBadges({
  onOpenPrivacy,
  compact,
}: {
  onOpenPrivacy: () => void;
  compact?: boolean;
}) {
  const trustButton = (
    icon: ReactNode,
    title: string,
    line: string,
    key: string
  ) => (
    <button
      key={key}
      type="button"
      className="free-tier-trust-badge"
      onClick={onOpenPrivacy}
      aria-label={`${title}. ${line} Opens Student privacy.`}
    >
      <span className="free-tier-trust-badge-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="free-tier-trust-badge-text">
        <b>{title}</b>
        {compact ? null : <span>{line}</span>}
      </span>
    </button>
  );

  return (
    <div
      className={`free-tier-trust-row${compact ? ' free-tier-trust-row-compact' : ''}`}
    >
      {trustButton(
        <Shield className="h-4 w-4" />,
        'FERPA compliant',
        'Student records stay under your school’s control.',
        'ferpa'
      )}
      {trustButton(
        <FileCheck className="h-4 w-4" />,
        'NDPA signed',
        'National Data Privacy Agreement, through the Student Data Privacy Consortium.',
        'ndpa'
      )}
    </div>
  );
}

export function AdminApprovalQa({ teacherName: _teacherName }: { teacherName: string }) {
  const headingId = useId();
  const [open, setOpen] = useState<string>('what');

  const openPrivacy = () => setOpen('privacy');

  return (
    <section
      className="free-tier-approval-faq"
      aria-labelledby={headingId}
      data-testid="admin-approval-qa"
    >
      <h2 id={headingId} className="free-tier-approval-faq-heading">
        Questions administrators ask
      </h2>
      <AdminPrivacyTrustBadges onOpenPrivacy={openPrivacy} />
      <Accordion
        type="single"
        collapsible
        value={open}
        onValueChange={(value) => setOpen(value ?? '')}
        className="free-tier-approval-faq-accordion"
      >
        {ADMIN_FAQ.map((item) => (
          <AccordionItem key={item.id} value={item.id}>
            <AccordionTrigger className="free-tier-approval-faq-trigger">
              {item.question}
            </AccordionTrigger>
            <AccordionContent>
              <p className="free-tier-approval-faq-answer">{item.answer}</p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
