import type { MetaFunction } from 'react-router';
import type { ReactNode } from 'react';
import { PublicLegalPage, PublicLegalSection } from '../terms/PublicLegalPage';

export const meta: MetaFunction = () => [
  { title: 'Accessibility at Yawp! | Yawp! Writing Program' },
  {
    name: 'description',
    content:
      'Accessibility information for the Yawp! Writing Program, including WCAG 2.1 Level AA support, known limitations, and how to report an accessibility issue.',
  },
  {
    property: 'og:title',
    content: 'Accessibility at Yawp! | Yawp! Writing Program',
  },
  {
    property: 'og:description',
    content:
      'Yawp! documents WCAG 2.1 Level AA accessibility support and provides an accessibility contact path for schools, teachers, students, and evaluators.',
  },
  { property: 'og:type', content: 'website' },
];

const supportEmail = 'yawp@theconnellschool.com';
const supportHref =
  'mailto:yawp@theconnellschool.com?subject=Yawp!%20accessibility%20support';

function List(props: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-6">{props.children}</ul>;
}

export default function AccessibilityRoute() {
  return (
    <PublicLegalPage
      title="Accessibility at Yawp!"
      eyebrow="Accessibility"
      updated="June 29, 2026"
    >
      <p className="text-lg leading-8 text-muted-foreground">
        Yawp! is a classroom writing platform for middle school, high school, and
        college use. The Yawp! product is designed and evaluated for WCAG 2.1
        Level AA support across the product flows schools use to teach, write,
        review, and grade.
      </p>

      <PublicLegalSection title="Product Scope">
        <p>
          The current accessibility review scope includes login, student writing
          and editor workflows, tutor chat, submission, teacher dashboard
          workflows, teacher grading, setup and administration, and
          Teacher&apos;s Lounge training content when that content is included in
          an implementation.
        </p>
      </PublicLegalSection>

      <PublicLegalSection title="Accessibility Support">
        <p>
          Yawp! uses semantic browser controls where possible, visible focus
          styles in shared controls, labeled form patterns, keyboard-capable
          editor foundations, and accessible component primitives for menus,
          dialogs, tabs, switches, and similar controls.
        </p>
        <p>
          Recent automated accessibility testing has covered login, student
          writing and tutor surfaces, the teacher dashboard, Teacher&apos;s
          Lounge pages, and teacher grading pages using axe WCAG 2.1 A and AA
          checks. Additional keyboard-smoke and reflow-proxy checks have passed
          on representative review flows, and a macOS VoiceOver smoke pass has
          covered key public, login, student editor, teacher grading, and
          Teacher&apos;s Lounge controls.
        </p>
      </PublicLegalSection>

      <PublicLegalSection title="Media Accessibility">
        <p>
          Student writing workflows do not require audio or video playback.
          Teacher&apos;s Lounge video modules can include WebVTT captions and
          transcript resources. When captions and transcripts are present, Yawp!
          exposes captions through the video player and provides transcript and
          caption download links on the module page.
        </p>
      </PublicLegalSection>

      <PublicLegalSection title="Known limitations">
        <List>
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
            guaranteed tagged PDF export unless a specific export path has been
            separately tested.
          </li>
          <li>
            A user-level high contrast setting is available from the app settings
            menu. Font-size and theme settings are not yet exposed as
            school-level controls; users can use browser zoom and operating-
            system accessibility settings.
          </li>
        </List>
      </PublicLegalSection>

      <PublicLegalSection title="Report an accessibility issue" id="report">
        <p>
          To report an accessibility barrier or request accommodation support,
          contact{' '}
          <a
            className="font-medium text-link underline-offset-4 hover:underline"
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
          through keyboard and assistive-technology checks where applicable, and
          update documentation when product behavior changes.
        </p>
        <p>
          For product or institutional questions, contact{' '}
          <a
            className="font-medium text-link underline-offset-4 hover:underline"
            href={supportHref}
          >
            {supportEmail}
          </a>
          .
        </p>
      </PublicLegalSection>
    </PublicLegalPage>
  );
}