import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router';
import { FileText, PlayCircle } from 'lucide-react';

import { cn } from '~/utils/misc';

import type { LandingBlock, LandingPage, LandingSection } from './content';

/**
 * Inline markup used by the landing copy: **bold** and *italic*. Nothing else
 * is interpreted, so copy can carry quotes, dashes and ellipses as written.
 */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={index} className="font-semibold text-foreground">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
          return <em key={index}>{part.slice(1, -1)}</em>;
        }
        return <Fragment key={index}>{part}</Fragment>;
      })}
    </>
  );
}

/** A module, as the route loads it. */
export type LandingModule = { id: string; title: string };

/** Where a step's lesson stack and tutorial video live, once they exist. */
export type StepResources = Record<
  string,
  { stackHref?: string | null; videoHref?: string | null }
>;

/** The key a module's resources are filed under: its title, slugged. */
export function stepResourceKey(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function StepResource({
  href,
  icon,
  label,
}: {
  href?: string | null;
  icon: ReactNode;
  label: string;
}) {
  const body = (
    <>
      {icon}
      {label}
    </>
  );
  const className =
    'inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1 text-xs';
  if (href) {
    return (
      <Link
        to={href}
        className={cn(className, 'font-medium text-foreground hover:bg-muted')}
      >
        {body}
      </Link>
    );
  }
  return (
    <span
      aria-disabled="true"
      title="Coming soon"
      className={cn(className, 'border-dashed text-muted-foreground')}
    >
      {body}
      <span className="sr-only"> (coming soon)</span>
    </span>
  );
}

function Steps({
  block,
  modules,
  stepResources,
}: {
  block: Extract<LandingBlock, { type: 'steps' }>;
  modules: LandingModule[];
  stepResources: StepResources;
}) {
  if (modules.length === 0) return null;
  return (
    <div className="space-y-2">
      {block.lead ? (
        <p className="text-sm text-foreground">
          <RichText text={block.lead} />
        </p>
      ) : null}
      <ol className="divide-y rounded-lg border" data-tour="type-modules">
        {modules.map((module, index) => {
          const resources = stepResources[stepResourceKey(module.title)] ?? {};
          return (
            <li
              key={module.id}
              data-testid="how-to-teach-step"
              className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="flex items-baseline gap-2 text-sm">
                <span className="w-5 shrink-0 text-right tabular-nums text-muted-foreground">
                  {index + 1}.
                </span>
                <span data-step-title className="font-medium">
                  {module.title.trim()}
                </span>
              </span>
              {block.links ? (
                <span className="flex gap-2 pl-7 sm:pl-0">
                  <StepResource
                    href={resources.stackHref}
                    icon={<FileText className="h-3.5 w-3.5" aria-hidden />}
                    label="Lesson stack"
                  />
                  <StepResource
                    href={resources.videoHref}
                    icon={<PlayCircle className="h-3.5 w-3.5" aria-hidden />}
                    label="Tutorial video"
                  />
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Block({
  block,
  modules,
  stepResources,
}: {
  block: LandingBlock;
  modules: LandingModule[];
  stepResources: StepResources;
}) {
  if (block.type === 'paragraph') {
    return (
      <p className="text-sm text-muted-foreground sm:text-base">
        <RichText text={block.text} />
      </p>
    );
  }
  if (block.type === 'bullets') {
    return (
      <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground sm:text-base">
        {block.items.map((item) => (
          <li key={item}>
            <RichText text={item} />
          </li>
        ))}
      </ul>
    );
  }
  return <Steps block={block} modules={modules} stepResources={stepResources} />;
}

/**
 * The description, in the page header where the type's stored description
 * used to sit. It needs no heading: it is the first thing under the title.
 */
export function LandingDescription({ page }: { page: LandingPage }) {
  return (
    <div className="flex flex-col gap-3" data-testid="landing-description">
      {page.description.map((block, index) => (
        <Block key={index} block={block} modules={[]} stepResources={{}} />
      ))}
    </div>
  );
}

function Section({
  section,
  modules,
  stepResources,
}: {
  section: LandingSection;
  modules: LandingModule[];
  stepResources: StepResources;
}) {
  const headingId = `landing-${section.id}`;
  // The library right below the intro is labelled "Prompt Library" already;
  // a second visible heading saying the same thing would only stack up.
  const headingHidden = section.id === 'prompt-library';
  return (
    <section
      aria-labelledby={headingId}
      className="space-y-3"
      data-testid={`landing-section-${section.id}`}
      data-tour={section.id === 'how-it-works' ? 'type-directions' : undefined}
    >
      <h2
        id={headingId}
        className={cn('text-lg font-semibold', headingHidden && 'sr-only')}
      >
        {section.heading}
      </h2>
      {section.blocks.map((block, index) => (
        <Block
          key={index}
          block={block}
          modules={modules}
          stepResources={stepResources}
        />
      ))}
    </section>
  );
}

/**
 * Everything the landing page says between the header and the library:
 * How to Teach It, When to use it, How it works, and so on, in the order the
 * page's copy lists them. The library, the New menu, and the teacher's
 * documents are the route's, unchanged.
 */
export function LandingSections({
  page,
  modules,
  stepResources = {},
}: {
  page: LandingPage;
  modules: LandingModule[];
  stepResources?: StepResources;
}) {
  return (
    <div className="mb-6 flex flex-col gap-6" data-testid="assignment-type-landing">
      {page.sections.map((section) => (
        <Section
          key={section.id}
          section={section}
          modules={modules}
          stepResources={stepResources}
        />
      ))}
    </div>
  );
}
