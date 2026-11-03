import {
  Outlet,
  useLoaderData,
  type LoaderFunctionArgs,
} from 'react-router';
import { isFreeTierEnabled } from '~/domain/feature-flags/feature-flags.server';
import { requireFreeTierEnabled } from '~/utils/free-tier/free-tier-feature-gate.server';
import type { FreeTierLayoutContext } from '../free-tier/useFreeTierLayoutContext';

/** Layout for /free, /free/join, and /free/admin/* public free-tier routes. */
export async function loader(_args: LoaderFunctionArgs) {
  await requireFreeTierEnabled();
  return {
    freeTierEnabled: await isFreeTierEnabled(),
  } satisfies FreeTierLayoutContext;
}

export default function FreeTierLayoutRoute() {
  const context = useLoaderData<typeof loader>();
  return <Outlet context={context} />;
}
