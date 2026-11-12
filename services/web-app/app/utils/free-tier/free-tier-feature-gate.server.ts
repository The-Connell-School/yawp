import { data } from 'react-router';
import { isFreeTierEnabled } from '~/domain/feature-flags/feature-flags.server';
import { isDevPanelRuntimeEnabled } from '~/dev-panel/dev-panel-runtime.server';

/** Hide Free Tier C routes and APIs when the flag is off (404, not 403). */
export async function requireFreeTierEnabled(): Promise<void> {
  if (
    isDevPanelRuntimeEnabled() &&
    process.env.E2E_ENFORCE_FREE_TIER_FLAG !== '1'
  ) {
    return;
  }
  if (!(await isFreeTierEnabled())) {
    throw data({ error: 'Not found' }, { status: 404 });
  }
}
