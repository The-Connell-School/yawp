import { useCallback, useEffect, useRef, useState } from 'react';

type UpdateStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useUpdateSubmission(
  submissionId: string,
  initialUpdatedAt: Date | string | null
) {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expectedUpdatedAtRef = useRef(
    initialUpdatedAt == null ? null : new Date(initialUpdatedAt).toISOString()
  );

  useEffect(() => {
    expectedUpdatedAtRef.current =
      initialUpdatedAt == null
        ? null
        : new Date(initialUpdatedAt).toISOString();
  }, [initialUpdatedAt]);

  const save = useCallback(
    async (fields: Record<string, unknown>) => {
      setStatus('saving');
      try {
        const res = await fetch('/api/domain/update-submission', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            submissionId,
            expectedUpdatedAt: expectedUpdatedAtRef.current,
            ...fields,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(
            (body as { message?: string } | null)?.message ?? 'Save failed'
          );
        }
        const body = (await res.json().catch(() => null)) as {
          submission?: { updatedAt?: string | null };
        } | null;
        if (body?.submission?.updatedAt) {
          expectedUpdatedAtRef.current = body.submission.updatedAt;
        }
        setStatus('saved');
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setStatus('idle'), 2000);
      } catch (err) {
        setStatus('error');
        throw err instanceof Error ? err : new Error('Save failed');
      }
    },
    [submissionId]
  );

  return { save, status };
}
