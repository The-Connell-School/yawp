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
import { cn } from '~/utils/misc';

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
    <section className="h-full w-full overflow-y-auto bg-[#F6F1EA]">
      <div data-testid="unit-view" className="mx-auto max-w-6xl px-4 pb-32 pt-6 sm:px-8">
        <nav aria-label="Breadcrumb" className="text-sm text-[#6E665C]">
          <Link to="/app/lesson-planner/library" className="font-medium text-[#A8482A] hover:underline">
            Library
          </Link>
          <span className="mx-2">/</span>
          <span>{unit.title}</span>
        </nav>
        <header className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-[#45403A]">
              <span aria-hidden className="h-2 w-2 rounded-full bg-[#3E9A84]" />
              {unit.kindLabel}
            </p>
            <h1 data-testid="unit-title" className="mt-1 text-4xl font-bold tracking-tight text-[#1C1A17]">
              {unit.title}
            </h1>
            <p className="mt-1 text-base text-[#6E665C]">{unit.line}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              data-testid="add-existing"
              className={cn(PILL, 'border-[#D9D1C5] bg-transparent hover:bg-[#EFE8DE]')}
              onClick={() => setAdding({ mode: 'existing', index: lessons.length })}
            >
              Add an existing lesson
            </Button>
            <Button data-testid="plan-another" className={cn(PILL, CORAL)} onClick={() => setAdding({ mode: 'plan', index: lessons.length })}>
              Plan another lesson
            </Button>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 min-[900px]:[grid-template-columns:320px_minmax(0,1fr)]">
          {/* One card, as in the design: the unit at a glance, then its contents. */}
          <aside data-testid="unit-sidebar" className="rounded-xl border border-[#E7DFD3] bg-[#FFFDF9] p-5">
            <h2 className="text-base font-bold text-[#1C1A17]">Unit at a glance</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-[#45403A]">Lessons</dt>
                <dd data-testid="unit-glance-lessons" className="text-lg font-bold text-[#1C1A17]">
                  {lessons.length}
                  {unit.drafts ? ` · ${unit.drafts} draft${unit.drafts === 1 ? '' : 's'}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[#45403A]">Writing</dt>
                <dd data-testid="unit-glance-writing" className="text-lg font-bold text-[#7B4FB0]">
                  {unit.writing.minutes} min · {unit.writing.percent}%
                </dd>
              </div>
            </dl>
            {lessons.length ? (
              <div data-testid="day-bars-box" className="mt-4 rounded-lg bg-[#F1EAF8] px-3 pb-2 pt-2.5">
                <p className="text-xs font-semibold text-[#5A3787]">Writing minutes, day by day</p>
                <DayBars lessons={lessons} selected={selected} onSelect={setSelected} />
              </div>
            ) : null}

            <h2 className="mt-5 text-sm font-bold text-[#1C1A17]">Contents</h2>
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
                      'flex w-full items-start gap-3 rounded-md px-2.5 py-2 text-left text-sm text-[#1C1A17] hover:bg-[#F1EBE2]',
                      index === selected && 'bg-[#EAE3D8]'
                    )}
                  >
                    <span className="w-11 shrink-0 pt-px text-xs font-semibold text-[#45403A]">Day {day.day}</span>
                    <span className="min-w-0 flex-1">{day.title}</span>
                    {!day.set ? <span className="shrink-0 pt-px text-xs font-semibold text-[#C2502E]">Draft</span> : null}
                  </button>
                  <InsertLine onClick={() => setAdding({ mode: 'plan', index: index + 1 })} label={`Add a lesson after Day ${day.day}`} />
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-[#6E665C]">Hover between two days and click + to add a lesson right there.</p>
            {unit.planningHref ? (
              <Link to={unit.planningHref} className="mt-2 block text-xs text-[#6E665C] hover:underline">
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
                {/* The day tabs sit on the lesson card, like folder tabs. */}
                <DayTabs lessons={lessons} selected={selected} onSelect={setSelected} />
                <Preview lesson={lesson} count={lessons.length} view={view} run={actions.run} />
              </div>
            ) : (
              <p className="rounded-xl border-2 border-dashed border-[#E7DFD3] p-10 text-center text-sm text-[#6E665C]">
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

/** The design's pill buttons, and its coral. */
const PILL = 'h-10 rounded-full px-4 text-sm font-semibold';
const CORAL = 'bg-[#D9714F] text-white hover:bg-[#C8603F]';

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

function DayBars({ lessons, selected, onSelect }: { lessons: Lesson[]; selected: number; onSelect: (index: number) => void }) {
  const most = Math.max(1, ...lessons.map((lesson) => lesson.run?.writingMinutes ?? 0));
  return (
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
            className={cn('min-w-[4px] max-w-[14px] flex-1 rounded-[2px]', index === selected ? 'bg-[#5A3787]' : 'bg-[#A584CF] hover:bg-[#8E68C2]')}
            style={{ height: `${Math.max(12, (minutes / most) * 100)}%` }}
          />
        );
      })}
    </div>
  );
}

function DayTabs({ lessons, selected, onSelect }: { lessons: Lesson[]; selected: number; onSelect: (index: number) => void }) {
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selected]);
  const scroll = (by: number) => strip.current?.scrollBy({ left: by * 72 * 4, behavior: 'smooth' });
  return (
    <div className="flex items-end gap-1">
      <button type="button" aria-label="Earlier days" onClick={() => scroll(-1)} className="mb-2 rounded-md p-0.5 text-[#45403A] hover:bg-[#EAE3D8]">
        <ChevronLeft size={16} />
      </button>
      <div ref={strip} role="tablist" aria-label="Days" data-testid="day-tabs" className="-mb-px flex min-w-0 flex-1 items-end gap-1 overflow-x-auto scroll-smooth">
        {lessons.map((lesson, index) => {
          const chosen = index === selected;
          return (
            <button
              key={lesson.id}
              type="button"
              role="tab"
              aria-selected={chosen}
              data-testid="day-tab"
              onClick={() => onSelect(index)}
              className={cn(
                'relative w-[68px] shrink-0 rounded-t-lg border border-[#E7DFD3] px-1 text-center text-[#1C1A17]',
                // The chosen tab joins the card: card white, no line between.
                chosen ? 'z-10 border-b-[#FFFDF9] bg-[#FFFDF9] pb-2.5 pt-2' : 'bg-[#EFE8DE] py-1.5 hover:bg-[#E7DFD3]',
                !lesson.set && !chosen && 'border-dashed'
              )}
            >
              <span className="block text-xs font-bold">Day {lesson.day}</span>
              <span className="block text-[11px] text-[#6E665C]">{lesson.date ?? ' '}</span>
            </button>
          );
        })}
      </div>
      <button type="button" aria-label="Later days" onClick={() => scroll(1)} className="mb-2 rounded-md p-0.5 text-[#45403A] hover:bg-[#EAE3D8]">
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
    <article role="tabpanel" data-testid="lesson-preview" className="rounded-xl border border-[#E7DFD3] bg-[#FFFDF9] p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p data-testid="preview-day" className="text-sm text-[#45403A]">
            {/* A date only when the teacher set one (Brian's round 3, 1.10). */}
            Day {lesson.day} of {count}
            {lesson.date ? ` · ${lesson.date}` : ''}
          </p>
          <h2 data-testid="preview-title" className="mt-1 text-2xl font-bold text-[#1C1A17]">
            {lesson.title}
          </h2>
          <span data-testid="preview-status" className="mt-2 inline-block rounded bg-[#EAE3D8] px-1.5 py-0.5 text-xs font-semibold text-[#45403A]">
            {lesson.set ? 'Set' : 'Draft'}
          </span>
        </div>
        {lesson.empty ? (
          <Button asChild data-testid="preview-open" className={cn(PILL, CORAL)}>
            <Link to={lesson.planHref}>Start planning</Link>
          </Button>
        ) : (
          // The design's one button is two, the deck and the stack (Brian's round 3, 1.11).
          <div className="flex flex-wrap gap-2">
            {lesson.deckHref ? (
              <Button asChild variant="outline" data-testid="preview-open-deck" className={cn(PILL, 'border-[#D9D1C5] bg-transparent hover:bg-[#EFE8DE]')}>
                <Link to={lesson.deckHref}>Open slide deck</Link>
              </Button>
            ) : (
              <Button variant="outline" disabled title="No slides yet" data-testid="preview-open-deck" className={cn(PILL, 'border-[#D9D1C5] bg-transparent')}>
                Open slide deck
              </Button>
            )}
            <Button asChild data-testid="preview-open" className={cn(PILL, CORAL)}>
              <Link to={lesson.stackHref}>Open the stack</Link>
            </Button>
          </div>
        )}
      </div>

      {r && r.steps.length ? (
        <>
          <div className="mt-5" data-testid="preview-time-bar">
            {/* Each step in its own color; a purple line under the writing. */}
            <div className="flex gap-[3px]">
              {r.steps.map((step) => (
                <span key={step.id} className="min-w-[6px]" style={{ width: `${(step.minutes / span) * 100}%` }}>
                  <span data-testid="preview-segment" className="block h-3.5 rounded-sm" style={{ backgroundColor: STEP_TYPE_COLORS[step.type].accent }} />
                  {step.isWriting ? <span data-testid="preview-writing-line" className="mt-[3px] block h-[3px] rounded-full bg-[#7B4FB0]" /> : null}
                </span>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm">
              <span className="text-[#45403A]">
                {total}
                {r.period ? ` of ${r.period}` : ''} min · {r.status.charAt(0).toLowerCase() + r.status.slice(1)}
              </span>
              <span className="font-semibold text-[#7B4FB0]">
                {r.writingPercent}% writing · {r.writingMinutes} min
              </span>
            </div>
          </div>
          <ol data-testid="preview-run" className="mt-4 divide-y divide-[#E7DFD3] rounded-lg border border-[#E7DFD3]">
            {r.steps.map((step) => (
              <li key={step.id} className="flex items-center gap-3 px-3.5 py-2.5 text-sm text-[#1C1A17]">
                <span className="w-8 shrink-0 text-xs tabular-nums text-[#45403A]">{step.startsAt}′</span>
                <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: STEP_TYPE_COLORS[step.type].tint, color: STEP_TYPE_COLORS[step.type].text }}>
                  {step.chip}
                </span>
                <span className="min-w-0 flex-1 truncate">{step.title}</span>
                {step.isWriting ? <span className="rounded-full bg-[#7B4FB0] px-2 py-0.5 text-[11px] font-semibold text-white">Writing</span> : null}
                <span className="w-14 shrink-0 text-right tabular-nums text-[#45403A]">{step.minutes} min</span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p data-testid="preview-empty" className="mt-5 rounded-lg border-2 border-dashed border-[#E7DFD3] p-8 text-center text-sm text-[#6E665C]">
          Nothing planned for this day yet. Start planning and the run of show shows here.
        </p>
      )}

      <footer className="mt-5 flex flex-wrap items-center gap-2 border-t border-[#E7DFD3] pt-4">
        <Button asChild variant="outline" className="h-9 rounded-full border-[#D9D1C5] bg-transparent px-3.5 text-sm font-semibold hover:bg-[#EFE8DE]">
          <Link to={lesson.planHref}>Rework in the planner</Link>
        </Button>
        <Button variant="ghost" data-testid="preview-duplicate" className="h-9 px-3 text-sm font-semibold" onClick={() => run({ intent: 'duplicate-lesson', conversationId: lesson.id })}>
          Duplicate
        </Button>
        <LessonRename conversationId={lesson.id} title={lesson.title} originalTitle={lesson.originalTitle}>
          {null}
        </LessonRename>
        <span className="flex-1" />
        <select
          aria-label={`Move ${lesson.title} to another unit`}
          data-testid="preview-move"
          value=""
          onChange={(event) => run({ intent: 'move-lesson', conversationId: lesson.id, unitId: event.target.value === 'out' ? '' : event.target.value })}
          className="h-10 min-w-[220px] rounded-md border border-[#D9D1C5] bg-[#F1EBE2] px-3 text-sm text-[#45403A]"
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
    <div data-testid="add-panel" className="rounded-2xl border-2 border-[#D9714F] bg-card p-4">
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
    <details data-testid="unit-plan" open={unbuilt > 0} className="rounded-2xl border bg-card p-4">
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
