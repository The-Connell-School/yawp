import { Link } from 'react-router';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import { isExternalTeachLink } from '~/domain/assignment-types/how-to-teach-it';

export type HowToTeachItModule = {
  id: string;
  title: string;
  description: string | null;
  lessonUrl: string | null;
  tutorialVideoUrl: string | null;
};

const LINK_CLASS =
  'whitespace-nowrap font-medium text-primary underline-offset-4 hover:underline';

function TeachLink({
  href,
  label,
  step,
}: {
  href: string;
  label: string;
  step: string;
}) {
  // Every row has the same two link labels, so screen readers also hear which
  // step a link belongs to.
  const text = (
    <>
      {label}
      <span className="sr-only"> for {step}</span>
    </>
  );
  if (isExternalTeachLink(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
        {text}
      </a>
    );
  }
  return (
    <Link to={href} className={LINK_CLASS}>
      {text}
    </Link>
  );
}

/**
 * Teacher view of an assignment type's modules (Brian, Nov 2 2026). Each
 * module is one teaching step: open it to read what students do and how the
 * tutor helps, and go straight to that step's lesson and tutorial video.
 */
export function HowToTeachIt({ modules }: { modules: HowToTeachItModule[] }) {
  return (
    // `type-modules` is the guided tours' anchor for "The writing process".
    <section className="pb-6" data-testid="how-to-teach-it" data-tour="type-modules">
      <h2 className="text-base font-semibold">How to Teach It</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        These are the steps your students work through. Open a step to see what
        students do and how the tutor helps.
      </p>
      <Accordion type="multiple" className="mt-2">
        {modules.map((module) => (
          <AccordionItem
            key={module.id}
            value={module.id}
            className="border-b border-border/40"
            data-testid="how-to-teach-it-row"
          >
            <div className="flex flex-wrap items-center gap-x-4">
              <div className="min-w-0 flex-1">
                <AccordionTrigger className="py-2 text-left text-sm">
                  {module.title}
                </AccordionTrigger>
              </div>
              {module.lessonUrl || module.tutorialVideoUrl ? (
                <div className="flex gap-4 pb-2 text-sm sm:pb-0">
                  {module.lessonUrl ? (
                    <TeachLink
                      href={module.lessonUrl}
                      label="Open lesson"
                      step={module.title}
                    />
                  ) : null}
                  {module.tutorialVideoUrl ? (
                    <TeachLink
                      href={module.tutorialVideoUrl}
                      label="Watch tutorial"
                      step={module.title}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
            <AccordionContent className="text-muted-foreground">
              {module.description || 'No description.'}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
