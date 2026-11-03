import { data } from 'react-router';
import { isFreeTierEnabled } from '~/domain/feature-flags/feature-flags.server';

/** Hide Free Tier C routes and APIs when the flag is off (404, not 403). */
export async function requireFreeTierEnabled(): Promise<void> {
  if (!(await isFreeTierEnabled())) {
    throw data({ error: 'Not found' }, { status: 404 });
  }
}
