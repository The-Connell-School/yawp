import { describe, expect, test } from 'bun:test';
import { rejectDevPanelInProduction } from './dev-panel-runtime.server';

describe('dev panel production guard', () => {
  test('api guard returns 404 in production', () => {
    const previous = process.env.YAWP_ENVIRONMENT;
    process.env.YAWP_ENVIRONMENT = 'production';
    const response = rejectDevPanelInProduction();
    expect(response?.status).toBe(404);
    process.env.YAWP_ENVIRONMENT = previous;
  });
});
