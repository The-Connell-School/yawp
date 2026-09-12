import { expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';

test.skipIf(!process.env.INTERNAL_DIRECTORY_TEST_DATABASE_URL)('real seeded directory enforces authentication, organization filtering and classification', async () => {
  const connection = process.env.INTERNAL_DIRECTORY_TEST_DATABASE_URL;
  if (!connection) throw new Error('Run through project test --profile internal-directory-integration');
  const url = new URL(connection);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.startsWith('/yawp_')) {
    throw new Error('Directory integration requires an isolated local Yawp database');
  }
  process.env.DATABASE_URL = connection;
  process.env.E2E_DATABASE_URL = connection;
  const key = randomBytes(32).toString('base64url');
  process.env.YAWP_MANAGEMENT_SERVICE_KEY = key;
  const { internalDirectory, internalOrganizationSearch } = await import('./internal-directory.server');
  const { prisma } = await import('./db.server');
  const request = (query = '', token = key) => new Request(`https://yawp.test/api/internal/v1/users${query}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  try {
    expect((await internalDirectory.search(request('', 'invalid'))).status).toBe(401);
    const teacher = await prisma.user.findUniqueOrThrow({
      where: { email: 'dev.teacher@yawp.local' }, include: { memberships: true },
    });
    const membership = teacher.memberships.find(value => value.isActive)!;
    expect(membership).toBeTruthy();
    const orgRequest = (body: unknown) => new Request('https://yawp.test/api/internal/v1/organizations/search', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const organization = await prisma.organization.findUniqueOrThrow({ where: { id: membership.organizationId } });
    const organizations = await internalOrganizationSearch(orgRequest({ q: organization.name, organizationIds: [organization.id] }));
    expect(await organizations.json()).toEqual({ organizations: [{ id: organization.id, name: organization.name }], nextCursor: null });
    const absent = await internalOrganizationSearch(orgRequest({ organizationIds: ['missing-org'] }));
    expect(await absent.json()).toEqual({ organizations: [], nextCursor: null });

    const result = await internalDirectory.search(request(`?q=dev.teacher&organizationId=${membership.organizationId}`));
    expect(result.status).toBe(200);
    const page = await result.json();
    expect(page.users.some((user: { id: string }) => user.id === teacher.id)).toBe(true);
    expect(page.users.every((user: { organizationId: string; privileged: unknown }) => user.organizationId === membership.organizationId && typeof user.privileged === 'boolean')).toBe(true);
    const selected = await internalDirectory.lookup(request(`?organizationId=${membership.organizationId}`), teacher.id);
    expect(await selected.json()).toEqual({ id: teacher.id, organizationId: membership.organizationId, privileged: teacher.isAdmin || teacher.isSuperAdmin });
    const excluded = await internalDirectory.search(request('?organizationId=nonexistent-organization'));
    expect(await excluded.json()).toEqual({ users: [], nextCursor: null });
  } finally {
    await prisma.$disconnect();
    delete process.env.YAWP_MANAGEMENT_SERVICE_KEY;
  }
}, 30000);

test.skipIf(!process.env.INTERNAL_DIRECTORY_TEST_DATABASE_URL)('preview seat creation tolerates a shared-host transaction longer than five seconds', async () => {
  const connection = process.env.INTERNAL_DIRECTORY_TEST_DATABASE_URL!;
  const url = new URL(connection);
  if (!['localhost','127.0.0.1'].includes(url.hostname) || !url.pathname.startsWith('/yawp_')) throw new Error('Isolated local database required');
  process.env.DATABASE_URL = connection;
  const { prisma } = await import('./db.server');
  const {ensurePreviewSeats,buildPreviewSeatDefinition} = await import('../../../../packages/prisma/scripts/preview-seats');
  const seat = {...buildPreviewSeatDefinition(2), organizationId: `seat-timeout-${randomBytes(8).toString('hex')}`};
  try {
    const result = await ensurePreviewSeats(prisma,[seat],async tx => {
      await tx.$executeRaw`SELECT pg_sleep(5.2)`;
      // The query after the delay must still be inside a live transaction.
      await tx.organization.findUnique({where:{id:seat.organizationId}});
    });
    expect(result).toEqual([{organizationId:seat.organizationId,status:'created'}]);
  } finally { await prisma.$disconnect(); }
},20000);
