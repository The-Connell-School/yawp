import {
  Outlet,
  useLoaderData,
  type LoaderFunctionArgs,
} from 'react-router';
import { isFreeTierEnabled } from '~/domain/feature-flags/feature-flags.server';
import { requireFreeTierEnabled } from '~/utils/free-tier/free-tier-feature-gate.server';
import type { FreeTierAdminLayoutContext } from '../free-tier/useAdminCopyPass1';

/** Layout for /free, /free/join, and /free/admin/* public free-tier routes. */
export async function loader(_args: LoaderFunctionArgs) {
  await requireFreeTierEnabled();
  return {
    adminCopyPass1: await isFreeTierEnabled(),
  } satisfies FreeTierAdminLayoutContext;
}

export default function FreeTierLayoutRoute() {
  const context = useLoaderData<typeof loader>();
  return <Outlet context={context} />;
}
