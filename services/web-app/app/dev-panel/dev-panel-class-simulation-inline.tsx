import { Check, CircleAlert, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRevalidator } from 'react-router';
import { cn } from '~/utils/misc';
import { useDevPanel } from './dev-panel-provider';
import { CLASS_SIMULATION_MAX_STUDENTS } from './class-simulation-mix';

type TeacherClass = {
  id: string;
  title: string;
  code: string;
  schoolYear: string;
  simulatedStudentCount?: number;
};

type LoadState = 'loading' | 'empty' | 'idle' | 'error';
type ActionError = 'populate' | 'clear' | 'load' | null;

export function DevPanelClassSimulationInline({
  sectionOpen,
}: {
  sectionOpen: boolean;
}) {
  const { state, updateForms } = useDevPanel();
  const revalidator = useRevalidator();
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [busy, setBusy] = useState<'populate' | 'clear' | null>(null);
  const [actionError, setActionError] = useState<ActionError>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [clearConfirm, setClearConfirm] = useState(false);
  const [populateSuccess, setPopulateSuccess] = useState<string | null>(null);

  const classId = state.forms.simulationClassId ?? '';
  const studentCount = state.forms.simulationStudentCount ?? 20;

  const reloadClasses = useCallback(async () => {
    setLoadState('loading');
    setActionError(null);
    try {
      const response = await fetch('/api/dev-panel/teacher-classes', {
        credentials: 'same-origin',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setLoadState('error');
        setActionError('load');
        return;
      }
      const list = (data.classes ?? []) as TeacherClass[];
      setClasses(list);
      setLoadState(list.length ? 'idle' : 'empty');
      const storedId = state.forms.simulationClassId;
      const storedValid = storedId && list.some((entry) => entry.id === storedId);
      if (storedValid) return;
      if (list[0]) {
        updateForms({ simulationClassId: list[0].id });
      } else if (storedId) {
        updateForms({ simulationClassId: null });
      }
    } catch {
      setLoadState('error');
      setActionError('load');
    }
  }, [state.forms.simulationClassId, updateForms]);

  useEffect(() => {
    if (!sectionOpen) {
      setClearConfirm(false);
      setPopulateSuccess(null);
      setActionError(null);
      setErrorMessage('');
      return;
    }
    void reloadClasses();
  }, [sectionOpen, reloadClasses]);

  useEffect(() => {
    if (!sectionOpen) return;
    if (state.forms.simulationOpenAction !== 'clear-confirm') return;
    if (loadState !== 'idle') return;
    const selected = classes.find((entry) => entry.id === classId);
    if ((selected?.simulatedStudentCount ?? 0) === 0) return;
    setClearConfirm(true);
    updateForms({ simulationOpenAction: null });
  }, [
    classId,
    classes,
    loadState,
    sectionOpen,
    state.forms.simulationOpenAction,
    updateForms,
  ]);

  const selectedClass = classes.find((entry) => entry.id === classId) ?? null;
  const simulatedCount = selectedClass?.simulatedStudentCount ?? 0;

  const ensureClassId = async (): Promise<string | null> => {
    if (classId) return classId;
    const response = await fetch('/api/dev-panel/teacher-classes', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ intent: 'create-sandbox' }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.class?.id) {
      setErrorMessage(
        typeof result?.error === 'string'
          ? result.error
          : 'Could not create a sandbox class.'
      );
      setActionError('populate');
      return null;
    }
    const created = result.class as TeacherClass;
    setClasses([created]);
    setLoadState('idle');
    updateForms({ simulationClassId: created.id });
    return created.id;
  };

  const runPopulate = async () => {
    setBusy('populate');
    setActionError(null);
    setErrorMessage('');
    setPopulateSuccess(null);
    setClearConfirm(false);
    try {
      const targetClassId =
        loadState === 'empty' ? await ensureClassId() : classId;
      if (!targetClassId) {
        setBusy(null);
        return;
      }
      const response = await fetch('/api/dev-panel/class-simulation', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          intent: 'populate',
          classId: targetClassId,
          studentCount,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setErrorMessage(result?.error ?? 'Populate failed.');
        setActionError('populate');
        setBusy(null);
        return;
      }
      const message =
        typeof result?.message === 'string' ? result.message : 'Class populated.';
      setPopulateSuccess(message);
      revalidator.revalidate();
      if (typeof result?.counts?.students === 'number') {
        setClasses((prev) =>
          prev.map((entry) =>
            entry.id === targetClassId
              ? { ...entry, simulatedStudentCount: result.counts.students }
              : entry
          )
        );
        setLoadState('idle');
      }
      setBusy(null);
    } catch {
      setErrorMessage('Could not reach the server.');
      setActionError('populate');
      setBusy(null);
    }
  };

  const runClear = async () => {
    if (!classId) return;
    setBusy('clear');
    setActionError(null);
    setErrorMessage('');
    setPopulateSuccess(null);
    setClearConfirm(false);
    try {
      const response = await fetch('/api/dev-panel/class-simulation', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ intent: 'clear', classId }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setErrorMessage(result?.error ?? 'Clear failed.');
        setActionError('clear');
        setBusy(null);
        return;
      }
      revalidator.revalidate();
      setClasses((prev) =>
        prev.map((entry) =>
          entry.id === classId ? { ...entry, simulatedStudentCount: 0 } : entry
        )
      );
      setBusy(null);
    } catch {
      setErrorMessage('Could not reach the server.');
      setActionError('clear');
      setBusy(null);
    }
  };

  const clearConfirmLabel = useMemo(() => {
    const n = simulatedCount;
    return n === 1
      ? 'Clear 1 fake student and their work?'
      : `Clear ${n} fake students and their work?`;
  }, [simulatedCount]);

  const loading = busy !== null;
  const showActions = loadState !== 'loading' && loadState !== 'error';

  return (
    <div
      className={cn(
        'yawp-dev-panel-class-sim-inline',
        loading && 'yawp-dev-panel-class-sim-inline-busy'
      )}
    >
      {loadState === 'loading' ? (
        <p role="status" className="yawp-dev-panel-class-sim-status">
          <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
          Loading your classes…
        </p>
      ) : null}

      {loadState === 'error' ? (
        <div role="alert" className="yawp-dev-panel-class-sim-error-block">
          <p className="yawp-dev-panel-class-sim-error-title">Could not load classes</p>
          <p className="yawp-dev-panel-class-sim-error-copy">Try again in a moment.</p>
          <button
            type="button"
            className="yawp-dev-panel-class-sim-retry"
            onClick={() => void reloadClasses()}
          >
            Retry
          </button>
        </div>
      ) : null}

      {loadState === 'empty' ? (
        <div className="yawp-dev-panel-class-sim-empty">
          <b>You don&apos;t own any classes yet</b>
          <span>
            Populate creates a sandbox class, then fills it with simulated students.
          </span>
        </div>
      ) : null}

      {loadState === 'idle' && classes.length > 0 ? (
        <div className="yawp-dev-panel-class-sim-fields">
          <span className="yawp-dev-panel-pe3-field-label">Class</span>
          <div className="yawp-dev-panel-class-sim-class-list" role="listbox" aria-label="Class">
            {classes.map((entry) => {
              const selected = entry.id === classId;
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={loading}
                  className={cn(
                    'yawp-dev-panel-class-sim-class-row',
                    selected && 'yawp-dev-panel-class-sim-class-row-selected'
                  )}
                  onClick={() => updateForms({ simulationClassId: entry.id })}
                >
                  <span className="yawp-dev-panel-class-sim-check" aria-hidden="true">
                    {selected ? <Check className="size-3" /> : null}
                  </span>
                  <span className="yawp-dev-panel-class-sim-class-title">{entry.title}</span>
                  <span className="yawp-dev-panel-class-sim-class-meta">
                    {entry.simulatedStudentCount ?? 0} sim
                  </span>
                </button>
              );
            })}
          </div>
          {selectedClass ? (
            <span className="yawp-dev-panel-class-sim-class-code">
              {selectedClass.code} · {selectedClass.schoolYear}
            </span>
          ) : null}
          <label className="yawp-dev-panel-pe3-field-label" htmlFor="dev-panel-sim-count">
            Student count
          </label>
          <input
            id="dev-panel-sim-count"
            type="number"
            min={1}
            max={CLASS_SIMULATION_MAX_STUDENTS}
            disabled={loading}
            className="yawp-dev-panel-class-sim-count-input"
            value={studentCount}
            onChange={(event) => {
              const next = Number.parseInt(event.target.value, 10);
              updateForms({
                simulationStudentCount: Number.isFinite(next)
                  ? Math.min(CLASS_SIMULATION_MAX_STUDENTS, Math.max(1, next))
                  : 20,
              });
            }}
          />
          <span className="yawp-dev-panel-class-sim-hint">
            1–{CLASS_SIMULATION_MAX_STUDENTS} simulated students with mixed assignment
            progress.
          </span>
        </div>
      ) : null}

      {populateSuccess ? (
        <p role="status" className="yawp-dev-panel-class-sim-success">
          {populateSuccess}
        </p>
      ) : null}

      {actionError && errorMessage ? (
        <div role="alert" className="yawp-dev-panel-class-sim-inline-alert">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="yawp-dev-panel-class-sim-inline-alert-title">
              {actionError === 'populate'
                ? 'Populate failed'
                : actionError === 'clear'
                  ? 'Clear failed'
                  : 'Something went wrong'}
            </p>
            <p>{errorMessage}</p>
          </div>
        </div>
      ) : null}

      {clearConfirm ? (
        <div className="yawp-dev-panel-class-sim-confirm" role="group" aria-label="Confirm clear">
          <p className="yawp-dev-panel-class-sim-confirm-title">{clearConfirmLabel}</p>
          <p className="yawp-dev-panel-class-sim-confirm-copy">
            Real students and your teacher account are not affected.
          </p>
          <div className="yawp-dev-panel-class-sim-confirm-actions">
            <button
              type="button"
              className="yawp-dev-panel-class-sim-btn-primary"
              onClick={() => void runClear()}
            >
              Clear
            </button>
            <button
              type="button"
              className="yawp-dev-panel-class-sim-btn-secondary"
              onClick={() => setClearConfirm(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {showActions && !clearConfirm ? (
        <div className="yawp-dev-panel-class-sim-footer">
          <button
            type="button"
            className="yawp-dev-panel-class-sim-btn-primary"
            disabled={loading}
            onClick={() => void runPopulate()}
          >
            {busy === 'populate' ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                Populating…
              </>
            ) : actionError === 'populate' ? (
              'Try populate again'
            ) : (
              'Populate class'
            )}
          </button>
          <button
            type="button"
            className="yawp-dev-panel-class-sim-btn-secondary"
            disabled={
              loading || loadState === 'empty' || !classId || simulatedCount === 0
            }
            onClick={() => setClearConfirm(true)}
          >
            {busy === 'clear' ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                Clearing…
              </>
            ) : (
              'Clear simulated data'
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
}
