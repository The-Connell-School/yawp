/**
 * A unit, opened (Oct 24 handoff, Part 2, L2): the unit at a glance and its
 * contents on the left; the day tabs and the chosen lesson's preview on the
 * right. A lesson can go in anywhere; the days after it move down one.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, redirect, useLoaderData, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { getLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';
import { getLessonPlannerReviewFlags } from '~/domain/feature-flags/feature-flags.server';
import { loadUnitView, type UnitView } from '~/domain/lesson-planner/load-library-v2.server';
import { insertLine, insertOptions } from '~/domain/lesson-planner/library-v2';
import { STEP_TYPE_COLORS } from '~/domain/lesson-planner/step-types';
import { LessonRename } from '~/components/lesson-planner/lesson-rename';
import { UndoBar, useLibraryAction } from '~/components/lesson-planner/library-actions';
import { KindLabel } from '../app.lesson-planner_.library/library-home';
import { cn } from '~/utils/misc';

/**
 * The look of the Claude Design mockup (Brian's round 5, item 2): white cards
 * on the cream page, the accent for actions, purple only for writing.
 */
const CARD = 'rounded-2xl border border-[#E4DCCF] bg-popover shadow-[0_1px_2px_rgba(28,26,23,.06),0_4px_12px_-4px_rgba(28,26,23,.10)]';
const ACCENT = '#D9714F';
const PILL = 'inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';
const PILL_FILLED = `${PILL} bg-[#D9714F] text-white hover:bg-[#C8603F]`;
const PILL_OUTLINE = `${PILL} border border-[#D5CABA] bg-popover text-foreground hover:bg-[#F1EBE2]`;

export const meta: MetaFunction<typeof loader> = ({ data }) => [{ title: `${data?.unit.title ?? 'Unit'} · Yawp!` }];

export async function loader({ request, params }: LoaderFunctionArgs) {
  const access = await getLessonPlannerAccess(request);
  if (!access.allowed) throw redirect('/app');
  const flags = await getLessonPlannerReviewFlags(access.membership.organization.id);
  if (!flags.libraryV2) throw redirect('/app/lesson-planner/library');
  const view = await loadUnitView(
    { membershipId: access.membership.id, organizationId: access.membership.organization.id },
    params.unitId!,
    flags.stackV2
  );
  if (!view) throw new Response('Not Found', { status: 404 });
  return view;
}

type Lesson = UnitView['lessons'][number];
type Adding = { mode: 'plan' | 'existing'; index: number };

