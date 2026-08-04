import type { MetaFunction } from 'react-router';
import type { ReactNode } from 'react';

export const meta: MetaFunction = () => [
  { title: 'Accessibility at YAWP! | YAWP! Writing Program' },
  {
    name: 'description',
    content:
      'Accessibility information for the YAWP! Writing Program, including WCAG 2.1 Level AA support, known limitations, and how to report an accessibility issue.',
  },
  {
    property: 'og:title',
    content: 'Accessibility at YAWP! | YAWP! Writing Program',
  },
  {
    property: 'og:description',
    content:
      'YAWP! documents WCAG 2.1 Level AA accessibility support and provides an accessibility contact path for schools, teachers, students, and evaluators.',
  },
  { property: 'og:type', content: 'website' },
];

const supportEmail = 'yawp@theconnellschool.com';
const supportHref =
  'mailto:yawp@theconnellschool.com?subject=YAWP!%20accessibility%20support';

function Header() {
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <a
          className="inline-flex items-center gap-3 font-semibold text-foreground"
          href="/"
          aria-label="YAWP! home"
        >
          <img
            className="h-10 w-10 rounded-full"
            src="/img/landing/yawp-logo-circle.jpg"
            alt=""
          />
          <span>YAWP!</span>
        </a>
        <nav
          aria-label="Public accessibility navigation"
          className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm"
        >
          <a
            className="text-muted-foreground hover:text-foreground"
            href="/info"
          >
            Learn more
          </a>
          <a
            className="text-muted-foreground hover:text-foreground"
            href="/auth/login"
          >
            Student/Teacher Login
          </a>
        </nav>
      </div>
    </header>
  );
}

function Section(props: { title: string; children: ReactNode; id?: string }) {
  return (
    <section id={props.id} className="border-t py-8 first:border-t-0">
      <h2 className="text-2xl font-semibold tracking-normal text-foreground">
        {props.title}
      </h2>
      <div className="mt-4 space-y-4 text-base leading-7 text-muted-foreground">
        {props.children}
      </div>
    </section>
  );
}

export default function AccessibilityRoute() {
  return (
    <main className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:py-14">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            Accessibility
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-normal text-foreground sm:text-5xl">
            Accessibility at YAWP!
          </h1>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            YAWP! is a classroom writing platform for middle school, high
            school, and college use. The YAWP! product is designed and evaluated
            for WCAG 2.1 Level AA support across the product flows schools use
            to teach, write, review, and grade.
          </p>
        </div>

        <Section title="Product Scope">
          <p>
            The current accessibility review scope includes login, student
            writing and editor workflows, tutor chat, submission, teacher
            dashboard workflows, teacher grading, setup and administration, and
            Teacher&apos;s Lounge training content when that content is included
            in an implementation.
          </p>
        </Section>

        <Section title="Accessibility Support">
          <p>
            YAWP! uses semantic browser controls where possible, visible focus
            styles in shared controls, labeled form patterns, keyboard-capable
            editor foundations, and accessible component primitives for menus,
            dialogs, tabs, switches, and similar controls.
          </p>
          <p>
            Recent automated accessibility testing has covered login, student
            writing and tutor surfaces, the teacher dashboard, Teacher&apos;s
            Lounge pages, and teacher grading pages using axe WCAG 2.1 A and AA
            checks. Additional keyboard-smoke and reflow-proxy checks have
            passed on representative review flows, and a macOS VoiceOver smoke
            pass has covered key public, login, student editor, teacher grading,
            and Teacher&apos;s Lounge controls.
          </p>
        </Section>

        <Section title="Media Accessibility">
          <p>
            Student writing workflows do not require audio or video playback.
            Teacher&apos;s Lounge video modules can include WebVTT captions and
            transcript resources. When captions and transcripts are present,
            YAWP! exposes captions through the video player and provides
            transcript and caption download links on the module page.
          </p>
        </Section>

        <Section title="Known limitations">
          <ul className="list-disc space-y-2 pl-6">
            <li>
              Screen reader testing is still limited to a representative macOS
              VoiceOver smoke pass; full coverage of dynamic workflows and
              additional assistive technologies is not yet complete.
            </li>
            <li>
              Keyboard-smoke testing has passed on representative institutional
              review flows, but we are not claiming a completed human
              keyboard-only walkthrough.
            </li>
            <li>
              Browser print or save-as-PDF output should not be treated as a
              guaranteed tagged PDF export unless a specific export path has
              been separately tested.
            </li>
            <li>
              A user-level high contrast setting is available from the app
              settings menu. Font-size and theme settings are not yet exposed as
              school-level controls; users can use browser zoom and operating-
              system accessibility settings.
            </li>
          </ul>
        </Section>

        <Section title="Report an accessibility issue" id="report">
          <p>
            To report an accessibility barrier or request accommodation support,
            contact{' '}
            <a
              className="font-medium text-primary underline-offset-4 hover:underline"
              href={supportHref}
            >
              {supportEmail}
            </a>
            . Please include the page or workflow, the assistive technology or
            browser being used, and the issue encountered.
          </p>
          <p>
            Accessibility issues are triaged as product defects. We assess the
            affected workflow, prioritize based on user impact, verify fixes
            through keyboard and assistive-technology checks where applicable,
            and update documentation when product behavior changes.
          </p>
        </Section>

        <footer className="border-t py-8 text-sm text-muted-foreground">
          <p>
            Last updated June 29, 2026. For product or institutional questions,
            contact{' '}
            <a
              className="font-medium text-primary underline-offset-4 hover:underline"
              href={supportHref}
            >
              {supportEmail}
            </a>
            .
          </p>
        </footer>
      </div>
    </main>
  );
}
