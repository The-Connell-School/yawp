import { useState, type ReactNode } from 'react';
import { CircleCheck, Mail } from 'lucide-react';
import {
  FreeTierAuthCard,
  FreeTierFieldLabel,
  FreeTierTextInput,
} from '../free-tier/FreeTierAuthCard';

export function FreeTierWelcomeCard({
  children,
  onboardingV2 = false,
  eventLink = false,
}: {
  children: ReactNode;
  onboardingV2?: boolean;
  eventLink?: boolean;
}) {
  return (
    <FreeTierAuthCard
      title={onboardingV2 ? 'Welcome to Yawp!' : 'Try Yawp! with your students'}
      subtitle={onboardingV2
        ? "We're so glad you're here and we can't wait for you to Yawp! with your students"
        : eventLink
          ? 'Sign up below to start your free Yawp! classroom.'
          : 'Join the waitlist. We let teachers in a group at a time.'}
    >
      {children}
    </FreeTierAuthCard>
  );
}

export function FreeTierNameField({ onboardingV2 = false }: { onboardingV2?: boolean }) {
  return (
    <FreeTierFieldLabel label={onboardingV2 ? 'First and last name' : 'Your name'} htmlFor="name">
      <FreeTierTextInput id="name" name="name" required />
    </FreeTierFieldLabel>
  );
}

export function FreeTierSubmissionCard({
  onboardingV2 = false,
  bypassWaitlist = false,
  email,
}: {
  onboardingV2?: boolean;
  bypassWaitlist?: boolean;
  email?: string;
}) {
  const title = bypassWaitlist
    ? 'Check your email'
    : onboardingV2 ? "You're on the list!" : "You're on the list";
  const detail = bypassWaitlist
    ? email ? `Your join link is on its way to ${email}.` : 'Your join link is on its way.'
    : email ? `We will email ${email} when your classroom is ready.` : 'We will email you when your classroom is ready.';
  return (
    <FreeTierAuthCard
      status
      title={title}
      icon={bypassWaitlist ? <Mail /> : <CircleCheck className={onboardingV2 ? 'text-emerald-800' : undefined} />}
    >
      <p className="text-sm text-muted-foreground">{detail}</p>
    </FreeTierAuthCard>
  );
}

/** Render only after the server has durably recorded a below-9 submission. */
export function FreeTierBelowHighSchoolCard() {
  return (
    <FreeTierAuthCard status title="Free classrooms are for high school for now">
      <p className="text-sm text-muted-foreground">
        Thank you for your interest! Free Yawp! classrooms are currently available for grades 9–12. We’ve saved your email.
      </p>
      <p className="text-sm text-muted-foreground">
        Yawp! is available for younger grades through a site license.
        {' '}Contact <a className="underline" href="mailto:hello@yawp.school">hello@yawp.school</a> to learn more.
      </p>
    </FreeTierAuthCard>
  );
}

export function FreeTierGradeField({ serverError = false }: { serverError?: boolean }) {
  const [invalid, setInvalid] = useState(false);
  const showError = invalid || serverError;
  return (
    <>
      <FreeTierFieldLabel label="Grade level" htmlFor="gradeLevel">
        <select id="gradeLevel" name="gradeLevel" required defaultValue=""
          aria-invalid={showError} aria-describedby={showError ? 'signup-grade-error' : undefined}
          onInvalid={() => setInvalid(true)} onChange={() => setInvalid(false)}
          className="h-10 w-full rounded-md border border-input bg-input-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <option value="">Choose a grade</option>
          {['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].map(grade => <option key={grade} value={grade}>{grade === 'K' ? 'Kindergarten' : grade}</option>)}
        </select>
      </FreeTierFieldLabel>
      {showError ? <p id="signup-grade-error" role="alert" className="text-xs text-destructive">Choose a grade level.</p> : null}
    </>
  );
}
