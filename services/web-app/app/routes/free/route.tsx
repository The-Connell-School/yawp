import { Outlet, type LoaderFunctionArgs } from 'react-router';
import { requireFreeTierEnabled } from '~/utils/free-tier/free-tier-feature-gate.server';

/** Layout for /free, /free/join, and /free/admin/* public free-tier routes. */
export async function loader(_args: LoaderFunctionArgs) {
  await requireFreeTierEnabled();
  return null;
}

export default function FreeTierLayoutRoute() {
  return <Outlet />;
}
