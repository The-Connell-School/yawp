import { useState, type ReactNode } from 'react';
import { Link, useRouteLoaderData } from 'react-router';
import { ChevronDown } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '~/components/ui/collapsible';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '~/components/ui/sheet';
import { DocumentLink } from '~/components/document-link';
import type { Route as RootRoute } from '../../../+types/root';
import type { TypePageData } from './assignment-type-page';
import {
  typeGuideContent,
  moduleGuide,
  isFiveParagraph,
  numberWord,
} from './type-guide-content';
import { assignmentClassLabel, assignmentDueLabel } from './page-helpers';

export function ResponsiveRailCard({
  title,
  subtitle,
  open = false,
  children,
  eyebrow = false,
}: {
  title: string;
  subtitle: string;
  open?: boolean;
  children: ReactNode;
  eyebrow?: boolean;
}) {
  const [expanded, setExpanded] = useState(open);
  return (
    <Collapsible
      open={expanded}
      onOpenChange={setExpanded}
      className="rounded-xl border bg-popover"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between p-4 text-left lg:hidden">
        <span>
          <span className="block text-sm font-semibold">{title}</span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {subtitle}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground ${expanded ? 'rotate-180' : ''}`}
        />
      </CollapsibleTrigger>
      <div
        className={`hidden px-5 pt-5 lg:block ${eyebrow ? 'font-mono text-[11px] uppercase tracking-widest text-muted-foreground' : 'text-sm font-semibold'}`}
      >
        {title}
      </div>
      <CollapsibleContent
        forceMount
        className="data-[state=closed]:hidden lg:data-[state=closed]:block"
      >
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function AtAGlance({
  data,
  showModules,
  directions,
}: {
  data: TypePageData;
  showModules: boolean;
  directions: ReactNode;
}) {
  const [sheet, setSheet] = useState<'modules' | 'directions' | null>(null);
  const type = data.assignmentType;
  const content = typeGuideContent(type, data.assignmentTypeGradesGrammar);
  const modules = type.assignmentModules.map((m) => ({
    ...m,
    ...moduleGuide(m.title, isFiveParagraph(type.title)),
  }));
  const library = Boolean(
    data.thesisPromptLibrary ||
    data.promptLibrary ||
    data.shortFormPromptLibrary
  );
  const block = 'space-y-2 border-b p-5 last:border-b-0';
  return (
    <>
      <ResponsiveRailCard
        title="At a glance"
        eyebrow
        subtitle={`What students write${showModules ? `, the ${modules.length} modules` : ''}, grading`}
        open
      >
        <div className={block}>
          <h3 className="text-xs font-semibold">What students write</h3>
          <p className="text-sm leading-6 text-foreground/85">
            {content.whatStudentsWrite}
          </p>
        </div>
        {showModules && (
          <div
            className={block}
            data-tour={library ? 'type-modules' : undefined}
          >
            <h3 className="text-xs font-semibold">
              How students move through it
            </h3>
            {library ? (
              <>
                <ol className="space-y-2 pt-1">
                  {modules.map((m, index) => (
                    <li className="flex items-center gap-2 text-xs" key={m.id}>
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] text-muted-foreground">
                        {index + 1}
                      </span>
                      {m.label}
                    </li>
                  ))}
                </ol>
                <button
                  type="button"
                  onClick={() => setSheet('modules')}
                  className="pt-2 text-sm text-primary"
                >
                  Module details ›
                </button>
              </>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">
                {numberWord(modules.length)} modules, from{' '}
                {modules[0]?.label.toLowerCase()} to{' '}
                {modules.at(-1)?.label.toLowerCase()}. They’re listed on the
                left.
              </p>
            )}
          </div>
        )}
        <div className={block}>
          <h3 className="text-xs font-semibold">How it’s graded</h3>
          <p className="text-sm leading-6 text-foreground/85">
            {content.howItsGraded}
          </p>
          {type.rubric && (
            <p className="text-xs text-muted-foreground">
              Rubric:{' '}
              {('title' in type.rubric && type.rubric.title) ||
                type.rubric.name}
            </p>
          )}
        </div>
        {directions && (
          <div className={block} data-tour="type-directions">
            <h3 className="text-xs font-semibold">Teaching guide</h3>
            <p className="text-sm leading-6 text-foreground/85">
              {content.teachingGuideBlurb}
            </p>
            <button
              type="button"
              onClick={() => setSheet('directions')}
              className="text-sm text-primary"
            >
              Read the guide ›
            </button>
          </div>
        )}
      </ResponsiveRailCard>
      <Sheet
        open={sheet !== null}
        onOpenChange={(open) => {
          if (!open) setSheet(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto bg-popover sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>
              {sheet === 'modules' ? 'Module details' : 'Teaching guide'}
            </SheetTitle>
            <SheetDescription>{type.title}</SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            {sheet === 'modules' ? (
              <ol className="divide-y">
                {modules.map((m, index) => (
                  <li key={m.id} className="space-y-2 py-5">
                    <h3 className="font-semibold">
                      {index + 1}. {m.label}
                    </h3>
                    {m.oneLiner && (
                      <p className="text-sm leading-6">{m.oneLiner}</p>
                    )}
                    <p className="pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Students see
                    </p>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                      {m.description || 'No description.'}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              directions
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function YourAssignments({ data }: { data: TypePageData }) {
  const root =
    useRouteLoaderData<RootRoute.ComponentProps['loaderData']>('root');
  const timeZone = root?.requestInfo.hints.timeZone ?? 'UTC';
  const assignments = data.yourAssignments;
  return (
    <ResponsiveRailCard
      title="Your assignments"
      subtitle={`${assignments?.count ?? 0} with this type`}
    >
      <div className="px-5 pb-5 pt-3">
        {!assignments?.items.length ? (
          <p className="text-sm leading-6 text-muted-foreground">
            You haven’t assigned this type yet. Assignments you create from it
            will be listed here.
          </p>
        ) : (
          <ul className="divide-y">
            {assignments.items.map((assignment) => (
              <li key={assignment.id} className="py-3 first:pt-0">
                <Link
                  to={`/app/assignments/${assignment.id}`}
                  className="block text-sm font-medium hover:text-primary"
                >
                  {assignment.title?.trim() ||
                    assignment.prompt.trim().slice(0, 85) ||
                    'Untitled assignment'}
                </Link>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {[
                    assignmentClassLabel(
                      assignment.classAssignments.map((c) => c.class)
                    ),
                    assignmentDueLabel(
                      assignment.classAssignments.map((c) => c.dueAt),
                      timeZone
                    ),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        )}
        <Link
          to="/app/assignments"
          className="mt-4 inline-block text-sm text-primary"
        >
          All in My Assignments ›
        </Link>
      </div>
    </ResponsiveRailCard>
  );
}

export function EarlierDocuments({ data }: { data: TypePageData }) {
  const [view, setView] = useState<'active' | 'archived' | null>(null);
  const count = data.documents.length + data.archivedDocuments.length;
  if (!count) return null;
  return (
    <section data-tour="type-documents" className="border-t pt-6">
      <h2 className="text-sm font-semibold">Earlier documents</h2>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {count} documents you made with this type before assignments. They still
        open and work.
      </p>
      <div className="mt-3 flex flex-wrap gap-4 text-sm text-primary">
        <button type="button" onClick={() => setView('active')}>
          View documents ›
        </button>
        {data.archivedDocuments.length > 0 && (
          <button type="button" onClick={() => setView('archived')}>
            Archived ({data.archivedDocuments.length})
          </button>
        )}
      </div>
      <Sheet
        open={view !== null}
        onOpenChange={(open) => {
          if (!open) setView(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto bg-popover sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Earlier documents</SheetTitle>
            <SheetDescription>
              Your documents still open and work.
            </SheetDescription>
          </SheetHeader>
          <div
            className="my-5 flex gap-4"
            role="tablist"
            aria-label="Document collection"
          >
            <button
              type="button"
              role="tab"
              aria-selected={view === 'active'}
              onClick={() => setView('active')}
              className="text-sm aria-selected:font-semibold"
            >
              Documents ({data.documents.length})
            </button>
            {data.archivedDocuments.length > 0 && (
              <button
                type="button"
                role="tab"
                aria-selected={view === 'archived'}
                onClick={() => setView('archived')}
                className="text-sm aria-selected:font-semibold"
              >
                Archived ({data.archivedDocuments.length})
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(view === 'archived'
              ? data.archivedDocuments
              : data.documents
            ).map((doc) => (
              <DocumentLink
                key={doc.id}
                doc={doc}
                exitTo={`/app/assignment-types/${data.assignmentType.id}`}
                isStudentView
                isArchived={view === 'archived'}
              />
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}
