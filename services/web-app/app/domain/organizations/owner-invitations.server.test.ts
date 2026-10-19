import { expect, mock, test } from 'bun:test';

const mail = mock(async () => ({ status: 'success' }));
mock.module('~/utils/email.server', () => ({ sendEmail: mail }));
const { invalidateOwnerInvitation } = await import('./owner-invitations.server');

test('invalidation uses the existing unique delete to invalidate only the requested link', async () => {
  const remove = mock(async (_args: unknown) => ({ id: 'current' }));
  await invalidateOwnerInvitation({ invitation: { delete: remove } } as any, 'current');
  expect(remove).toHaveBeenCalledWith({ where: { id: 'current' } });
  expect(mail).not.toHaveBeenCalled();
});

test('invalidation propagates a consumed-row race so the surrounding transaction rolls back', async () => {
  const race = Object.assign(new Error('Consumed'), { code: 'P2025' });
  const remove = mock(async () => { throw race; });
  await expect(invalidateOwnerInvitation({ invitation: { delete: remove } } as any, 'current')).rejects.toBe(race);
});
