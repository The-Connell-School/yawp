import type { ReactNode } from 'react';
import { CircleCheck, Mail } from 'lucide-react';
import {
  FreeTierAuthCard,
  FreeTierFieldLabel,
  FreeTierTextInput,
} from '../free-tier/FreeTierAuthCard';

// Presentation only. Connect to the public flag reader and server result only
// after the shared decline writer and durable admission exclusions are available.
// No application route imports these components yet.
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
      title="Try YAWP with your students"
      subtitle={onboardingV2
        ? "We're so glad you're here and we can't wait for you to YAWP with your students"
        : eventLink
          ? 'Use your event link to continue.'
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
        Thank you for your interest! Free YAWP classrooms are currently available for grades 9–12.
      </p>
      <p className="text-sm text-muted-foreground">
        YAWP is available for younger grades through a site license.
        {' '}Contact <a className="underline" href="mailto:hello@yawp.school">hello@yawp.school</a> to learn more.
      </p>
    </FreeTierAuthCard>
  );
}
