/**
 * The planner's intake, one decision per step (Brian's review, A1–A3).
 *
 * The first card bundled a grade, a reading scope and a period length into
 * each option, and started the slider at a 50 nobody had said. A teacher who
 * wanted the 11th-grade class and the whole story had no option for it. Here
 * every question is its own step and holds only one decision:
 *
 * 1. Which classes — checkboxes from the teacher's real class list. With only
 *    one class there is nothing to ask, so it is simply named.
 * 2. How long each one meets — a slider per class, unset until touched, or
 *    starting where the teacher left it last time.
 * 3. How to fill the time — the planner's own options for this content, as a
 *    single choice, plus "Something else".
 * 4. Activities, when the planner asked.
 *
 * The answers still leave as one ordinary message, with the summary of what
 * is about to be sent shown above the Send button, as before.
 */
import { useState } from 'react';
import { Button } from '~/components/ui/button';
import {
  BookOpen,
  ChevronRight,
  Clock,
  Flag,
  Hammer,
  ListChecks,
  Scale,
  Send,
  Shapes,
  Target,
  Users,
} from 'lucide-react';
import {
  composeIntakeReply,
  LESSON_ACTIVITIES,
  LESSON_BALANCES,
  NO_COMPANION,
  PLANNER_PICKS_COMPANION,
  UNIT_ENDINGS,
  LESSON_MINUTES_MAX,
  LESSON_MINUTES_MIN,
  LESSON_MINUTES_STEP,
  PLANNER_PICKS_ACTIVITIES,
  type LessonAsk,
} from '~/domain/lesson-planner/lesson-ask';
import { cn } from '~/utils/misc';

export type IntakeClass = {
  id: string;
  title: string;
  /** What the teacher set last time; null until they have. */
  periodMinutes: number | null;
};

type Step = 'classes' | 'minutes' | 'goal' | 'balance' | 'choose' | 'leads' | 'companion' | 'activities';

/** Where an untouched slider's thumb rests. Never sent: it is not a value. */
const UNSET_THUMB = Math.round((LESSON_MINUTES_MIN + LESSON_MINUTES_MAX) / 2);
const SOMETHING_ELSE = '__something-else__';
/** A minutes ask without a classes ask still needs somewhere to hang. */
const NO_CLASS = '__no-class__';

function describeMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

