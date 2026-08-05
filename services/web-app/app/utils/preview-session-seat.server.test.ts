import { describe, expect, mock, test } from 'bun:test';
import {
  createPreviewSeatSessionGuard,
  type PreviewSeatSessionDependencies,
} from './preview-session-seat.server';

function dependencies(
  memberships: Array<{ id: string; organizationId: string }>,
  selectedMembershipId: string | null,
) {
  const destroyAuthSession = mock(async () => 'auth=; Max-Age=0; Path=/');
  const clearSelectedMembership = mock(
    async () => 'membership-id=; Max-Age=0; Path=/',
  );
  const deleteSession = mock(async () => undefined);
  const deps: PreviewSeatSessionDependencies = {
    getAuthSession: mock(async () => ({ get: () => 'session-1' })),
    destroyAuthSession,
    clearSelectedMembership,
    getSelectedMembershipId: mock(async () => selectedMembershipId),
    findSession: mock(async () => ({ user: { memberships } })),
    deleteSession,
  };
  return { deps, destroyAuthSession, clearSelectedMembership, deleteSession };
}

const seat = { organizationId: 'preview-seat-2', label: 'Bryant Brock' };

describe('preview seat session boundary', () => {
  test('allows a session whose effective membership belongs to the signed seat', async () => {
    const { deps, deleteSession } = dependencies(
      [{ id: 'membership-2', organizationId: 'preview-seat-2' }],
      'membership-2',
    );
    const guard = createPreviewSeatSessionGuard(deps);

    expect(await guard(new Request('https://preview.test/app'), seat)).toBeNull();
    expect(deleteSession).not.toHaveBeenCalled();
  });

  test('clears a valid session whose user belongs to another seat', async () => {
    const { deps, destroyAuthSession, clearSelectedMembership, deleteSession } =
      dependencies(
        [{ id: 'membership-3', organizationId: 'preview-seat-3' }],
        'membership-3',
      );
    const guard = createPreviewSeatSessionGuard(deps);

    const response = await guard(
      new Request('https://preview.test/app/classes'),
      seat,
    );

    expect(response?.status).toBe(302);
    expect(response?.headers.get('location')).toBe(
      '/auth/login?redirectTo=%2Fapp%2Fclasses',
    );
    expect(destroyAuthSession).toHaveBeenCalledTimes(1);
    expect(clearSelectedMembership).toHaveBeenCalledTimes(1);
    expect(deleteSession).toHaveBeenCalledWith('session-1');
  });

  test('rejects an out-of-seat selected membership even for a multi-org user', async () => {
    const { deps } = dependencies(
      [
        { id: 'membership-2', organizationId: 'preview-seat-2' },
        { id: 'membership-3', organizationId: 'preview-seat-3' },
      ],
      'membership-3',
    );
    const guard = createPreviewSeatSessionGuard(deps);

    const response = await guard(
      new Request('https://preview.test/api/membership-id', { method: 'POST' }),
      seat,
    );

    expect(response?.status).toBe(401);
    expect(await response?.json()).toEqual({
      error: 'Authenticated session does not belong to this preview seat.',
    });
  });

  test('fails closed when a multi-org session has no selected membership', async () => {
    const { deps } = dependencies(
      [
        { id: 'membership-2', organizationId: 'preview-seat-2' },
        { id: 'membership-3', organizationId: 'preview-seat-3' },
      ],
      null,
    );
    const guard = createPreviewSeatSessionGuard(deps);

    expect(
      (await guard(new Request('https://preview.test/app'), seat))?.status,
    ).toBe(302);
  });

  test('allows anonymous requests to proceed after the access-code gate', async () => {
    const { deps, deleteSession } = dependencies([], null);
    deps.getAuthSession = mock(async () => ({ get: () => null }));
    const guard = createPreviewSeatSessionGuard(deps);

    expect(await guard(new Request('https://preview.test/app'), seat)).toBeNull();
    expect(deleteSession).not.toHaveBeenCalled();
  });
});
