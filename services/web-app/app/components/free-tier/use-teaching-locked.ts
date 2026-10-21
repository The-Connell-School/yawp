import { useRouteLoaderData } from 'react-router';
import type { LockedPreviewShellState } from '~/domain/free-tier/locked-preview-shell.server';

export function useTeachingLocked(): LockedPreviewShellState | null {
  return (
    useRouteLoaderData<{ lockedPreview?: LockedPreviewShellState | null }>(
      'routes/app'
    )?.lockedPreview ?? null
  );
}
