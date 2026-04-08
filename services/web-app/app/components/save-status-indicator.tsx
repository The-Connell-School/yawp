import { Check, CloudOff, AlertCircle, Loader2 } from 'lucide-react';
import type { SyncStatus } from '~/utils/sync-service';

interface Props {
  status: SyncStatus;
  onLoginClick?: () => void;
}

export function SaveStatusIndicator({ status, onLoginClick }: Props) {
  switch (status) {
    case 'synced':
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Check className="h-3 w-3" />
          Saved
        </span>
      );
    case 'saving':
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving...
        </span>
      );
    case 'offline':
      return (
        <span className="flex items-center gap-1 text-xs text-yellow-600">
          <CloudOff className="h-3 w-3" />
          Saved locally
        </span>
      );
    case 'auth-expired':
      return (
        <span className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3 w-3" />
          Session expired ·{' '}
          <button
            type="button"
            onClick={onLoginClick}
            className="underline hover:no-underline"
          >
            Log in
          </button>
        </span>
      );
    case 'error':
      return (
        <span className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3 w-3" />
          Save error · retrying...
        </span>
      );
    case 'conflict':
      return (
        <span className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3 w-3" />
          Out of sync · keep typing to retry
        </span>
      );
  }
}
