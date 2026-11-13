import { useId, useState, type ReactNode } from 'react';
import { FileCheck, Shield } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import {
  ADMIN_APPROVE_FERPA_TRUST,
  ADMIN_APPROVE_NDPA_TRUST,
  ADMIN_APPROVE_STUDENT_PRIVACY_FAQ,
} from '~/domain/free-tier/admin-privacy-agreements-copy';

export const ADMIN_APPROVE_FAQ = [
  {
    id: 'what',
    question: 'What Yawp! is',
    answer:
      'Yawp! is a writing program that makes teaching writing far more efficient. It gives teachers a full curriculum, ready-to-teach lessons, and grading tools that save hours of feedback time, so students can write more often and improve faster. As they write, an AI tutor gives them immediate feedback that pushes them to think critically and develop their own ideas. It never writes for them, and teachers can see every draft and every tutor conversation. It’s the writing program teachers, students, and parents have been waiting for.',
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
      'The tutor’s non-negotiable rule: it will not write for students. Instead, it asks questions and guides so that students can develop original ideas and improve their writing skills. Yawp! contains no advertisements and does not use student writing or data to train outside models.',
  },
  {
    id: 'why-ask',
    question: 'Why we ask you',
    answer:
      'When administrators know what’s happening in their buildings, they’re better equipped to tell the story of their students’ success. Your approval provides oversight and clear communication, and it lets you see and support good work as it happens. A free Yawp! classroom is an easy win: you’ll be backing a teacher who is taking initiative, and you’ll be able to see evidence of their students’ growth.',
  },
  {
    id: 'privacy',
    question: 'Student privacy',
    answer: ADMIN_APPROVE_STUDENT_PRIVACY_FAQ,
  },
] as const;

function AdminPrivacyTrustStamps({ onOpenPrivacy }: { onOpenPrivacy: () => void }) {
  const items: {
    id: string;
    icon: ReactNode;
    title: string;
    line: string;
  }[] = [
    {
      id: 'ferpa',
      icon: <Shield className="h-3.5 w-3.5" strokeWidth={1.75} />,
      ...ADMIN_APPROVE_FERPA_TRUST,
    },
    {
      id: 'ndpa',
      icon: <FileCheck className="h-3.5 w-3.5" strokeWidth={1.75} />,
      ...ADMIN_APPROVE_NDPA_TRUST,
    },
  ];

  return (
    <ul className="free-tier-approval-trust-stamps" aria-label="Privacy agreements">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className="free-tier-approval-trust-stamp"
            onClick={onOpenPrivacy}
            aria-label={`${item.title}. ${item.line} Opens Student privacy.`}
          >
            <span className="free-tier-approval-trust-stamp-seal" aria-hidden="true">
              {item.icon}
            </span>
            <span className="free-tier-approval-trust-stamp-copy">
              <span className="free-tier-approval-trust-stamp-title">
                {item.title}
              </span>
              <span className="free-tier-approval-trust-stamp-line">
                {item.line}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
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
      <AdminPrivacyTrustStamps onOpenPrivacy={openPrivacy} />
      <Accordion
        type="single"
        collapsible
        value={open}
        onValueChange={(value) => setOpen(value ?? '')}
        className="free-tier-approval-faq-accordion"
      >
        {ADMIN_APPROVE_FAQ.map((item) => (
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
