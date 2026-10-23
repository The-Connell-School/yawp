import { describe, expect, test } from 'bun:test';

/** Mirrors root loader signed-out user shaping (full app path, not public landing). */
function rootSignedOutUser(user: { isAdmin: boolean | null } | null) {
  return user
    ? {
        ...user,
        isAdmin: Boolean(user.isAdmin),
        selectedMembership: undefined as undefined,
      }
    : null;
}

describe('root loader signed-out user', () => {
  test('returns null instead of an empty user object when signed out', () => {
    expect(rootSignedOutUser(null)).toBeNull();
  });

  test('keeps signed-in user shape', () => {
    expect(rootSignedOutUser({ isAdmin: true, id: 'u1' } as never)).toMatchObject({
      id: 'u1',
      isAdmin: true,
    });
  });
});
