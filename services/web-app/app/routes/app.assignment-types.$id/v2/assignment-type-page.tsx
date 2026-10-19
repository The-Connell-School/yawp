import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Link,
  useLoaderData,
  useRouteLoaderData,
  useSearchParams,
} from 'react-router';
import { ArrowLeft, ArrowUp, CirclePlay } from 'lucide-react';
import { Button } from '~/components/ui/button';
import type { Route as RootRoute } from '../../../+types/root';
import type { loader } from '../route';
import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';
import { isThesisDrivenEssayTitle } from '~/domain/assignment-types/thesis-driven-essay';
import { isExitTicketAssignmentType } from '~/domain/assignment-types/exit-ticket';
import { FROM_LESSON_PARAM } from '~/domain/lesson-planner/daily-pages-block';
import {
  EXIT_TICKET_PARAMS,
  readExitTicketPrefill,
  type ExitTicketPrefill,
} from '~/domain/lesson-planner/exit-ticket-block';
import type { ApHistorySourceCardData } from '~/components/ap-history/source-card';
import { CreateAssignmentSheet } from '../create-assignment-sheet';
import {
  CreateCustomApHistorySheet,
  type CustomEssayType,
} from '../ap-history/create-custom-sheet';
import { ApPromptsLibrary } from '../ap-history/ap-prompts-library';
import { ApHistoryTeacherDirections } from '../ap-history/teacher-directions';
import { ApHistoryGradingBreakdown } from '../ap-history/grading-breakdown';
import { ThesisTeacherDirections } from '../thesis-prompts-library/thesis-teacher-directions';
import { ThesisPromptGenerator } from '../thesis-prompts-library/thesis-prompt-generator';
import { DailyPagesPromptGenerator } from '../prompts-library/daily-pages-prompt-generator';
import { TeacherDirections } from '../prompts-library/teacher-directions';
import { AboutDailyPages } from '../about-daily-pages/about-daily-pages';
import { AboutExitTicket } from '../about-exit-ticket/about-exit-ticket';
import {
  isFiveParagraph,
  moduleGuide,
  numberWord,
  typeGuideContent,
} from './type-guide-content';
import { NewAssignment } from './new-assignment';
import { AtAGlance, EarlierDocuments, YourAssignments } from './guide-rail';
import { PromptLibraryV2 } from './prompt-library';

