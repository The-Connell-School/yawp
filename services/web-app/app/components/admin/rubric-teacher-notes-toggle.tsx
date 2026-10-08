import { useEffect, useState } from 'react';
import { useFetcher } from 'react-router';
import { Label } from '~/components/ui/label';
import { Switch } from '~/components/ui/switch';
import type { RubricOutputOptionsState } from '~/domain/rubrics/rubric-output-options.server';

type ToggleResponse =
  | {
      status: 'success';
      teacherNotesEnabled: boolean;
      fingerprint: string;
    }
  | { error: string; httpStatus?: number };

export function RubricTeacherNotesToggle({
  assignmentTypeId,
  canEdit,
  disabled = false,
  disabledReason,
}: {
  assignmentTypeId?: string;
  canEdit: boolean;
  disabled?: boolean;
  disabledReason?: string | null;
}) {
  const loadFetcher = useFetcher<{ state?: RubricOutputOptionsState; error?: string }>();
  const fetcher = useFetcher<ToggleResponse>();
  const [local, setLocal] = useState<RubricOutputOptionsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [staleConflict, setStaleConflict] = useState(false);

  useEffect(() => {
    if (!assignmentTypeId) return;
    if (loadFetcher.state !== 'idle' || loadFetcher.data) return;
    loadFetcher.load(
      `/api/admin/rubric-output-options?assignmentTypeId=${encodeURIComponent(assignmentTypeId)}`
    );
  }, [assignmentTypeId, loadFetcher]);

  useEffect(() => {
    if (loadFetcher.data?.state) {
      setLocal(loadFetcher.data.state);
      setError(loadFetcher.data.error ?? null);
    } else if (loadFetcher.data?.error) {
      setError(loadFetcher.data.error);
    }
  }, [loadFetcher.data]);

  useEffect(() => {
    const data = fetcher.data;
    if (!data) return;
    if ('status' in data && data.status === 'success') {
      const success = data;
      setLocal((current) =>
        current
          ? {
              ...current,
              teacherNotesEnabled: success.teacherNotesEnabled,
              fingerprint: success.fingerprint,
            }
          : current
      );
      setError(null);
      setStaleConflict(false);
      return;
    }
    if ('error' in data) {
      setError(data.error);
      setStaleConflict(data.httpStatus === 409);
    }
  }, [fetcher.data]);

  if (!local && loadFetcher.state === 'loading') {
    return (
      <p className="text-sm text-muted-foreground">Loading private note settings…</p>
    );
  }

  if (!local) {
    return (
      <p className="text-sm text-muted-foreground text-pretty">
        Private teacher notes apply to database-managed rubrics. Choose a library
        rubric or save a custom rubric on this assignment type to configure them.
      </p>
    );
  }

  const pending = fetcher.state !== 'idle';
  const checked = local.teacherNotesEnabled;
  const switchDisabled = !canEdit || pending || disabled;

  function handleChange(enabled: boolean) {
    if (switchDisabled || !local) return;
    setError(null);
    setStaleConflict(false);
    fetcher.submit(
      JSON.stringify({
        catalogKey: local.catalogKey,
        enabled,
        expectedFingerprint: local.fingerprint,
        requestId: crypto.randomUUID(),
      }),
      {
        method: 'POST',
        action: '/api/admin/rubric-output-options',
        encType: 'application/json',
      }
    );
  }

  function reloadOptions() {
    if (!assignmentTypeId) return;
    setStaleConflict(false);
    setError(null);
    loadFetcher.load(
      `/api/admin/rubric-output-options?assignmentTypeId=${encodeURIComponent(assignmentTypeId)}`
    );
  }

  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Label htmlFor="rubric-teacher-notes-enabled">
            Notes to the teacher (private)
          </Label>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            Lets the grading assistant flag observable writing shifts for you
            only. Saves immediately when you flip the switch. Library rubrics
            share one catalog revision, so this affects every school using that
            rubric.
          </p>
          {!canEdit ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Only a platform superadmin can change this setting.
            </p>
          ) : null}
          {disabled && disabledReason ? (
            <p className="mt-2 text-sm text-muted-foreground">{disabledReason}</p>
          ) : null}
        </div>
        <Switch
          id="rubric-teacher-notes-enabled"
          data-testid="rubric-teacher-notes-toggle"
          checked={checked}
          disabled={switchDisabled}
          onCheckedChange={handleChange}
        />
      </div>
      {error ? (
        <div className="space-y-1">
          <p className="text-sm text-destructive">{error}</p>
          {staleConflict && assignmentTypeId ? (
            <button
              type="button"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              onClick={reloadOptions}
            >
              Reload rubric settings
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
