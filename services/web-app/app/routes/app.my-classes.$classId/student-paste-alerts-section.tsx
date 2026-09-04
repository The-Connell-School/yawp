import { Link } from 'react-router';
import { timeAgo } from '~/utils/timeAgo';

export type StudentPasteAlert = {
  id: string;
  documentId: string;
  textLength: number;
  createdAt: string | Date;
};

const VISIBLE_ROW_COUNT = 3;

/**
 * A quiet, informational list — not an alert banner. Bryant's framing: "it's
 * more informational than you think", a glance-able record of where a
 * student pasted a chunk of text, not an accusation. No red, no warning
 * iconography, no "flagged" language.
 */
export function StudentPasteAlertsSection({
  alerts,
  exitTo,
}: {
  alerts: StudentPasteAlert[];
  exitTo: string;
}) {
  if (alerts.length === 0) return null;

  const visible = alerts.slice(0, VISIBLE_ROW_COUNT);
  const overflowCount = alerts.length - visible.length;
  const encodedExitTo = encodeURIComponent(exitTo);

  return (
    <div className="mt-4 rounded-lg border bg-muted/20 p-3">
      <p className="text-xs font-medium text-muted-foreground">
        Pasted text {alerts.length > 1 ? `(${alerts.length})` : ''}
      </p>
      <ul className="mt-1.5 space-y-1">
        {visible.map((alert) => (
          <li key={alert.id}>
            <Link
              to={`/app/documents/${alert.documentId}?exitTo=${encodedExitTo}`}
              className="flex items-center justify-between gap-2 rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <span className="truncate">
                {timeAgo(alert.createdAt)} · {alert.textLength} chars
              </span>
              <span
                className="shrink-0 truncate font-mono text-[11px] text-muted-foreground/80"
                title={alert.documentId}
              >
                {alert.documentId}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {overflowCount > 0 ? (
        <p className="mt-1 px-1 text-xs text-muted-foreground">
          +{overflowCount} more
        </p>
      ) : null}
    </div>
  );
}
