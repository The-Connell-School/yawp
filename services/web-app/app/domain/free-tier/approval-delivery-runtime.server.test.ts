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

test('overlapping drains share one run, and a failed drain resolves failed and frees the slot', async () => {
  const { drainApprovalDelivery } = await import(
    './approval-delivery-runtime.server'
  );
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let runs = 0;
  const slow = async () => {
    runs += 1;
    await gate;
  };
  const first = drainApprovalDelivery([slow]);
  const second = drainApprovalDelivery([slow]);
  release();
  expect(await first).toBe('ok');
  expect(await second).toBe('ok');
  expect(runs).toBe(1);

  const originalError = console.error;
  console.error = () => {};
  try {
    expect(
      await drainApprovalDelivery([
        async () => {
          throw new Error('boom');
        },
      ])
    ).toBe('failed');
  } finally {
    console.error = originalError;
  }
  expect(await drainApprovalDelivery([async () => {}])).toBe('ok');
});
