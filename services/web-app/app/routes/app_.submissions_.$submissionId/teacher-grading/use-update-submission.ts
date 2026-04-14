import { useCallback, useRef, useState } from 'react';

type UpdateStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useUpdateSubmission(submissionId: string) {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(async (fields: Record<string, unknown>) => {
    setStatus('saving');
    try {
      const res = await fetch('/api/domain/update-submission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId, ...fields }),
      });
      if (!res.ok) throw new Error('Save failed');
      setStatus('saved');
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
    }
  }, [submissionId]);

  return { save, status };
}