export default function UnitRoute() {
  const view = useLoaderData<typeof loader>();
  const { unit, lessons } = view;
  const [selected, setSelected] = useState(0);
  const [adding, setAdding] = useState<Adding | null>(null);
  const actions = useLibraryAction();
  const lesson = lessons[Math.min(selected, lessons.length - 1)] ?? null;

  // An insert selects the new day.
  useEffect(() => {
    if (actions.answer?.day) setSelected(actions.answer.day - 1);
  }, [actions.answer]);

  return (
    <section className="h-full w-full overflow-y-auto">
      <div data-testid="unit-view" className="mx-auto max-w-6xl px-4 pb-32 pt-6 sm:px-8">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link to="/app/lesson-planner/library" className="font-medium hover:underline" style={{ color: ACCENT }}>
            Library
          </Link>
          <span className="mx-2">/</span>
          <span>{unit.title}</span>
        </nav>
        <header className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <KindLabel kind={unit.kind} label={unit.kindLabel} />
            <h1 data-testid="unit-title" className="mt-2 text-4xl font-bold tracking-tight">
              {unit.title}
            </h1>
            <p className="mt-1 text-base text-muted-foreground">{unit.line}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={PILL_OUTLINE} data-testid="add-existing" onClick={() => setAdding({ mode: 'existing', index: lessons.length })}>
              Add an existing lesson
            </button>
            <button type="button" className={PILL_FILLED} data-testid="plan-another" onClick={() => setAdding({ mode: 'plan', index: lessons.length })}>
              Plan another lesson
            </button>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 min-[900px]:[grid-template-columns:320px_minmax(0,1fr)]">
          <aside className={cn(CARD, 'p-5')}>
            <h2 className="text-base font-semibold">Unit at a glance</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-muted-foreground">Lessons</dt>
                <dd data-testid="unit-glance-lessons" className="text-lg font-bold tabular-nums">
                  {lessons.length}
                  {unit.drafts ? ` · ${unit.drafts} draft${unit.drafts === 1 ? '' : 's'}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Writing</dt>
                <dd data-testid="unit-glance-writing" className="text-lg font-bold tabular-nums text-[#7B4FB0]">
                  {unit.writing.minutes} min · {unit.writing.percent}%
                </dd>
              </div>
            </dl>
            <DayBars lessons={lessons} selected={selected} onSelect={setSelected} />

            <h2 className="mt-5 text-base font-semibold">Contents</h2>
            <ol data-testid="unit-contents" className="mt-2">
              <InsertLine onClick={() => setAdding({ mode: 'plan', index: 0 })} label="Add a lesson at the start" />
              {lessons.map((day, index) => (
                <li key={day.id}>
                  <button
                    type="button"
                    data-testid="contents-row"
                    aria-current={index === selected ? 'true' : undefined}
                    onClick={() => setSelected(index)}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-[#F1EBE2]',
                      index === selected && 'bg-[#E9E2D6] hover:bg-[#E9E2D6]'
                    )}
                  >
                    <span className="w-12 shrink-0 pt-px text-xs font-medium text-muted-foreground">Day {day.day}</span>
                    <span className="min-w-0 flex-1 leading-snug">{day.title}</span>
                    {!day.set ? (
                      <span className="shrink-0 pt-px text-xs font-semibold" style={{ color: ACCENT }}>
                        Draft
                      </span>
                    ) : null}
                  </button>
                  <InsertLine onClick={() => setAdding({ mode: 'plan', index: index + 1 })} label={`Add a lesson after Day ${day.day}`} />
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-muted-foreground">Hover between two days and click + to add a lesson right there.</p>
            {unit.planningHref ? (
              <Link to={unit.planningHref} className="mt-2 block text-xs text-muted-foreground hover:underline">
                The chat that planned this unit
              </Link>
            ) : null}
          </aside>

          <div className="min-w-0 space-y-4">
            {unit.plan ? <UnitPlan plan={unit.plan} planningHref={unit.planningHref} /> : null}
            {adding ? (
              <AddPanel
                view={view}
                adding={adding}
                onChange={setAdding}
                onDone={(fields, open) => {
                  actions.run(fields, { open });
                  setAdding(null);
                }}
              />
            ) : null}
            {lesson ? (
              <div>
                {lessons.length ? <DayTabs lessons={lessons} selected={selected} onSelect={setSelected} /> : null}
                <Preview lesson={lesson} count={lessons.length} view={view} run={actions.run} />
              </div>
            ) : (
              <p className={cn(CARD, 'border-dashed p-10 text-center text-sm text-muted-foreground shadow-none')}>
                No lessons in this unit yet. Plan one, or add one you have.
              </p>
            )}
          </div>
        </div>
      </div>
      <UndoBar status={actions.status} onUndo={actions.undo} onDismiss={actions.dismiss} />
    </section>
  );
}

function InsertLine({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <div className="group relative h-1.5">
      <button
        type="button"
        aria-label={label}
        data-testid="insert-here"
        onClick={onClick}
        className="absolute inset-x-0 -top-1.5 z-10 flex h-4 items-center opacity-0 transition focus:opacity-100 group-hover:opacity-100"
      >
        <span className="h-0.5 flex-1 bg-[#D9714F]" />
        <span className="mx-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#D9714F] text-white">
          <Plus size={11} />
        </span>
        <span className="h-0.5 flex-1 bg-[#D9714F]" />
      </button>
    </div>
  );
}

/** "Writing minutes, day by day": the bars in a lavender panel, the chosen day darker. */
function DayBars({ lessons, selected, onSelect }: { lessons: Lesson[]; selected: number; onSelect: (index: number) => void }) {
  const most = Math.max(1, ...lessons.map((lesson) => lesson.run?.writingMinutes ?? 0));
  if (!lessons.length) return null;
  return (
    <div className="mt-4 rounded-xl bg-[#F1EBF8] px-3 pb-2 pt-2.5">
      <p className="text-xs font-semibold text-[#5A3787]">Writing minutes, day by day</p>
      <div data-testid="day-bars" className="mt-2 flex h-12 items-end gap-[3px]" aria-label="Writing minutes by day">
        {lessons.map((lesson, index) => {
          const minutes = lesson.run?.writingMinutes ?? 0;
          return (
            <button
              key={lesson.id}
              type="button"
              title={`Day ${lesson.day}: ${minutes} min writing`}
              aria-label={`Day ${lesson.day}: ${minutes} minutes of writing`}
              onClick={() => onSelect(index)}
              className={cn('min-w-[4px] flex-1 rounded-[2px] transition', index === selected ? 'bg-[#5A3787]' : 'bg-[#A88BD3] hover:bg-[#8F6CC4]')}
              style={{ height: `${Math.max(8, (minutes / most) * 100)}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Day tabs joined to the lesson card below them, like folder tabs. */
function DayTabs({ lessons, selected, onSelect }: { lessons: Lesson[]; selected: number; onSelect: (index: number) => void }) {
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selected]);
  const scroll = (by: number) => strip.current?.scrollBy({ left: by * 72 * 4, behavior: 'smooth' });
  return (
    <div className="flex items-end gap-1">
      <button type="button" aria-label="Earlier days" onClick={() => scroll(-1)} className="mb-2 rounded-md p-0.5 text-muted-foreground hover:bg-foreground/5">
        <ChevronLeft size={16} />
      </button>
      <div ref={strip} role="tablist" aria-label="Days" data-testid="day-tabs" className="-mb-px flex min-w-0 flex-1 gap-1 overflow-x-auto scroll-smooth">
        {lessons.map((lesson, index) => (
          <button
            key={lesson.id}
            type="button"
            role="tab"
            aria-selected={index === selected}
            data-testid="day-tab"
            onClick={() => onSelect(index)}
            className={cn(
              'relative w-[68px] shrink-0 rounded-t-lg border border-b-0 px-1 pb-2 pt-1.5 text-center transition',
              index === selected
                ? 'z-10 border-[#E4DCCF] bg-popover pt-2.5'
                : 'mt-1 border-transparent bg-[#EDE6DA] hover:bg-[#E5DDCF]',
              !lesson.set && index !== selected && 'border-dashed border-[#D5CABA]'
            )}
          >
            <span className="block text-xs font-bold">Day {lesson.day}</span>
            <span className="block text-[11px] text-muted-foreground">{lesson.date ?? '\u00A0'}</span>
          </button>
        ))}
      </div>
      <button type="button" aria-label="Later days" onClick={() => scroll(1)} className="mb-2 rounded-md p-0.5 text-muted-foreground hover:bg-foreground/5">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

function Preview({
  lesson,
  count,
  view,
  run,
}: {
  lesson: Lesson;
  count: number;
  view: UnitView;
  run: ReturnType<typeof useLibraryAction>['run'];
}) {
  const r = lesson.run;
  const total = r?.total ?? 0;
  const span = Math.max(total, r?.period ?? 0, 1);
  return (
    <article role="tabpanel" data-testid="lesson-preview" className={cn(CARD, 'relative p-6')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p data-testid="preview-day" className="text-sm text-muted-foreground">
            {/* A date only when the teacher set one (Brian's round 3, 1.10). */}
            Day {lesson.day} of {count}
            {lesson.date ? ` · ${lesson.date}` : ''}
          </p>
          <h2 data-testid="preview-title" className="mt-1 text-2xl font-bold tracking-tight">
            {lesson.title}
          </h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', lesson.set ? 'bg-[#E9E2D6]' : 'border border-dashed border-[#D5CABA]')}>
              {lesson.set ? 'Set' : 'Draft'}
            </span>
            {r?.hasHandouts ? <span className="rounded-md border border-[#E4DCCF] px-2 py-0.5 text-xs font-medium">Has handouts</span> : null}
          </div>
        </div>
        {lesson.empty ? (
          <Link to={lesson.planHref} data-testid="preview-open" className={PILL_FILLED}>
            Start planning
          </Link>
        ) : (
          // The deck and the stack, each one click away (Brian's round 3, 1.11).
          <div className="flex flex-wrap gap-2">
            {lesson.deckHref ? (
              <Link to={lesson.deckHref} data-testid="preview-open-deck" className={PILL_OUTLINE}>
                Open slide deck
              </Link>
            ) : (
              <button type="button" disabled title="No slides yet" data-testid="preview-open-deck" className={PILL_OUTLINE}>
                Open slide deck
              </button>
            )}
            <Link to={lesson.stackHref} data-testid="preview-open" className={PILL_FILLED}>
              Open the stack
            </Link>
          </div>
        )}
      </div>

      {r && r.steps.length ? (
        <>
          <div className="mt-5" data-testid="preview-time-bar">
            {/* The run of show as one thin bar: each step in its type's color,
                writing underlined in purple. */}
            <div className="flex gap-[3px]">
              {r.steps.map((step) => (
                <span key={step.id} className="flex flex-col gap-[3px]" style={{ width: `${(step.minutes / span) * 100}%` }}>
                  <span className="h-3 rounded-[3px]" style={{ backgroundColor: STEP_TYPE_COLORS[step.type].accent }} />
                  <span className="h-[3px] rounded-full" style={{ backgroundColor: step.isWriting ? '#7B4FB0' : 'transparent' }} />
                </span>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                {total}
                {r.period ? ` of ${r.period}` : ''} min · {r.status.charAt(0).toLowerCase() + r.status.slice(1)}
              </span>
              <span className="font-semibold text-[#7B4FB0]">
                {r.writingPercent}% writing · {r.writingMinutes} min
              </span>
            </div>
          </div>
          <ol data-testid="preview-run" className="mt-4 divide-y divide-[#EDE6DA] rounded-xl border border-[#E4DCCF]">
            {r.steps.map((step) => (
              <li key={step.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="w-8 shrink-0 text-xs tabular-nums text-muted-foreground">{step.startsAt}′</span>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{ backgroundColor: STEP_TYPE_COLORS[step.type].tint, color: STEP_TYPE_COLORS[step.type].text }}
                >
                  {step.chip}
                </span>
                <span className="min-w-0 flex-1 truncate">{step.title}</span>
                {step.isWriting ? (
                  <span className="shrink-0 rounded-md bg-[#7B4FB0] px-1.5 py-0.5 text-[11px] font-semibold text-white">Writing</span>
                ) : null}
                <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground">{step.minutes} min</span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p data-testid="preview-empty" className="mt-5 rounded-xl border-2 border-dashed border-[#E4DCCF] p-8 text-center text-sm text-muted-foreground">
          Nothing planned for this day yet. Start planning and the run of show shows here.
        </p>
      )}

      <footer className="mt-6 flex flex-wrap items-center gap-2 border-t border-[#EDE6DA] pt-4">
        <Link to={lesson.planHref} className={cn(PILL_OUTLINE, 'py-1.5')}>
          Rework in the planner
        </Link>
        <button
          type="button"
          data-testid="preview-duplicate"
          onClick={() => run({ intent: 'duplicate-lesson', conversationId: lesson.id })}
          className="rounded-full px-3 py-1.5 text-sm font-semibold hover:bg-[#F1EBE2]"
        >
          Duplicate
        </button>
        <LessonRename conversationId={lesson.id} title={lesson.title} originalTitle={lesson.originalTitle}>
          {null}
        </LessonRename>
        <span className="flex-1" />
        <select
          aria-label={`Move ${lesson.title} to another unit`}
          data-testid="preview-move"
          value=""
          onChange={(event) => run({ intent: 'move-lesson', conversationId: lesson.id, unitId: event.target.value === 'out' ? '' : event.target.value })}
          className="min-w-[13rem] rounded-lg border border-[#E4DCCF] bg-[#F1EBE2] px-3 py-2 text-sm text-muted-foreground"
        >
          <option value="" disabled>
            Move to another unit…
          </option>
          {view.otherUnits.map((other) => (
            <option key={other.id} value={other.id}>
              {other.course ? `${other.course} · ` : ''}
              {other.title}
            </option>
          ))}
          <option value="out">Take it out of the unit</option>
        </select>
      </footer>
    </article>
  );
}

function AddPanel({
  view,
  adding,
  onChange,
  onDone,
}: {
  view: UnitView;
  adding: Adding;
  onChange: (adding: Adding | null) => void;
  onDone: (fields: Record<string, string | number>, open: boolean) => void;
}) {
  const [lessonId, setLessonId] = useState(view.loose[0]?.id ?? '');
  const options = insertOptions(view.lessons);
  return (
    <div data-testid="add-panel" className="rounded-2xl border-2 border-[#D9714F] bg-popover p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold">{adding.mode === 'plan' ? 'Plan another lesson' : 'Add an existing lesson'}</p>
        <span className="flex-1" />
        <button
          type="button"
          className="text-xs font-semibold text-muted-foreground hover:underline"
          onClick={() => onChange({ ...adding, mode: adding.mode === 'plan' ? 'existing' : 'plan' })}
        >
          {adding.mode === 'plan' ? 'Add one you have instead' : 'Plan a new one instead'}
        </button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Where it goes</span>
          <select
            data-testid="add-where"
            value={adding.index}
            onChange={(event) => onChange({ ...adding, index: Number(event.target.value) })}
            className="w-full rounded-md border bg-background px-2 py-2"
          >
            {options.map((option) => (
              <option key={option.index} value={option.index}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {adding.mode === 'existing' ? (
          <label className="space-y-1 text-sm">
            <span className="font-medium">Lesson</span>
            <select data-testid="add-lesson" value={lessonId} onChange={(event) => setLessonId(event.target.value)} className="w-full rounded-md border bg-background px-2 py-2">
              {view.loose.length ? null : <option value="">No lessons on their own</option>}
              {view.loose.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>
                  {lesson.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <p data-testid="add-result" className="mt-3 text-sm text-muted-foreground">
        {insertLine(adding.index, view.lessons.length)}
      </p>
      <div className="mt-3 flex gap-2">
        {adding.mode === 'plan' ? (
          <Button data-testid="add-start" onClick={() => onDone({ intent: 'plan-lesson', unitId: view.unit.id, index: adding.index }, true)}>
            Start planning
          </Button>
        ) : (
          <Button
            data-testid="add-to-unit"
            disabled={!lessonId}
            onClick={() => onDone({ intent: 'move-lesson', conversationId: lessonId, unitId: view.unit.id, index: adding.index }, false)}
          >
            Add to unit
          </Button>
        )}
        <Button variant="ghost" onClick={() => onChange(null)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * The arc the planner wrote, kept with the unit (Kevin, Oct 25, note 4): how
 * it ends, and every planned day, built or not. A day not built yet has
 * Build this day, which builds it from the unit's planning chat.
 */
function UnitPlan({ plan, planningHref }: { plan: NonNullable<UnitView['unit']['plan']>; planningHref: string | null }) {
  const unbuilt = plan.days.filter((day) => day.buildHref).length;
  return (
    <details data-testid="unit-plan" open={unbuilt > 0} className={cn(CARD, 'p-4')}>
      <summary className="cursor-pointer select-none">
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">The unit plan</span>
        <span className="ml-2 text-xs text-muted-foreground">
          {plan.days.length} days planned{unbuilt ? ` · ${unbuilt} not built yet` : ''}
        </span>
      </summary>
      {plan.endsWith ? (
        <p className="mt-3 text-sm">
          <span className="font-semibold">Ends with:</span> {plan.endsWith}
        </p>
      ) : null}
      <ol className="mt-3 divide-y">
        {plan.days.map((day) => (
          <li key={day.day} data-testid="unit-plan-day" className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2 text-sm">
            <span className="w-12 shrink-0 text-muted-foreground">Day {day.day}</span>
            <span className="min-w-0 flex-1">
              <span className="font-medium">{day.title}</span>
              <span className="block text-xs text-muted-foreground">{day.objective}</span>
            </span>
            {day.builtHref ? (
              <Link to={day.builtHref} className="text-xs font-semibold text-primary hover:underline">
                Open
              </Link>
            ) : day.buildHref ? (
              <Link to={day.buildHref} data-testid="unit-plan-build" className="text-xs font-semibold text-primary hover:underline">
                Build this day
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
      {planningHref ? (
        <Link to={planningHref} className="mt-2 block text-xs text-muted-foreground hover:underline">
          Change the plan in the chat that planned it
        </Link>
      ) : null}
    </details>
  );
}
