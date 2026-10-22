import {
  CircleAlert,
  CircleCheck,
  Info,
  PencilLine,
  Send,
  Shield,
  UserRound,
} from 'lucide-react';
import { Link } from 'react-router';
import {
  alreadyApprovedBody,
  approveCheckboxError,
  approveCheckboxLabel,
  approvePageTitle,
  declinedBody,
  forwardPageIntro,
  forwardPageTitle,
  teacherAtSchool,
  FREE_TIER_ADMIN_MODEL_TRAINING_LINE,
  linkExpiredBody,
  linkInvalidBody,
  linkReplacedBody,
  thankYouBody,
} from '~/domain/free-tier/admin-approval-copy';
import {
  FreeTierAuthCard,
  FreeTierPerson,
} from './FreeTierAuthCard';

export function AdminApprovalFeatureList() {
  return (
    <ul className="flex flex-col gap-2.5 text-sm text-card-foreground">
      <li className="flex items-start gap-2.5">
        <PencilLine
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
        />
        Students draft essays with feedback as they write.
      </li>
      <li className="flex items-start gap-2.5">
        <UserRound
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
        />
        Teachers control assignments and grading.
      </li>
      <li className="flex items-start gap-2.5">
        <Shield
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
        />
        {FREE_TIER_ADMIN_MODEL_TRAINING_LINE}
      </li>
    </ul>
  );
}

export function AdminThankYouCard({
  teacherName,
  schoolName,
}: {
  teacherName: string;
  schoolName: string;
}) {
  return (
    <FreeTierAuthCard title="Thank you" icon={<CircleCheck />} status>
      <p className="text-sm text-muted-foreground">
        {thankYouBody(teacherName, schoolName)}
      </p>
    </FreeTierAuthCard>
  );
}

export function AdminAlreadyApprovedCard({
  teacherName,
  schoolName,
}: {
  teacherName: string;
  schoolName: string;
}) {
  return (
    <FreeTierAuthCard title="Already approved" icon={<CircleCheck />} status>
      <p className="text-sm text-muted-foreground">
        {alreadyApprovedBody(teacherName, schoolName)}
      </p>
    </FreeTierAuthCard>
  );
}

export function AdminDeclinedCard({
  teacherName,
  schoolName,
}: {
  teacherName: string;
  schoolName: string;
}) {
  return (
    <FreeTierAuthCard title="This request is closed" icon={<CircleAlert />} status>
      <p className="text-sm text-muted-foreground">
        {declinedBody(teacherName, schoolName)}
      </p>
    </FreeTierAuthCard>
  );
}

export function AdminLinkExpiredCard({
  teacherName,
  schoolName,
}: {
  teacherName: string;
  schoolName: string;
}) {
  return (
    <FreeTierAuthCard title="This link has expired" icon={<CircleAlert />} status>
      <p className="text-sm text-muted-foreground">
        {linkExpiredBody(teacherName, schoolName)}
      </p>
    </FreeTierAuthCard>
  );
}

export function AdminLinkInvalidCard() {
  return (
    <FreeTierAuthCard title="We couldn't open this link" icon={<CircleAlert />} status>
      <p className="text-sm text-muted-foreground">{linkInvalidBody}</p>
    </FreeTierAuthCard>
  );
}

export function AdminLinkReplacedCard({
  teacherName,
  schoolName,
}: {
  teacherName: string;
  schoolName: string;
}) {
  return (
    <FreeTierAuthCard title="This link was replaced" icon={<Info />} status>
      <p className="text-sm text-muted-foreground">
        {linkReplacedBody(teacherName, schoolName)}
      </p>
    </FreeTierAuthCard>
  );
}

export function AdminForwardSentCard({
  teacherName,
  schoolName,
  recipientName,
  recipientEmail,
}: {
  teacherName: string;
  schoolName: string;
  recipientName: string;
  recipientEmail: string;
}) {
  return (
    <FreeTierAuthCard title="Request forwarded" icon={<Send />} status>
      <p className="text-sm text-muted-foreground">
        We sent the request for {teacherAtSchool(teacherName, schoolName)} to{' '}
        <strong className="font-semibold text-card-foreground">
          {recipientName}
        </strong>{' '}
        ({recipientEmail}). You&apos;re all set.
      </p>
    </FreeTierAuthCard>
  );
}

export function AdminApprovePageIntro({
  teacherName,
  schoolName,
  teacherEmail,
}: {
  teacherName: string;
  schoolName: string;
  teacherEmail?: string;
}) {
  return (
    <>
      <FreeTierPerson
        name={teacherName}
        email={teacherEmail}
        subtitle={`Teacher at ${schoolName}`}
      />
      <AdminApprovalFeatureList />
    </>
  );
}

export function adminApprovePageTitle(teacherName: string, schoolName: string) {
  return approvePageTitle(teacherName, schoolName);
}

export function adminForwardPageIntro(teacherName: string, schoolName: string) {
  return forwardPageIntro(teacherName, schoolName);
}

export function adminForwardPageTitle() {
  return forwardPageTitle();
}

export function AdminForwardBackLink({
  approveToken,
  className,
}: {
  approveToken?: string;
  className?: string;
}) {
  if (!approveToken) return null;
  return (
    <p className={`text-center text-sm ${className ?? ''}`}>
      <Link
        to={`/free/admin/approve?t=${encodeURIComponent(approveToken)}`}
        className="font-medium text-primary underline underline-offset-4"
      >
        Back to approval
      </Link>
    </p>
  );
}

export function AdminForwardLink({
  token,
  className,
}: {
  token: string;
  className?: string;
}) {
  return (
    <p className={`text-center text-sm text-muted-foreground ${className ?? ''}`}>
      Not the right person?{' '}
      <Link
        to={`/free/admin/not-right-person?t=${encodeURIComponent(token)}&approveT=${encodeURIComponent(token)}`}
        className="font-medium text-primary underline underline-offset-4"
      >
        Forward this request
      </Link>
    </p>
  );
}

export {
  approveCheckboxError,
  approveCheckboxLabel,
};
