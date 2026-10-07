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
  | { error: string };

export function RubricTeacherNotesToggle({
  state,
  canEdit,
}: {
  state: RubricOutputOptionsState | null;
  canEdit: boolean;
}) {
  const fetcher = useFetcher<ToggleResponse>();
  const [local, setLocal] = useState(state);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLocal(state);
  }, [state?.catalogKey, state?.fingerprint, state?.teacherNotesEnabled]);

  useEffect(() => {
    if (fetcher.data && 'status' in fetcher.data && fetcher.data.status === 'success') {
      setLocal((current) =>
        current
          ? {
              ...current,
              teacherNotesEnabled: fetcher.data.teacherNotesEnabled,
              fingerprint: fetcher.data.fingerprint,
            }
          : current
      );
      setError(null);
    } else if (fetcher.data && 'error' in fetcher.data) {
      setError(fetcher.data.error);
    }
  }, [fetcher.data]);

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

  function handleChange(enabled: boolean) {
    if (!canEdit || pending) return;
    setError(null);
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

  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Label htmlFor="rubric-teacher-notes-enabled">
            Notes to the teacher (private)
          </Label>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            Lets the grading assistant flag observable writing shifts for you
            only. Applies to new assignments after you save; existing
            assignments stay on their pinned rubric revision.
          </p>
          {!canEdit ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Only a platform superadmin can change this setting.
            </p>
          ) : null}
        </div>
        <Switch
          id="rubric-teacher-notes-enabled"
          data-testid="rubric-teacher-notes-toggle"
          checked={checked}
          disabled={!canEdit || pending}
          onCheckedChange={handleChange}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
