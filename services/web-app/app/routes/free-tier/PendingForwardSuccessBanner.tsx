import { Check } from 'lucide-react';

export function PendingForwardSuccessBanner({ adminName }: { adminName: string }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-950"
      data-testid="pending-forward-success"
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-800 text-white">
        <Check aria-hidden className="h-3 w-3" />
      </span>
      <p className="font-medium">Request forwarded to {adminName}.</p>
    </div>
  );
}