export type TypePageData = ReturnType<typeof useLoaderData<typeof loader>>;
export function AssignmentTypePageV2() {
  const data = useLoaderData<typeof loader>();
  const root =
    useRouteLoaderData<RootRoute.ComponentProps['loaderData']>('root');
  const [params, setParams] = useSearchParams();
  const scroller = useRef<HTMLDivElement>(null);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [custom, setCustom] = useState<CustomEssayType | null>(null);
  const [prompt, setPrompt] = useState('');
  const [plannedExitTicket, setPlannedExitTicket] =
    useState<ExitTicketPrefill | null>(null);
  const [apEntry, setApEntry] = useState<{
    externalKey: string;
    title: string;
    prompt: string;
    essayType: string;
    sources?: ApHistorySourceCardData[];
  } | null>(null);
  const type = data.assignmentType;
  const content = typeGuideContent(type, data.assignmentTypeGradesGrammar);
  const corpus = data.thesisPromptLibrary
    ? 'thesis'
    : data.promptLibrary
      ? 'freewrite'
      : 'short-form';
  const library =
    data.thesisPromptLibrary ??
    data.promptLibrary ??
    data.shortFormPromptLibrary;
  const generator = Boolean(data.thesisPromptLibrary || data.promptLibrary);
  const ap = type.systemKey === AP_HISTORY_ASSIGNMENT_TYPE_KEY;
  const exit = isExitTicketAssignmentType(type);
  const showModules =
    type.assignmentModules.length > 0 && !exit && !data.shortFormPromptLibrary;
  const fromLesson = params.get(FROM_LESSON_PARAM);
  const incomingPrompt = params.get('newPrompt');
  const incomingExitMode = params.get(EXIT_TICKET_PARAMS.mode);
  const incomingExit = useMemo(
    () => (incomingExitMode ? readExitTicketPrefill(params) : null),
    [incomingExitMode, params]
  );
  useEffect(() => {
    if (!incomingPrompt && !incomingExitMode) return;
    if (incomingPrompt) {
      setPrompt(incomingPrompt);
      setAssignmentOpen(true);
    }
    if (incomingExit) {
      setPlannedExitTicket(incomingExit);
      setAssignmentOpen(true);
    }
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete('newPrompt');
        for (const key of Object.values(EXIT_TICKET_PARAMS)) next.delete(key);
        return next;
      },
      { replace: true, preventScrollReset: true }
    );
  }, [incomingPrompt, incomingExitMode, incomingExit, setParams]);
  function assign(body: string) {
    setPrompt(body);
    setApEntry(null);
    setPlannedExitTicket(null);
    setAssignmentOpen(true);
  }
  const directions = data.thesisPromptLibrary ? (
    <ThesisTeacherDirections />
  ) : data.promptLibrary ? (
    <TeacherDirections
      variant={data.promptLibrary.variant}
      platformEnhancements
    />
  ) : data.shortFormPromptLibrary || type.kind === 'daily_pages' ? (
    <AboutDailyPages />
  ) : exit ? (
    <AboutExitTicket />
  ) : ap ? (
    <>
      <ApHistoryTeacherDirections />
      <ApHistoryGradingBreakdown audience="teacher" />
    </>
  ) : null;
  const menuProps = {
    hasClasses: data.teacherClasses.length > 0,
    library: Boolean(library),
    generator,
    apHistory: ap,
    promptCount: library?.totalCount ?? 0,
    quotaLabel:
      'quotaLabel' in data.assignmentCreationAvailability
        ? String(data.assignmentCreationAvailability.quotaLabel)
        : undefined,
    onWrite: () => assign(''),
    onGenerate: () => setGeneratorOpen(true),
    onCustom: setCustom,
  };
  const meta = [
    showModules ? `${type.assignmentModules.length} modules` : null,
    library ? `${library.totalCount} prompts` : null,
    content.gradingLabel,
    content.tutorOn ? 'Tutor on' : null,
    !library && !ap && !exit ? 'You write the prompt' : null,
  ].filter(Boolean);
  const modules = type.assignmentModules.map((m) => ({
    ...m,
    ...moduleGuide(m.title, isFiveParagraph(type.title)),
  }));
  return (
    <div
      ref={scroller}
      className="no-scrollbar h-full w-full overflow-y-scroll"
      data-tour-variant={type.kind ?? undefined}
    >
      <div className="mx-auto w-full max-w-[1180px] px-4 pb-28 pt-5 sm:px-6 lg:pb-10 lg:pt-6">
        <div className="mb-7 flex items-center justify-between gap-3 lg:mb-8">
          <Link
            to={
              fromLesson && root?.lessonPlannerEnabled
                ? `/app/lesson-planner?c=${fromLesson}`
                : '/app'
            }
            data-testid={
              fromLesson && root?.lessonPlannerEnabled
                ? 'back-to-lesson'
                : undefined
            }
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {fromLesson && root?.lessonPlannerEnabled
              ? 'Back to your lesson'
              : 'Back to dashboard'}
          </Link>
          <div className="hidden items-center gap-5 lg:flex">
            {isThesisDrivenEssayTitle(type.title) && (
              <Link
                className="inline-flex items-center gap-1.5 text-sm text-primary"
                to={`/app/assignment-types/${type.id}/how-it-works`}
              >
                <CirclePlay className="h-4 w-4" />
                See how it works
              </Link>
            )}
            <NewAssignment {...menuProps} />
          </div>
        </div>
        <header className="mb-6 flex flex-col gap-5 border-b pb-6 lg:mb-7 lg:flex-row lg:items-center lg:gap-6">
          {type.image && (
            <img
              src={`/api/image/course/${type.image.id}`}
              alt={type.title}
              className="h-[168px] w-full rounded-lg object-cover lg:h-[88px] lg:w-[150px] lg:shrink-0"
            />
          )}
          <div className="min-w-0">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Assignment type
            </p>
            <h1 className="text-[28px] font-bold leading-tight">
              {type.title}
            </h1>
            <p className="mt-2 text-sm leading-6 text-foreground/85">
              {type.description}
            </p>
            <div
              data-testid="type-meta"
              className="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground lg:gap-x-0"
            >
              {meta.map((item, index) => (
                <span
                  key={item}
                  className="lg:border-r lg:px-3 lg:first:pl-0 lg:last:border-r-0"
                >
                  <span className="mr-2 lg:hidden" aria-hidden="true">
                    {index > 0 ? '·' : ''}
                  </span>
                  {item}
                </span>
              ))}
            </div>
          </div>
        </header>
        <div className="grid min-w-0 gap-7 lg:grid-cols-[minmax(0,1fr)_300px]">
          <aside className="order-1 min-w-0 space-y-4 lg:col-start-2 lg:row-start-1">
            <AtAGlance
              data={data}
              showModules={showModules}
              directions={directions}
            />
            <YourAssignments data={data} />
            <div className="hidden lg:block">
              <EarlierDocuments data={data} />
            </div>
          </aside>
          <main className="order-2 min-w-0 space-y-7 lg:col-start-1 lg:row-start-1">
            {library ? (
              <PromptLibraryV2
                corpus={corpus}
                library={library}
                assignmentTypeId={type.id}
                savedPromptTexts={data.savedPromptTexts ?? []}
                onAssign={assign}
                canAssign={data.teacherClasses.length > 0}
              />
            ) : ap ? (
              data.apHistoryLibrary && (
                <ApPromptsLibrary
                  entries={data.apHistoryLibrary.entries}
                  onSelectEntry={(entry) => {
                    setApEntry(entry);
                    setPrompt('');
                    setAssignmentOpen(true);
                  }}
                />
              )
            ) : (
              <>
                <section className="rounded-xl border bg-popover p-6">
                  <h2 className="text-lg font-semibold">
                    {exit
                      ? 'The prompt is composed for you'
                      : 'You write the prompt for this type'}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {exit
                      ? 'You never write the prompt yourself. Hit New assignment, answer the form, and the prompt students see is composed for you.'
                      : content.sparsePromptCopy}
                  </p>
                </section>
                {showModules && (
                  <section data-tour="type-modules">
                    <h2 className="text-xl font-bold">
                      How students move through it
                    </h2>
                    <p className="mb-4 mt-1 text-sm leading-6 text-muted-foreground">
                      {numberWord(modules.length)} modules, in order. Each
                      student works through them in their own document.
                    </p>
                    <ol className="divide-y">
                      {modules.map((m, index) => (
                        <li key={m.id} className="flex gap-5 py-5">
                          <span className="font-mono text-2xl text-primary">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <div>
                            <h3 className="text-sm font-semibold">{m.label}</h3>
                            {m.oneLiner && (
                              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                                {m.oneLiner}
                              </p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </section>
                )}
              </>
            )}
            {generator && (
              <section className="flex flex-col items-start gap-4 rounded-xl border border-dashed p-5 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <h2 className="text-sm font-semibold">Not finding it?</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Describe what you’re teaching and get three drafts in the
                    style of the library.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  className="shrink-0 rounded-full"
                  disabled={!menuProps.hasClasses}
                  onClick={() => setGeneratorOpen(true)}
                >
                  Generate a prompt
                </Button>
              </section>
            )}
            <div className="lg:hidden">
              <EarlierDocuments data={data} />
            </div>
          </main>
        </div>
      </div>
      {!assignmentOpen && !generatorOpen && custom === null && (
        <div
          data-testid="type-bottom-bar"
          className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t bg-background/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:hidden"
        >
          <div className="min-w-0 flex-1">
            <NewAssignment {...menuProps} mobile />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="shrink-0 rounded-full bg-popover"
            aria-label="Scroll to top"
            onClick={() =>
              scroller.current?.scrollTo({ top: 0, behavior: 'smooth' })
            }
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        </div>
      )}
      <CreateAssignmentSheet
        assignmentTypeAvailability={data.assignmentCreationAvailability}
        assignmentTypeId={type.id}
        assignmentTypeTitle={type.title}
        assignmentTypeKind={type.kind}
        assignmentTypeRubricName={type.rubric?.name ?? null}
        assignmentTypeCollaborationSupported={type.collaborationSupported}
        assignmentTypeGradesGrammar={data.assignmentTypeGradesGrammar}
        teacherClasses={data.teacherClasses}
        initialClassId={params.get('classId') ?? undefined}
        open={assignmentOpen}
        onOpenChange={setAssignmentOpen}
        initialPrompt={prompt}
        plannedExitTicket={plannedExitTicket}
        titleRequired={Boolean(data.thesisPromptLibrary)}
        apHistoryEntry={apEntry}
      />
      {data.thesisPromptLibrary ? (
        <ThesisPromptGenerator
          open={generatorOpen}
          onOpenChange={setGeneratorOpen}
          assignmentTypeId={type.id}
          onUsePrompt={(body) => {
            setGeneratorOpen(false);
            assign(body);
          }}
        />
      ) : data.promptLibrary ? (
        <DailyPagesPromptGenerator
          open={generatorOpen}
          onOpenChange={setGeneratorOpen}
          assignmentTypeId={type.id}
          onUsePrompt={(body) => {
            setGeneratorOpen(false);
            assign(body);
          }}
        />
      ) : null}
      {ap && (
        <CreateCustomApHistorySheet
          assignmentTypeId={type.id}
          teacherClasses={data.teacherClasses}
          open={custom !== null}
          onOpenChange={(open) => {
            if (!open) setCustom(null);
          }}
          essayType={custom ?? 'dbq'}
        />
      )}
    </div>
  );
}
