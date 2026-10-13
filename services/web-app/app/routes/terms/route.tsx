import type { MetaFunction } from 'react-router';
import type { ReactNode } from 'react';
import { PublicLegalPage, PublicLegalSection } from './PublicLegalPage';

export const meta: MetaFunction = () => [
  { title: 'Terms of Service | YAWP! Writing Program' },
  {
    name: 'description',
    content:
      'Terms of Service for YAWP!, a classroom writing platform used by teachers and students.',
  },
  { property: 'og:title', content: 'Terms of Service | YAWP! Writing Program' },
  {
    property: 'og:description',
    content:
      'Terms of Service for YAWP!, a classroom writing platform used by teachers and students.',
  },
  { property: 'og:type', content: 'website' },
];

function List(props: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-6">{props.children}</ul>;
}

export default function TermsRoute() {
  return (
    <PublicLegalPage
      title="Terms of Service"
      eyebrow="Terms"
      updated="October 13, 2026"
    >
      <p className="text-lg leading-8 text-muted-foreground">
        These Terms of Service describe the basic rules for using YAWP!, a
        classroom writing platform operated by The Connell School of Writing. By
        using YAWP!, you agree to use the product responsibly and only as
        permitted by your role, organization, and applicable law.
      </p>

      <PublicLegalSection title="Use of YAWP!">
        <List>
          <li>
            Teachers and authorized staff may create classes, assignments, and
            feedback workflows.
          </li>
          <li>
            Students may use YAWP! for assigned classroom writing and related
            learning activities.
          </li>
          <li>
            Users must provide accurate account information and keep login
            credentials private.
          </li>
          <li>
            Users may not attempt to access accounts, classes, documents, or
            systems they are not authorized to use.
          </li>
        </List>
      </PublicLegalSection>

      <PublicLegalSection title="Classroom Content">
        <p>
          Teachers, students, and organizations are responsible for the content
          they enter into YAWP!, including prompts, drafts, submissions,
          comments, and classroom materials. YAWP! may process that content to
          provide product features, support, security, and service improvement.
        </p>
      </PublicLegalSection>

      <PublicLegalSection title="AI-Assisted Features">
        <p>
          YAWP! includes AI-assisted feedback and drafting-support features.
          These features are intended to support writing instruction, not
          replace teacher judgment or student authorship. Teachers and students
          should review AI-assisted feedback for accuracy, appropriateness, and
          fit with classroom expectations.
        </p>
      </PublicLegalSection>

      <PublicLegalSection title="Free Classroom Access">
        <p>
          Free classroom access may be limited by availability, eligibility,
          seat counts, usage limits, event links, or other launch controls.
          YAWP! may change, pause, or end free access when needed to operate the
          product, prevent abuse, or manage capacity.
        </p>
      </PublicLegalSection>

      <PublicLegalSection title="Service Availability">
        <p>
          YAWP! is provided as a hosted software product. The product may change
          over time, and access may occasionally be interrupted for maintenance,
          security, operational issues, or factors outside YAWP!'s control.
        </p>
      </PublicLegalSection>

      <PublicLegalSection title="Contact">
        <p>
          Questions about these Terms can be sent to yawp@theconnellschool.com.
          These Terms may be updated as YAWP! changes, and the updated date
          above will reflect the current version.
        </p>
      </PublicLegalSection>
    </PublicLegalPage>
  );
}
