import { Outlet, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { requireFreeTierEnabled } from '~/utils/free-tier/free-tier-feature-gate.server';

export async function loader(_args: LoaderFunctionArgs) {
  await requireFreeTierEnabled();
  return null;
}

export async function action(_args: ActionFunctionArgs) {
  await requireFreeTierEnabled();
  return null;
}

export default function FreeTierAppLayoutRoute() {
  return <Outlet />;
}
