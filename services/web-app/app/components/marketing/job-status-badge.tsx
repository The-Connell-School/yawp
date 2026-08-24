const STATUS_STYLES: Record<string, string> = {
  GENERATING: 'border-amber-200 bg-amber-50 text-amber-900',
  QUEUED: 'border-sky-200 bg-sky-50 text-sky-900',
  RENDERING: 'border-indigo-200 bg-indigo-50 text-indigo-900',
  SUCCEEDED: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  FAILED: 'border-red-200 bg-red-50 text-red-900',
  CANCELLED: 'border-gray-200 bg-gray-100 text-gray-600',
};

const DOT_STYLES: Record<string, string> = {
  GENERATING: 'bg-amber-500 animate-pulse',
  QUEUED: 'bg-sky-500 animate-pulse',
  RENDERING: 'bg-indigo-500 animate-pulse',
  SUCCEEDED: 'bg-emerald-500',
  FAILED: 'bg-red-500',
  CANCELLED: 'bg-gray-400',
};

/**
 * The status word, exactly as stored — tests and admins both read it — with a
 * dot that pulses while a worker still owes this job something.
 */
export function JobStatusBadge({ status }: { status: string }) {
  return (
    <span
      data-testid="marketing-job-status"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${
        STATUS_STYLES[status] ?? 'border-gray-200 bg-gray-100 text-gray-800'
      }`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          DOT_STYLES[status] ?? 'bg-gray-400'
        }`}
      />
      {status}
    </span>
  );
}
