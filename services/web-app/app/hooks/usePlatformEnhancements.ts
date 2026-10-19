import { useRouteLoaderData } from 'react-router';
import type { loader } from '~/root';

export function usePlatformEnhancements() {
  return useRouteLoaderData<typeof loader>('root')?.platformEnhancementsEnabled ?? false;
}
