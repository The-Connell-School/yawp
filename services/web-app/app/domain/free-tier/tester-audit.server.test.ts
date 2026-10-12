import { expect, mock, test } from 'bun:test';
import { recordTesterAudit } from './tester-audit.server';

test('records actor, target, environment and metadata in existing audit table', async () => {
  const create = mock(async () => ({}));
  await recordTesterAudit(
    { internalPlatformApiAudit: { create } } as never,
    {
      actorUserId: 'intern',
      actorEmail: 'intern@yawp.local',
      action: 'approval.approve',
      environment: 'demo',
    },
    'application',
    { previousStatus: 'SENT', status: 'APPROVED' }
  );
  expect(create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      actorUserId: 'intern',
      targetId: 'application',
      action: 'approval.approve',
      environment: 'demo',
      metadata: { previousStatus: 'SENT', status: 'APPROVED' },
      result: 'changed',
    }),
  });
});

test('audit write failure propagates to the enclosing transaction', async () => {
  await expect(
    recordTesterAudit(
      {
        internalPlatformApiAudit: {
          create: async () => {
            throw new Error('audit unavailable');
          },
        },
      } as never,
      {
        actorUserId: 'intern',
        actorEmail: 'intern@yawp.local',
        action: 'approval.reject',
        environment: 'demo',
      },
      'application'
    )
  ).rejects.toThrow('audit unavailable');
});
