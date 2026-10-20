import type { MetaFunction } from 'react-router';
import type { ReactNode } from 'react';
import { PublicLegalPage, PublicLegalSection } from '../terms/PublicLegalPage';

export const meta: MetaFunction = () => [
  { title: 'Privacy Policy | Yawp! Writing Program' },
  {
    name: 'description',
    content:
      'Privacy Policy for Yawp!, a classroom writing platform used by teachers and students.',
  },
  { property: 'og:title', content: 'Privacy Policy | Yawp! Writing Program' },
  {
    property: 'og:description',
    content:
      'Privacy Policy for Yawp!, a classroom writing platform used by teachers and students.',
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
      eyebrow="Privacy"
      updated="October 20, 2026"
    >
      <p className="text-lg leading-8 text-muted-foreground">
        Yawp! is a classroom writing platform operated by The Connell School of
        Writing. This Privacy Policy explains, in general terms, what
        information Yawp! collects and how it is used to provide the product.
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
          Yawp! includes automated feedback features that help students revise
          and help teachers review writing. Student work, prompts, and related
          context may be sent to model providers to provide those features. Yawp!
          is designed for classroom use where teachers remain responsible for
          assignments, instruction, grading decisions, and classroom
          expectations.
        </p>
        <p>
          Student content is never used to train any model.
        </p>
      </PublicLegalSection>

      <PublicLegalSection title="Service Providers">
        <p>
          Yawp! uses service providers to host the product, deliver email, run
          writing feedback services, process payments, and measure product use
          where configured. Current providers include:
        </p>
        <List>
          <li>
            Amazon Web Services (AWS), including hosting, database, object
            storage, and Amazon Simple Email Service (SES) for email delivery.
          </li>
          <li>Anthropic, for writing feedback services.</li>
          <li>OpenAI, as a configured fallback for some writing feedback services.</li>
          <li>PostHog, for analytics and error telemetry where configured.</li>
          <li>Stripe, for payment processing where enabled.</li>
        </List>
        <p>
          Information is processed by those providers to deliver the enabled
          features. Classroom work and feedback are available to users according
          to their roles and access permissions.
        </p>
        <p>
          Model providers may hold content for up to 30 days for abuse
          monitoring, then it is deleted automatically, unless longer retention
          is required by law or the content is flagged for misuse.
        </p>
      </PublicLegalSection>

      <PublicLegalSection title="Retention">
        <List>
          <li>
            Automated database backups are retained for 7 days.
          </li>
          <li>
            Eligible manual database snapshots and database export files in
            object storage expire after 90 days.
          </li>
        </List>
      </PublicLegalSection>

      <PublicLegalSection title="Your Choices">
        <p>
          For questions about stored account information, classroom records,
          access, correction, retention, or deletion, contact Yawp! using the
          address below.
        </p>
        <p>
          We delete account and classroom data within 30 days of a verified
          deletion request sent to{' '}
          <a className="underline underline-offset-4" href="mailto:support@yawp.school">support@yawp.school</a>.
        </p>
      </PublicLegalSection>

      <PublicLegalSection title="Security Incidents">
        <p>
          If a security breach affects personal information, we notify affected
          schools or users within 72 hours of confirming it.
        </p>
      </PublicLegalSection>

      <PublicLegalSection title="Contact">
        <p>
          Questions about this Privacy Policy can be sent to{' '}
          <a className="underline underline-offset-4" href="mailto:support@yawp.school">support@yawp.school</a>. This page may be updated as Yawp! changes,
          and the updated date above will reflect the current version.
        </p>
      </PublicLegalSection>
    </PublicLegalPage>
  );
}
