import { createHash, randomUUID } from 'node:crypto';
import type { PrismaClient, Prisma } from '@app/prisma';
import { z } from 'zod';

const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
export const qaAccountsInput = z.object({
  id: z.string().uuid(), actorId: identifier, organizationId: identifier,
  reason: z.string().trim().min(1).max(2000),
  users: z.array(z.object({ name: z.string().trim().min(1).max(100), role: z.enum(['TEACHER', 'STUDENT']) }).strict()).min(1).max(10),
}).strict();
const usersSchema = z.array(z.object({ userId: identifier, membershipId: identifier, email: z.string().email(), name: z.string(), role: z.enum(['TEACHER', 'STUDENT']) }));
type Db = InstanceType<typeof PrismaClient>;
function present(row: Prisma.InternalQaFixtureGetPayload<object>) {
  return { id: row.id, actorId: row.actorId, organizationId: row.organizationId, reason: row.reason,
    users: usersSchema.parse(row.users), createdAt: row.createdAt, archivedAt: row.archivedAt, archivedBy: row.archivedBy };
}

/** Fixed QA operation only: no real email, password, elevated role or licensing bypass. */
export class InternalQaAccounts {
  constructor(private db: Db) {}
  async create(raw: z.input<typeof qaAccountsInput>) {
    const input = qaAccountsInput.parse(raw);
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${input.id}, 0))`;
      const previous = await tx.internalQaFixture.findUnique({ where: { id: input.id } });
      if (previous) {
        if (previous.requestHash !== requestHash) throw new Error('Idempotency key already used with different inputs');
        return present(previous);
      }
      const organizations = await tx.$queryRaw<Array<{ id: string; numOfTeacherSeats: number; numOfStudentSeats: number }>>`
        SELECT id, "numOfTeacherSeats", "numOfStudentSeats" FROM "Organization" WHERE id=${input.organizationId} FOR UPDATE`;
      const organization = organizations[0];
      if (!organization) throw new Error('Organization not found');
      for (const role of ['TEACHER', 'STUDENT'] as const) {
        const requested = input.users.filter(user => user.role === role).length;
        if (!requested) continue;
        const existing = await tx.orgMembership.count({ where: { organizationId: input.organizationId, role, isActive: true } });
        const limit = role === 'TEACHER' ? organization.numOfTeacherSeats : organization.numOfStudentSeats;
        if (existing + requested > limit) throw new Error('Organization seat limit exceeded');
      }
      const users: z.infer<typeof usersSchema> = [];
      for (const [index, user] of input.users.entries()) {
        const userId = randomUUID(), membershipId = randomUUID();
        const email = `qa-${input.id}-${index + 1}@yawp.invalid`;
        const name = `QA — ${user.name}`;
        await tx.user.create({ data: { id: userId, email, name, isAdmin: false, isSuperAdmin: false,
          memberships: { create: { id: membershipId, organizationId: input.organizationId, role: user.role, isActive: true, isOrgOwner: false } },
        } });
        users.push({ userId, membershipId, email, name, role: user.role });
      }
      return present(await tx.internalQaFixture.create({ data: { id: input.id, actorId: input.actorId,
        organizationId: input.organizationId, reason: input.reason, requestHash, users,
      } }));
    }, { timeout: 30000 });
  }
  async list(raw: { organizationId: string; cursor?: string }) {
    const input = z.object({ organizationId: identifier, cursor: z.string().uuid().optional() }).strict().parse(raw);
    const rows = await this.db.internalQaFixture.findMany({ where: { organizationId: input.organizationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 51,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });
    return { fixtures: rows.slice(0, 50).map(present), nextCursor: rows.length > 50 ? rows[49]!.id : null };
  }
  async archive(raw: { id: string; actorId: string; organizationId: string }) {
    const input = z.object({ id: z.string().uuid(), actorId: identifier, organizationId: identifier }).strict().parse(raw);
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${input.id}, 0))`;
      const fixture = await tx.internalQaFixture.findUnique({ where: { id: input.id } });
      if (!fixture || fixture.organizationId !== input.organizationId) throw new Error('QA fixture not found in organization');
      if (fixture.archivedAt) return present(fixture);
      const users = usersSchema.parse(fixture.users);
      await tx.orgMembership.updateMany({ where: { organizationId: input.organizationId, id: { in: users.map(user => user.membershipId) } }, data: { isActive: false } });
      return present(await tx.internalQaFixture.update({ where: { id: fixture.id }, data: { archivedAt: new Date(), archivedBy: input.actorId } }));
    });
  }
}
