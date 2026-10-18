import type { MetaFunction } from 'react-router';
import type { ReactNode } from 'react';
import { PublicLegalPage, PublicLegalSection } from '../terms/PublicLegalPage';

export const meta: MetaFunction = () => [
  { title: 'Privacy Policy | YAWP! Writing Program' },
  {
    name: 'description',
    content:
      'Privacy Policy for YAWP!, a classroom writing platform used by teachers and students.',
  },
  { property: 'og:title', content: 'Privacy Policy | YAWP! Writing Program' },
  {
    property: 'og:description',
    content:
      'Privacy Policy for YAWP!, a classroom writing platform used by teachers and students.',
  },
  { property: 'og:type', content: 'website' },
];

function List(props: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-6">{props.children}</ul>;
}

export default function PrivacyRoute() {
  return (
    <PublicLegalPage
      title="Privacy Policy"
      updated="October 14, 2026"
    >
      <p className="text-lg leading-8 text-muted-foreground">
        YAWP! is a classroom writing platform operated by The Connell School of
        Writing. This Privacy Policy explains, in general terms, what
        information YAWP! collects and how it is used to provide the product.
      </p>

      <PublicLegalSection title="Information We Collect">
        <List>
          <li>
            Account information, such as name, email address, role, and login
            details.
          </li>
          <li>
            Classroom information, such as classes, assignments, rosters, and
            teacher settings.
          </li>
          <li>
            Student work and feedback, including drafts, submissions, comments,
            scores, tutor messages, and related writing activity.
          </li>
          <li>
            Technical information, such as device, browser, IP address, logs,
            cookies, and product usage events. Analytics and error telemetry,
            including PostHog, are used where configured.
          </li>
          <li>
            Free classroom request information, such as name, organization
            email, organization name, location, grade level, and event-link
            activity.
          </li>
        </List>
      </PublicLegalSection>

      <PublicLegalSection title="How We Use Information">
        <List>
          <li>
            To create accounts, authenticate users, and provide classroom
            writing workflows.
          </li>
          <li>
            To let teachers manage assignments, review student work, and provide
            feedback.
          </li>
          <li>
            To provide automated writing feedback and related product
            features.
          </li>
          <li>
            To maintain security, prevent abuse, troubleshoot issues, and
            support users.
          </li>
          <li>
            To evaluate and improve product reliability, quality, and classroom
            usefulness.
          </li>
        </List>
      </PublicLegalSection>

      <PublicLegalSection title="Automated Feedback">
        <p>
          YAWP! includes automated feedback features that help students revise
          and help teachers review writing. Student work, prompts, and related
          context may be processed to provide those features. YAWP! is designed
          for classroom use where teachers remain responsible for assignments,
          instruction, grading decisions, and classroom expectations.
        </p>
      </PublicLegalSection>

      <PublicLegalSection title="Sharing">
        <p>
          YAWP! uses service providers for hosting, email, automated feedback features,
          and analytics where configured. Information is processed by those
          providers to deliver the enabled features. Classroom work and feedback
          are available to users according to their roles and access permissions.
        </p>
      </PublicLegalSection>

      <PublicLegalSection title="Retention and Choices">
        <p>
          For questions about stored account information, classroom records,
          access, correction, retention, or deletion, contact YAWP! using the
          address below. This page does not set a retention period or a deletion
          timetable.
        </p>
      </PublicLegalSection>

      <PublicLegalSection title="Contact">
        <p>
          Questions about this Privacy Policy can be sent to{' '}
          <a className="underline underline-offset-4" href="mailto:support@yawp.school">support@yawp.school</a>. This page may be updated as YAWP! changes,
          and the updated date above will reflect the current version.
        </p>
      </PublicLegalSection>
    </PublicLegalPage>
  );
}
