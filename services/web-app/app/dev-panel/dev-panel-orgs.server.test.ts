import { describe, expect, mock, test } from 'bun:test';

const previewGate = mock(() => false);
const previewSeat = mock(async () => null as { organizationId: string } | null);

mock.module('~/utils/preview-access.server', () => ({
  getPreviewAccessSeat: previewSeat,
  isPreviewDevLoginAccessCodeRequired: previewGate,
}));
mock.module('~/utils/local-dev-auth.server', () => ({
  isLocalDevAuthEnabled: () => true,
}));
mock.module('~/utils/db.server', () => ({
  prisma: { organization: { findUnique: async () => null, findMany: async () => [] } },
}));

const { assertDevPanelOrganizationInSeatScope } = await import(
  './dev-panel-orgs.server'
);

describe('assertDevPanelOrganizationInSeatScope', () => {
  test('allows any org when preview gate is off', async () => {
    previewGate.mockReturnValue(false);
    const result = await assertDevPanelOrganizationInSeatScope(
      new Request('http://localhost/'),
      'any-org'
    );
    expect(result).toBeNull();
  });

  test('returns 403 when org does not match seat', async () => {
    previewGate.mockReturnValue(true);
    previewSeat.mockResolvedValueOnce({ organizationId: 'seat-org' });
    const result = await assertDevPanelOrganizationInSeatScope(
      new Request('http://localhost/'),
      'other-org'
    );
    expect(result?.status).toBe(403);
  });

  test('allows org that matches seat', async () => {
    previewGate.mockReturnValue(true);
    previewSeat.mockResolvedValueOnce({ organizationId: 'seat-org' });
    const result = await assertDevPanelOrganizationInSeatScope(
      new Request('http://localhost/'),
      'seat-org'
    );
    expect(result).toBeNull();
  });
});
