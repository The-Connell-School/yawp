import { data } from 'react-router';
import { isFreeTierEnabled } from '~/domain/feature-flags/feature-flags.server';
import { isDevPanelRuntimeEnabled } from '~/dev-panel/dev-panel-runtime.server';

/** Public /free/* layout — never bypass the flag (E2E and production contract). */
export async function requirePublicFreeTierEnabled(): Promise<void> {
  if (!(await isFreeTierEnabled())) {
    throw data({ error: 'Not found' }, { status: 404 });
  }
}

/** Hide Free Tier teacher routes and APIs when the flag is off (404, not 403). */
export async function requireFreeTierEnabled(): Promise<void> {
  if (isDevPanelRuntimeEnabled()) {
    if (process.env.E2E_ENFORCE_FREE_TIER_FLAG !== '1') {
      const ci = process.env.CI === 'true';
      const demo =
        String(process.env.YAWP_ENVIRONMENT ?? '').trim().toLowerCase() ===
        'demo';
      // Local/dev-panel jumps need /app/free-tier when the row is off; smoke CI must not.
      if (!ci || demo) return;
    }
  }
  if (!(await isFreeTierEnabled())) {
    throw data({ error: 'Not found' }, { status: 404 });
  }
}
