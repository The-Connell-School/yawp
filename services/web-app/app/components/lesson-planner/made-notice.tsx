/**
 * "Created in Yawp! and added to your lesson." (Kevin's note 6b): the line a
 * teacher sees on coming back from making a piece. Read once from `?made=1`,
 * then the param is dropped so a refresh does not say it again.
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Check } from 'lucide-react';
import { MADE_NOTICE, MADE_PARAM } from '~/domain/lesson-planner/stack-create-link';

export function MadeNotice({ className = '' }: { className?: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const made = searchParams.get(MADE_PARAM) === '1';
  const [shown, setShown] = useState(made);
  useEffect(() => {
    if (!made) return;
    setShown(true);
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete(MADE_PARAM);
        return next;
      },
      { replace: true, preventScrollReset: true }
    );
  }, [made, setSearchParams]);
  if (!shown) return null;
  return (
    <p
      role="status"
      data-testid="made-notice"
      className={`flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 ${className}`}
    >
      <Check size={15} /> {MADE_NOTICE}
      <button type="button" onClick={() => setShown(false)} className="ml-auto text-xs font-normal underline">
        Close
      </button>
    </p>
  );
}
