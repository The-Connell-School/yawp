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
  approvePageIntro,
  approvePageTitle,
  declinedBody,
  forwardPageIntro,
  forwardPageTitle,
  forwardSentBody,
  type AdminLinkReplacedVariant,
  FREE_TIER_ADMIN_MODEL_TRAINING_LINE,
  linkExpiredBody,
  linkInvalidBodyForRequest,
  linkReplacedBody,
  thankYouBody,
} from '~/domain/free-tier/admin-approval-copy';
import { useFreeTierEnabled } from './useFreeTierLayoutContext';
import {
  adminDenyAlreadyAnsweredBody,
  adminDenyAlreadyAnsweredTitle,
  adminDenyReopenHint,
  adminDenyThanksBody,
  adminDenyThanksTitle,
} from '~/domain/free-tier/admin-deny-copy';
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

export function AdminDenyThanksCard({
  teacherName,
  schoolName,
}: {
  teacherName: string;
  schoolName: string;
}) {
  return (
    <FreeTierAuthCard title={adminDenyThanksTitle()} status>
      <p className="text-sm text-muted-foreground">
        {adminDenyThanksBody(teacherName, schoolName)}
      </p>
      <p className="text-sm text-muted-foreground">{adminDenyReopenHint}</p>
    </FreeTierAuthCard>
  );
}

export function AdminDenyAlreadyAnsweredCard({
  teacherName,
  schoolName,
  decidedAt,
}: {
  teacherName: string;
  schoolName: string;
  decidedAt: Date;
}) {
  return (
    <FreeTierAuthCard title={adminDenyAlreadyAnsweredTitle()} status>
      <p className="text-sm text-muted-foreground">
        {adminDenyAlreadyAnsweredBody(teacherName, schoolName, decidedAt)}
      </p>
      <p className="text-sm text-muted-foreground">{adminDenyReopenHint}</p>
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

export function AdminLinkInvalidCard({
  teacherName,
  schoolName,
}: {
  teacherName?: string;
  schoolName?: string;
} = {}) {
  const pass1 = useFreeTierEnabled();
  return (
    <FreeTierAuthCard title="We couldn't open this link" icon={<CircleAlert />} status>
      <p className="text-sm text-muted-foreground">
        {linkInvalidBodyForRequest({
          teacherName,
          schoolName,
          pass1,
        })}
      </p>
    </FreeTierAuthCard>
  );
}

export function AdminLinkReplacedCard({
  teacherName,
  schoolName,
  variant = 'forwarded',
}: {
  teacherName: string;
  schoolName: string;
  variant?: AdminLinkReplacedVariant;
}) {
  const pass1 = useFreeTierEnabled();
  return (
    <FreeTierAuthCard title="This link was replaced" icon={<Info />} status>
      <p className="text-sm text-muted-foreground">
        {linkReplacedBody(teacherName, schoolName, variant, pass1)}
      </p>
    </FreeTierAuthCard>
  );
}

export function AdminForwardSentCard({
  teacherName,
  schoolName,
  recipientName,
  recipientEmail,
  manualReview = false,
}: {
  teacherName: string;
  schoolName: string;
  recipientName: string;
  recipientEmail: string;
  manualReview?: boolean;
}) {
  const pass1 = useFreeTierEnabled();
  return (
    <FreeTierAuthCard title="Request forwarded" icon={<Send />} status>
      <p className="text-sm text-muted-foreground">
        {forwardSentBody({
          teacherName,
          schoolName,
          recipientName,
          recipientEmail,
          manualReview,
          pass1,
        })}
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
  const pass1 = useFreeTierEnabled();
  return (
    <>
      {pass1 ? (
        <p className="text-sm text-muted-foreground">
          {approvePageIntro(teacherName, schoolName)}
        </p>
      ) : null}
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

export function adminForwardPageIntro(
  teacherName: string,
  schoolName: string,
  pass1: boolean
) {
  return forwardPageIntro(teacherName, schoolName, pass1);
}

export function adminForwardPageTitle(teacherName: string, pass1: boolean) {
  return forwardPageTitle(teacherName, pass1);
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