export function LessonIntakeCard({
  asks,
  teacherClasses,
  onSend,
  disabled,
  severalDays = false,
}: {
  asks: LessonAsk[];
  teacherClasses: IntakeClass[];
  onSend: (message: string) => void;
  disabled?: boolean;
  /** Planning a unit or several days: the length is each class period's (Kevin, Oct 25, note 1). */
  severalDays?: boolean;
}) {
  const asksClasses = asks.some((ask) => ask.kind === 'classes');
  const asksMinutes = asks.some((ask) => ask.kind === 'minutes');
  const chooseAsk = asks.find(
    (ask): ask is Extract<LessonAsk, { kind: 'choose' }> =>
      ask.kind === 'choose'
  );
  const asksActivities = asks.some((ask) => ask.kind === 'activities');
  // What the lesson is for (Kevin, Nov 26): each optional, and "Just build" skips them all.
  const goalAsk = asks.find((ask): ask is Extract<LessonAsk, { kind: 'goal' }> => ask.kind === 'goal');
  const asksBalance = asks.some((ask) => ask.kind === 'balance');
  const asksLeads = asks.some((ask) => ask.kind === 'leads');
  const companionAsk = asks.find((ask): ask is Extract<LessonAsk, { kind: 'companion' }> => ask.kind === 'companion');
  const asksPurpose = Boolean(goalAsk || asksBalance || asksLeads || companionAsk);

  const onlyClass =
    asksClasses && teacherClasses.length === 1 ? teacherClasses[0] : null;
  const [checked, setChecked] = useState<string[]>(
    onlyClass ? [onlyClass.id] : []
  );
  const [typedClass, setTypedClass] = useState('');
  const [minutesById, setMinutesById] = useState<Record<string, number | null>>(
    () =>
      Object.fromEntries(
        teacherClasses.map((klass) => [klass.id, klass.periodMinutes])
      )
  );
  const [choice, setChoice] = useState<string | null>(null);
  const [sameLesson, setSameLesson] = useState(true);
  const [otherText, setOtherText] = useState('');
  const [activityIds, setActivityIds] = useState<string[]>([]);
  const [goal, setGoal] = useState<string | null>(null);
  const [goalText, setGoalText] = useState('');
  const [balance, setBalance] = useState<string | null>(null);
  const [leads, setLeads] = useState<string | null>(null);
  const [companion, setCompanion] = useState<string | null>(null);

  const steps = [
    asksClasses ? 'classes' : null,
    asksMinutes ? 'minutes' : null,
    goalAsk ? 'goal' : null,
    asksBalance ? 'balance' : null,
    chooseAsk ? 'choose' : null,
    asksLeads ? 'leads' : null,
    companionAsk ? 'companion' : null,
    asksActivities ? 'activities' : null,
  ].filter(Boolean) as Step[];
  const [reached, setReached] = useState(0);
  const showing = (step: Step) => {
    const index = steps.indexOf(step);
    return index !== -1 && index <= reached;
  };
  const current = steps[reached];
  const onLastStep = reached >= steps.length - 1;

  // The classes this lesson is for, in the order the teacher's list has them.
  const typed = typedClass.trim();
  const chosenClasses: Array<{ id: string; title: string }> = asksClasses
    ? teacherClasses.length
      ? teacherClasses.filter((klass) => checked.includes(klass.id))
      : typed
        ? [{ id: NO_CLASS, title: typed }]
        : []
    : asksMinutes
      ? [{ id: NO_CLASS, title: '' }]
      : [];

  const lengthFor = (id: string) => minutesById[id] ?? null;
  const answered: Record<Step, boolean> = {
    classes: chosenClasses.length > 0,
    minutes: chosenClasses.every((klass) => lengthFor(klass.id) !== null),
    choose:
      choice !== null &&
      (choice !== SOMETHING_ELSE || otherText.trim().length > 0),
    activities: true,
    // What it is for may be left to the planner, except an empty "my own words".
    goal: goal !== SOMETHING_ELSE || goalText.trim().length > 0,
    balance: true,
    leads: true,
    companion: true,
  };
  const ready = steps.every((step) => answered[step]);

  const finalChoice =
    choice === SOMETHING_ELSE ? otherText.trim() || null : choice;
  const classLines = chosenClasses
    .filter((klass) => klass.title)
    .map((klass) => ({
      title: klass.title,
      minutes: asksMinutes ? lengthFor(klass.id) : null,
    }));
  // A length with no class to hang it on reads as the length alone.
  const looseMinutes =
    !asksClasses && asksMinutes ? lengthFor(NO_CLASS) : null;
  const finalGoal = goal === SOMETHING_ELSE ? goalText.trim() || null : goal;
  const compose = (justBuild: boolean) =>
    [
      looseMinutes !== null ? `${looseMinutes} minutes${severalDays ? ' each class period' : ''}.` : null,
      composeIntakeReply({
        severalDays,
        classes: classLines,
        choice: finalChoice,
        activityIds,
        sameLesson,
        goal: finalGoal,
        balance,
        leads,
        companion,
        justBuild,
        companionAsked: Boolean(companionAsk),
      }),
    ]
      .filter(Boolean)
      .join(' ')
      .trim();
  const message = compose(false);

  function toggleActivity(id: string) {
    setActivityIds((prev) => {
      if (prev.includes(id)) return prev.filter((other) => other !== id);
      if (id === PLANNER_PICKS_ACTIVITIES) return [id];
      return [...prev.filter((other) => other !== PLANNER_PICKS_ACTIVITIES), id];
    });
  }

  function send(justBuild = false) {
    // Each length the teacher set is real now, so the next lesson for that
    // class starts there. Fire and forget: the lesson matters more.
    if (asksMinutes) {
      for (const klass of chosenClasses) {
        const minutes = lengthFor(klass.id);
        if (klass.id === NO_CLASS || minutes === null) continue;
        void fetch('/api/domain/lesson-planner/class-length', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            classId: klass.id,
            minutes: String(minutes),
          }).toString(),
          keepalive: true,
        }).catch(() => undefined);
      }
    }
    onSend(justBuild ? compose(true) : message);
  }

  /** One row of single-choice chips, for the purpose steps. */
  const chips = (name: string, options: Array<{ id: string; label: string }>, value: string | null, set: (id: string) => void) => (
    <div role="radiogroup" className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const on = value === option.id;
        return (
          <label
            key={option.id}
            className={cn(
              'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition focus-within:ring-2 focus-within:ring-primary',
              on ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border hover:bg-foreground/[0.03]'
            )}
          >
            <input type="radio" name={name} checked={on} disabled={disabled} onChange={() => set(option.id)} className="sr-only" />
            {option.label}
          </label>
        );
      })}
    </div>
  );
  const stepHead = (Icon: typeof Target, text: string, optional = true) => (
    <div className="mb-2.5 flex items-center gap-2">
      <Icon size={15} className="shrink-0 text-primary" />
      <span className="text-sm font-medium">{text}</span>
      {optional ? <span className="ml-auto text-xs text-muted-foreground">Optional</span> : null}
    </div>
  );

  return (
    <div
      data-testid="lesson-intake-card"
      className="mt-3 overflow-hidden rounded-xl border border-primary/25 bg-primary/[0.03]"
    >
      {showing('classes') ? (
        <fieldset className="border-b border-primary/15 px-4 py-3.5">
          <legend className="sr-only">Which classes is this for?</legend>
          <div className="mb-2.5 flex items-center gap-2">
            <Users size={15} className="shrink-0 text-primary" />
            <span className="text-sm font-medium">
              {onlyClass ? 'Your class' : 'Which classes is this for?'}
            </span>
          </div>
          {onlyClass ? (
            <p data-testid="intake-only-class" className="text-sm">
              For {onlyClass.title}
            </p>
          ) : teacherClasses.length ? (
            <div className="flex flex-wrap gap-2">
              {teacherClasses.map((klass) => {
                const on = checked.includes(klass.id);
                return (
                  <label
                    key={klass.id}
                    className={cn(
                      'inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition focus-within:ring-2 focus-within:ring-primary',
                      on
                        ? 'border-primary bg-primary/10 font-medium text-primary'
                        : 'border-border hover:bg-foreground/[0.03]'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={disabled}
                      onChange={() =>
                        setChecked((prev) =>
                          on
                            ? prev.filter((other) => other !== klass.id)
                            : [...prev, klass.id]
                        )
                      }
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    {klass.title}
                  </label>
                );
              })}
            </div>
          ) : (
            <input
              data-testid="intake-class-text"
              aria-label="Which class is this for?"
              placeholder="e.g. my 11th grade section"
              value={typedClass}
              disabled={disabled}
              onChange={(event) => setTypedClass(event.target.value)}
              // Enter answers it, as it sends in the chat box (Kevin, Oct 24).
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
                event.preventDefault();
                if (onLastStep) {
                  if (!disabled && ready && message) send();
                } else if (!disabled && current && answered[current]) {
                  setReached((at) => Math.min(at + 1, steps.length - 1));
                }
              }}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
          )}
          {chosenClasses.length > 1 ? (
            // Two classes: the same lesson first, asked here once (Brian's run 4).
            <div role="radiogroup" aria-label="One lesson or one each" data-testid="intake-same-lesson" className="mt-3 flex flex-wrap gap-2">
              {[
                { same: true, label: chosenClasses.length === 2 ? 'The same lesson for both classes' : 'The same lesson for all of them' },
                { same: false, label: 'A version for each class' },
              ].map((option) => (
                <label
                  key={option.label}
                  className={cn(
                    'inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition focus-within:ring-2 focus-within:ring-primary',
                    sameLesson === option.same ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border hover:bg-foreground/[0.03]'
                  )}
                >
                  <input
                    type="radio"
                    name="intake-same-lesson"
                    checked={sameLesson === option.same}
                    disabled={disabled}
                    onChange={() => setSameLesson(option.same)}
                    className="h-4 w-4 accent-primary"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          ) : null}
        </fieldset>
      ) : null}

      {showing('minutes') ? (
        <div className="border-b border-primary/15 px-4 py-3.5">
          <div className="mb-3 flex items-center gap-2">
            <Clock size={15} className="shrink-0 text-primary" />
            <span className="text-sm font-medium">
              {severalDays
                ? chosenClasses.length > 1
                  ? 'How long is each class period, for each class?'
                  : 'How long is each class period?'
                : chosenClasses.length > 1
                  ? 'How long does each class meet?'
                  : 'How long is the lesson?'}
            </span>
          </div>
          <div className="flex flex-col gap-4">
            {chosenClasses.map((klass) => {
              const value = lengthFor(klass.id);
              const label = klass.title
                ? `Length for ${klass.title} in minutes`
                : 'Lesson length in minutes';
              return (
                <div key={klass.id}>
                  <div className="mb-1 flex items-center gap-2">
                    {klass.title ? (
                      <span className="text-sm">{klass.title}</span>
                    ) : null}
                    <span
                      data-testid="intake-length-value"
                      className={cn(
                        'ml-auto rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums',
                        value === null
                          ? 'bg-foreground/5 text-muted-foreground'
                          : 'bg-primary/10 text-primary'
                      )}
                    >
                      {value === null ? 'Set the length' : describeMinutes(value)}
                    </span>
                  </div>
                  <input
                    type="range"
                    aria-label={label}
                    aria-valuetext={
                      value === null ? 'Not set' : describeMinutes(value)
                    }
                    min={LESSON_MINUTES_MIN}
                    max={LESSON_MINUTES_MAX}
                    step={LESSON_MINUTES_STEP}
                    value={value ?? UNSET_THUMB}
                    disabled={disabled}
                    onChange={(event) =>
                      setMinutesById((prev) => ({
                        ...prev,
                        [klass.id]: Number(event.target.value),
                      }))
                    }
                    className={cn(
                      'w-full accent-primary',
                      value === null && 'opacity-40'
                    )}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
            <span>{LESSON_MINUTES_MIN} min</span>
            <span>{describeMinutes(LESSON_MINUTES_MAX)}</span>
          </div>
        </div>
      ) : null}

      {showing('goal') && goalAsk ? (
        <fieldset data-testid="intake-goal" className="border-b border-primary/15 px-4 py-3.5">
          <legend className="sr-only">If they leave with one thing, what is it?</legend>
          {stepHead(Target, 'If they leave with one thing, what is it?')}
          <div className="flex flex-col gap-1.5">
            {[...goalAsk.options, SOMETHING_ELSE].map((option) => {
              const on = goal === option;
              return (
                <label
                  key={option}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition focus-within:ring-2 focus-within:ring-primary',
                    on ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border hover:bg-foreground/[0.03]'
                  )}
                >
                  <input type="radio" name="intake-goal" checked={on} disabled={disabled} onChange={() => setGoal(option)} className="h-4 w-4 accent-primary" />
                  {option === SOMETHING_ELSE ? 'In my own words' : option}
                </label>
              );
            })}
            {goal === SOMETHING_ELSE ? (
              <input
                aria-label="The one thing, in your words"
                autoFocus
                value={goalText}
                disabled={disabled}
                onChange={(event) => setGoalText(event.target.value)}
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
              />
            ) : null}
          </div>
        </fieldset>
      ) : null}

      {showing('balance') ? (
        <fieldset data-testid="intake-balance" className="border-b border-primary/15 px-4 py-3.5">
          <legend className="sr-only">What should they do most?</legend>
          {stepHead(Scale, 'What should they do most?')}
          {chips('intake-balance', [...LESSON_BALANCES], balance, setBalance)}
        </fieldset>
      ) : null}

      {showing('choose') && chooseAsk ? (
        <fieldset className="border-b border-primary/15 px-4 py-3.5">
          <legend className="sr-only">How do you want to fill the time?</legend>
          <div className="mb-2.5 flex items-center gap-2">
            <ListChecks size={15} className="shrink-0 text-primary" />
            <span className="text-sm font-medium">
              How do you want to fill the time?
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {[...chooseAsk.options, SOMETHING_ELSE].map((option) => {
              const on = choice === option;
              return (
                <label
                  key={option}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition focus-within:ring-2 focus-within:ring-primary',
                    on
                      ? 'border-primary bg-primary/10 font-medium text-primary'
                      : 'border-border hover:bg-foreground/[0.03]'
                  )}
                >
                  <input
                    type="radio"
                    name="intake-choose"
                    checked={on}
                    disabled={disabled}
                    onChange={() => setChoice(option)}
                    className="h-4 w-4 accent-primary"
                  />
                  {option === SOMETHING_ELSE ? 'Something else' : option}
                </label>
              );
            })}
            {choice === SOMETHING_ELSE ? (
              <input
                aria-label="Something else"
                autoFocus
                value={otherText}
                disabled={disabled}
                onChange={(event) => setOtherText(event.target.value)}
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
              />
            ) : null}
          </div>
        </fieldset>
      ) : null}

      {showing('leads') ? (
        <fieldset data-testid="intake-leads" className="border-b border-primary/15 px-4 py-3.5">
          <legend className="sr-only">Where does it lead?</legend>
          {stepHead(Flag, 'Where does it lead?')}
          {chips('intake-leads', [...UNIT_ENDINGS], leads, setLeads)}
        </fieldset>
      ) : null}

      {showing('companion') && companionAsk ? (
        <fieldset data-testid="intake-companion" className="border-b border-primary/15 px-4 py-3.5">
          <legend className="sr-only">A companion text?</legend>
          {stepHead(BookOpen, 'A companion text?')}
          <div className="flex flex-col gap-1.5">
            {[...companionAsk.options, PLANNER_PICKS_COMPANION, NO_COMPANION].map((option) => {
              const on = companion === option;
              return (
                <label
                  key={option}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition focus-within:ring-2 focus-within:ring-primary',
                    on ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border hover:bg-foreground/[0.03]'
                  )}
                >
                  <input type="radio" name="intake-companion" checked={on} disabled={disabled} onChange={() => setCompanion(option)} className="h-4 w-4 accent-primary" />
                  {option === PLANNER_PICKS_COMPANION ? 'You choose' : option === NO_COMPANION ? 'No companion text' : option}
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {showing('activities') ? (
        <div className="px-4 py-3.5">
          <div className="mb-2.5 flex items-center gap-2">
            <Shapes size={15} className="shrink-0 text-primary" />
            <span className="text-sm font-medium">
              What kinds of activities do you want?
            </span>
            <span className="ml-auto text-xs text-muted-foreground">
              Optional
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              {
                id: PLANNER_PICKS_ACTIVITIES,
                label: 'You pick the ones that fit best',
              },
              ...LESSON_ACTIVITIES,
            ].map((activity) => {
              const on = activityIds.includes(activity.id);
              return (
                <label
                  key={activity.id}
                  className={cn(
                    'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition focus-within:ring-2 focus-within:ring-primary',
                    on
                      ? 'border-primary bg-primary/10 font-medium text-primary'
                      : 'border-border hover:bg-foreground/[0.03]'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={disabled}
                    onChange={() => toggleActivity(activity.id)}
                    className="sr-only"
                  />
                  {activity.label}
                </label>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-3 border-t border-primary/15 bg-primary/[0.04] px-4 py-2.5">
        <p
          data-testid="intake-summary"
          className="min-w-0 flex-1 text-xs text-muted-foreground"
        >
          {message || 'Answer each question to send.'}
        </p>
        {asksPurpose ? (
          <Button
            type="button"
            size="sm"
            variant="outline-primary"
            className="shrink-0"
            data-testid="lesson-ask-just-build"
            disabled={disabled}
            onClick={() => send(true)}
          >
            <Hammer size={13} />
            Just build
          </Button>
        ) : null}
        {onLastStep ? (
          <Button
            type="button"
            size="sm"
            className="shrink-0"
            data-testid="lesson-ask-send"
            disabled={disabled || !ready || !message}
            onClick={() => send()}
          >
            <Send size={13} />
            Send
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            className="shrink-0"
            data-testid="lesson-ask-next"
            disabled={disabled || !current || !answered[current]}
            onClick={() =>
              setReached((at) => Math.min(at + 1, steps.length - 1))
            }
          >
            Next
            <ChevronRight size={13} />
          </Button>
        )}
      </div>
    </div>
  );
}
