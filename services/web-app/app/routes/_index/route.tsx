import type { MetaFunction } from 'react-router';

export const meta: MetaFunction = () => [
  { title: 'Welcome to YAWP! | Student and Teacher Login' },
  {
    name: 'description',
    content:
      'YAWP! is a writing platform built for middle school, high school, and college classrooms where students draft essays, get tutor feedback, and teachers follow progress.',
  },
  {
    property: 'og:title',
    content: 'Welcome to YAWP! | Student and Teacher Login',
  },
  {
    property: 'og:description',
    content:
      'A classroom writing platform where students learn a writing process, draft essays, and get real-time feedback from the YAWP! tutor.',
  },
  { property: 'og:type', content: 'website' },
];

const loginUrl = '/app';
const signupUrl = '/auth/inv/signup';
const infoUrl = '/info';
const accessibilityUrl = '/accessibility';
const itemNumber = '[Item #: AP1030]';

export default function IndexRoute() {
  return (
    <main className="yawp-entry">
      <section className="yawp-entry-shell">
        <a className="yawp-entry-logo" href="/" aria-label="YAWP! home">
          <img src="/img/landing/yawp-logo-circle.jpg" alt="YAWP!" />
        </a>

        <div className="yawp-entry-copy">
          <p className="yawp-entry-kicker">Students and teachers</p>
          <h1>
            Welcome to YAWP!
            <span>A space for students to think and write.</span>
          </h1>
          <p className="yawp-entry-description">
            YAWP! is a writing platform built for middle school, high school,
            and college classrooms. Students learn a writing process, draft
            essays, and get real-time feedback from the YAWP! tutor. Teachers
            use curriculum to teach proven lessons, create writing assignments,
            and follow student progress in real time.
          </p>
        </div>

        <div className="yawp-entry-actions" aria-label="Account actions">
          <a
            className="yawp-entry-button yawp-entry-button-primary"
            href={loginUrl}
          >
            Log In
          </a>
          <a
            className="yawp-entry-button yawp-entry-button-secondary"
            href={signupUrl}
          >
            Create Account
          </a>
        </div>

        <figure className="yawp-entry-quote">
          <blockquote>
            "I sound my barbaric yawp over the roofs of the world."
          </blockquote>
          <figcaption>Walt Whitman</figcaption>
        </figure>

        <p className="yawp-entry-tagline">
          Find your yawp, and learn how to make it heard.
        </p>

        <a className="yawp-entry-learn-more" href={infoUrl}>
          Learn more
        </a>

        <footer
          className="yawp-entry-footer yawp-footer-meta"
          aria-label="Site footer details"
        >
          <span>{itemNumber}</span>
          <span className="yawp-footer-divider" aria-hidden="true" />
          <a className="yawp-footer-meta-link" href={accessibilityUrl}>
            Accessibility
          </a>
        </footer>
      </section>
    </main>
  );
}
