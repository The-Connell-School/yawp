const STATUS_STYLES: Record<string, string> = {
  GENERATING: 'bg-amber-100 text-amber-900',
  QUEUED: 'bg-blue-100 text-blue-900',
  RENDERING: 'bg-blue-100 text-blue-900',
  SUCCEEDED: 'bg-green-100 text-green-900',
  FAILED: 'bg-red-100 text-red-900',
  CANCELLED: 'bg-gray-200 text-gray-700',
};

export function JobStatusBadge({ status }: { status: string }) {
  return (
    <span
      data-testid="marketing-job-status"
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
        STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-800'
      }`}
    >
      {status}
    </span>
  );
}
