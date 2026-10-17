// Local component fixture. Never registered as an application route.
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import {
  FreeTierWelcomeCard,
  FreeTierNameField,
  FreeTierSubmissionCard,
  FreeTierBelowHighSchoolCard,
} from '../../../app/routes/free._index/WelcomePresentation';
import {
  FreeTierButton,
  FreeTierFieldLabel,
  FreeTierTextInput,
} from '../../../app/routes/free-tier/FreeTierAuthCard';
import '../../../app/app.css';

const state = new URLSearchParams(location.search).get('state') ?? 'legacy-form';
const onboardingV2 = state.startsWith('v2');

createRoot(document.getElementById('root')!).render(
  <MemoryRouter>
    {state.endsWith('form') ? (
      <FreeTierWelcomeCard onboardingV2={onboardingV2 || undefined}>
        <form className="flex flex-col gap-4" onSubmit={event => event.preventDefault()}>
          <FreeTierNameField onboardingV2={onboardingV2 || undefined} />
          <FreeTierFieldLabel label="School email" htmlFor="email">
            <FreeTierTextInput id="email" name="email" type="email" placeholder="you@school.edu" required />
          </FreeTierFieldLabel>
          <FreeTierFieldLabel label="School name" htmlFor="schoolName">
            <FreeTierTextInput id="schoolName" name="schoolName" required />
          </FreeTierFieldLabel>
          <FreeTierFieldLabel label="Location" htmlFor="location">
            <FreeTierTextInput id="location" name="location" placeholder="City, state" required />
          </FreeTierFieldLabel>
          <FreeTierFieldLabel label="Grade level" htmlFor="gradeLevel">
            <FreeTierTextInput id="gradeLevel" name="gradeLevel" required />
          </FreeTierFieldLabel>
          <FreeTierButton type="submit">Join the waitlist</FreeTierButton>
        </form>
      </FreeTierWelcomeCard>
    ) : state === 'v2-decline' ? (
      <FreeTierBelowHighSchoolCard />
    ) : (
      <FreeTierSubmissionCard onboardingV2={onboardingV2 || undefined} email="ada@example.test" bypassWaitlist={state === 'v2-event-confirmation'} />
    )}
  </MemoryRouter>
);
