import { invariant } from '@epic-web/invariant';
import { useRouteLoaderData } from 'react-router';
import type { Route } from '../+types/root';

/**
 * @returns the request info from the root loader
 */
export function useRequestInfo() {
  const data = useRouteLoaderData<Route.ComponentProps['loaderData']>('root');
  invariant(data?.requestInfo, 'No requestInfo found in root loader');

  return data.requestInfo;
}
