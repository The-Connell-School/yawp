import { ChevronLeft, CircleAlert, Loader2 } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { useRevalidator } from 'react-router';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { cn } from '~/utils/misc';
import { useDevPanel } from './dev-panel-provider';
import { CLASS_SIMULATION_MAX_STUDENTS } from './class-simulation-mix';

function useMedia(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

type TeacherClass = {
  id: string;
  title: string;
  code: string;
  schoolYear: string;
  simulatedStudentCount?: number;
};

export function DevPanelClassSimulationFlyout({
  onClose,
  pushed,
}: {
  onClose: () => void;
  pushed?: boolean;
}) {
  const { state, updateForms, flyoutSwitchInstant } = useDevPanel();
  const revalidator = useRevalidator();
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [classesState, setClassesState] = useState<
    'idle' | 'loading' | 'empty' | 'error'
  >('loading');
  const [busy, setBusy] = useState<'populate' | 'clear' | null>(null);
  const [error, setError] = useState('');
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const classId = state.forms.simulationClassId ?? '';
  const studentCount = state.forms.simulationStudentCount ?? 20;
  const countId = useId();
  const isPhone = useMedia('(max-width: 639px)');

  useEffect(() => {
    if (state.subSheet !== 'class-simulation') return;
    setClassesState('loading');
    void fetch('/api/dev-panel/teacher-classes', { credentials: 'same-origin' })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          setClassesState('error');
          return;
        }
        const list = (data.classes ?? []) as TeacherClass[];
        setClasses(list);
        setClassesState(list.length ? 'idle' : 'empty');
        const storedId = state.forms.simulationClassId;
        const storedValid = storedId && list.some((entry) => entry.id === storedId);
        if (storedValid) return;
        if (list[0]) {
          updateForms({ simulationClassId: list[0].id });
        } else if (storedId) {
          updateForms({ simulationClassId: null });
        }
      })
      .catch(() => setClassesState('error'));
  }, [state.subSheet, state.forms.simulationClassId, updateForms]);

  const selectedClass = classes.find((entry) => entry.id === classId) ?? null;
  const simulatedCount = selectedClass?.simulatedStudentCount ?? 0;

  const run = async (intent: 'populate' | 'clear') => {
    if (!classId) return;
    setBusy(intent);
    setError('');
    try {
      const body =
        intent === 'populate'
          ? { intent, classId, studentCount }
          : { intent, classId };
      const response = await fetch('/api/dev-panel/class-simulation', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setError(result?.error ?? 'Something went wrong.');
        setBusy(null);
        return;
      }
      toast.success(result?.message ?? 'Done.', {
        className: 'yawp-dev-panel-jump-toast',
      });
      revalidator.revalidate();
      if (intent === 'populate' && typeof result?.counts?.students === 'number') {
        setClasses((prev) =>
          prev.map((entry) =>
            entry.id === classId
              ? { ...entry, simulatedStudentCount: result.counts.students }
              : entry
          )
        );
      }
      if (intent === 'clear') {
        setClasses((prev) =>
          prev.map((entry) =>
            entry.id === classId ? { ...entry, simulatedStudentCount: 0 } : entry
          )
        );
      }
      setBusy(null);
    } catch {
      setError('Could not reach the server.');
      setBusy(null);
    }
  };

  const loading = busy !== null;
  const populateDisabled = loading || !classId || classesState === 'empty';
  const clearDisabled =
    loading || !classId || classesState === 'empty' || simulatedCount === 0;

  const clearConfirmLabel = useMemo(() => {
    const n = simulatedCount;
    return n === 1
      ? 'Clear 1 fake student and their work?'
      : `Clear ${n} fake students and their work?`;
  }, [simulatedCount]);

  return (
    <div
      data-yawp-dev-panel-flyout
      data-instant={flyoutSwitchInstant ? 'true' : undefined}
      className={cn(
        'flex flex-col bg-background',
        pushed
          ? cn(
              'z-20 flex flex-col bg-background',
              isPhone ? 'relative min-h-full' : 'absolute inset-0'
            )
          : 'absolute inset-y-0 right-full z-10 w-[var(--yawp-dev-panel-width)] border-r shadow-lg'
      )}
      role="dialog"
      aria-label="Class simulation"
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        {pushed ? (
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            <ChevronLeft className="size-4" aria-hidden="true" />
            Back
          </Button>
        ) : null}
        <h2 className="flex-1 text-sm font-semibold">Class simulation</h2>
        {!pushed ? (
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        ) : null}
      </div>
      <div
        className={cn(
          'flex-1 space-y-4 overflow-y-auto p-3',
          loading && 'pointer-events-none opacity-50'
        )}
      >
        {classesState === 'loading' ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading your classes…
          </p>
        ) : null}
        {classesState === 'empty' ? (
          <p className="text-sm text-muted-foreground">
            You don&apos;t own any classes yet.
          </p>
        ) : null}
        {classesState === 'error' ? (
          <p role="alert" className="text-sm text-destructive">
            Could not load classes. Try again.
          </p>
        ) : null}
        {classesState === 'idle' && classes.length > 0 ? (
          <>
            <div className="space-y-1">
              <Label htmlFor="dev-panel-simulation-class">Class</Label>
              <select
                id="dev-panel-simulation-class"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={classId}
                disabled={loading}
                onChange={(event) =>
                  updateForms({ simulationClassId: event.target.value })
                }
              >
                {classes.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.title} ({entry.code})
                  </option>
                ))}
              </select>
              {selectedClass ? (
                <p className="text-xs text-muted-foreground">
                  {selectedClass.schoolYear} · Run again after adding assignments.
                </p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor={countId}>Student count</Label>
              <Input
                id={countId}
                type="number"
                min={1}
                max={CLASS_SIMULATION_MAX_STUDENTS}
                value={studentCount}
                disabled={loading}
                onChange={(event) => {
                  const next = Number.parseInt(event.target.value, 10);
                  updateForms({
                    simulationStudentCount: Number.isFinite(next)
                      ? Math.min(
                          CLASS_SIMULATION_MAX_STUDENTS,
                          Math.max(1, next)
                        )
                      : 20,
                  });
                }}
              />
              <p className="text-xs text-muted-foreground">
                1–{CLASS_SIMULATION_MAX_STUDENTS} simulated students with mixed
                assignment progress.
              </p>
            </div>
          </>
        ) : null}
      </div>
      {error ? (
        <div
          role="alert"
          className="mx-3 mb-2 flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Couldn&apos;t update this class</p>
            <p>{error}</p>
          </div>
        </div>
      ) : null}
      <div className="space-y-2 border-t p-3">
        <Button
          type="button"
          className="w-full"
          disabled={populateDisabled}
          onClick={() => void run('populate')}
        >
          {busy === 'populate' ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
              Populating…
            </>
          ) : error ? (
            'Try populate again'
          ) : (
            'Populate class'
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={clearDisabled}
          onClick={() => setClearConfirmOpen(true)}
        >
          {busy === 'clear' ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
              Clearing…
            </>
          ) : (
            'Clear simulated data'
          )}
        </Button>
      </div>
      <AlertDialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{clearConfirmLabel}</AlertDialogTitle>
            <AlertDialogDescription>
              Real students and your teacher account are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setClearConfirmOpen(false);
                void run('clear');
              }}
            >
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
