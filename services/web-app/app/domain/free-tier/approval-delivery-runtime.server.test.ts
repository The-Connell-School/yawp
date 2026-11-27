import { expect, test } from 'bun:test';
import { approvalDeliveryEnabled } from './approval-delivery-runtime.server';

test('the approval worker runs in production and demo, and stays off in tests', () => {
  expect(approvalDeliveryEnabled({ NODE_ENV: 'production' })).toBe(true);
  expect(
    approvalDeliveryEnabled({ NODE_ENV: 'development', YAWP_ENVIRONMENT: 'demo' })
  ).toBe(true);
  expect(
    approvalDeliveryEnabled({ NODE_ENV: 'development', PREVIEW_SLUG: 'demo' })
  ).toBe(true);
  expect(approvalDeliveryEnabled({ NODE_ENV: 'test' })).toBe(false);
  expect(
    approvalDeliveryEnabled({
      NODE_ENV: 'production',
      FREE_TIER_APPROVAL_WORKER_ENABLED: 'false',
    })
  ).toBe(false);
  expect(
    approvalDeliveryEnabled({
      NODE_ENV: 'development',
      FREE_TIER_APPROVAL_WORKER_ENABLED: 'true',
    })
  ).toBe(true);
});
