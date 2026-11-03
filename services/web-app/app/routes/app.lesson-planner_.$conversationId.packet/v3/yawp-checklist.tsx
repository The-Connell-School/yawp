/**
 * Before class: the writing steps that are not in Yawp! yet (Kevin, Oct 21).
 * The planner offers Yawp! for an exit ticket and the teacher may choose
 * paper; what should never happen is reaching class believing an assignment
 * exists when it was never made. So the finish line lists each one, with
 * Create, or "Paper instead" to take it off the list.
 *
 * "Paper instead" is remembered in this browser only: it is a teacher's note
 * to themselves, not lesson data.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { PenLine } from 'lucide-react';
import type { StackStep } from '~/domain/lesson-planner/stack-steps';

const key = (conversationId: string) => `yawp-lesson-paper:${conversationId}`;

/** "Create this exit ticket in Yawp!" → "Exit ticket": what the step makes. */
export function assignmentName(label: string): string {
  const named = /^Create this (.+?) in Yawp!/i.exec(label)?.[1]?.replace(/ (?:assignment|prompt)$/i, '');
  return named ? named.charAt(0).toUpperCase() + named.slice(1) : 'Assignment';
}

/** The steps this teacher is running on paper, and a way to add one. */
export function usePaperSteps(conversationId: string): [ReadonlySet<string>, (id: string) => void] {
  const [paper, setPaper] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(key(conversationId)) ?? '[]');
      if (Array.isArray(stored)) setPaper(new Set(stored.filter((id) => typeof id === 'string')));
    } catch {
      // No storage (private window): the list just shows everything.
    }
  }, [conversationId]);
  const add = useCallback(
    (id: string) =>
      setPaper((current) => {
        const next = new Set(current).add(id);
        try {
          window.localStorage.setItem(key(conversationId), JSON.stringify([...next]));
        } catch {
          // Still hidden for this visit.
        }
        return next;
      }),
    [conversationId]
  );
  return [paper, add];
}

export function YawpChecklist({ missing, onPaper }: { missing: StackStep[]; onPaper: (id: string) => void }) {
  if (!missing.length) return null;
  return (
    <div data-testid="yawp-checklist" className="mt-4 rounded-xl border border-[#E7D9F3] bg-[var(--sv-writing-strip)] p-3">
      <p className="text-sm font-semibold" style={{ color: 'var(--sv-writing)' }}>
        Not in Yawp! yet
      </p>
      <p className="mt-0.5 text-xs text-[var(--sv-muted)]">
        Students can’t see {missing.length === 1 ? 'this' : 'these'} until you create {missing.length === 1 ? 'it' : 'them'}.
      </p>
      <ul className="mt-2 space-y-2">
        {missing.map((step) => (
          <li key={step.id} data-testid="yawp-checklist-item" className="flex items-center gap-3 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{assignmentName(step.create!.label)}</span>
              <span className="block truncate text-xs text-[var(--sv-muted)]">{step.title}</span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <Link
                to={step.create!.href}
                className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-semibold"
                style={{ color: 'var(--sv-writing)' }}
              >
                <PenLine size={12} /> Create
              </Link>
              <button
                type="button"
                data-testid="yawp-paper"
                onClick={() => onPaper(step.id)}
                className="text-[11px] font-semibold text-[var(--sv-muted)] underline underline-offset-2"
              >
                Paper instead
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
