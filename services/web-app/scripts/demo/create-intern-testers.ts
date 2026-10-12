/** Demo-only account reconciliation. Never run against production. */
import { assertDemoEnvironment } from './create-intern-testers-guard';
import {
  buildInternAccounts,
  buildTesterGrantPlan,
  buildUserTesterFlags,
  parseDemoInternArgs,
  type DmmfDocument,
  type TesterGrantPlan,
} from './create-intern-testers-lib';

async function reconcileTesterGrant(
  tx: unknown,
  plan: TesterGrantPlan | null,
  userId: string
) {
  if (!plan) return;
  const delegate = (tx as Record<string, unknown>)[plan.delegateName] as
    | {
        upsert?: (args: unknown) => Promise<unknown>;
        findFirst?: (args: unknown) => Promise<{ id: string } | null>;
        update?: (args: unknown) => Promise<unknown>;
        create?: (args: unknown) => Promise<unknown>;
      }
    | undefined;
  if (!delegate) return;

  const create = replacePlanUserId(plan.create, userId);
  const update = replacePlanUserId(plan.update, userId);
  const where = plan.where ? replacePlanUserId(plan.where, userId) : undefined;

  try {
    if (where && delegate.upsert) {
      await delegate.upsert({ where, create, update });
      return;
    }
    const existing = delegate.findFirst
      ? await delegate.findFirst({ where: create })
      : null;
    if (existing && delegate.update) {
      await delegate.update({ where: { id: existing.id }, data: update });
    } else if (delegate.create) {
      await delegate.create({ data: create });
    }
  } catch {
    console.warn('Skipping TesterGrant: compatible write failed.');
  }
}

function replacePlanUserId(
  value: Record<string, unknown>,
  userId: string
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (key === 'userId' && entry === 'user-id') return [key, userId];
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        return [
          key,
          replacePlanUserId(entry as Record<string, unknown>, userId),
        ];
      }
      return [key, entry];
    })
  );
}

async function main() {
  assertDemoEnvironment(process.env);
  const { dryRun } = parseDemoInternArgs(process.argv.slice(2));
  const accounts = buildInternAccounts(process.env);

  // Import only after validation. Dry-run never constructs a database client.
  const { Prisma } = await import('@app/prisma');
  const flags = buildUserTesterFlags(Prisma.dmmf as DmmfDocument);
  for (const warning of flags.warnings) console.warn(warning);
  const testerGrantPlan = buildTesterGrantPlan(Prisma.dmmf as DmmfDocument);

  if (dryRun) {
    for (const account of accounts)
      console.info(
        `Would reconcile demo teacher ${account.email} with an individual free-tier org/class.`
      );
    if (testerGrantPlan)
      console.info('Supported tester grant table: TesterGrant.');
    console.info(
      `Supported tester flags: ${Object.keys(flags.data).join(', ') || 'none'}. No database connection or writes.`
    );
    return;
  }

  const [{ prisma }, { provisionFreeClassroom }, { default: bcrypt }] =
    await Promise.all([
      import('../../app/utils/db.server'),
      import('../../app/domain/free-tier/provision-free-classroom.server'),
      import('bcryptjs'),
    ]);
  try {
    // Check shared prerequisites before updating any accounts.
    const { FREE_CLASSROOM_ASSIGNMENT_KINDS } =
      await import('../../app/utils/entitlements.server');
    const count = await prisma.assignmentType.count({
      where: { kind: { in: [...FREE_CLASSROOM_ASSIGNMENT_KINDS] } },
    });
    if (count !== FREE_CLASSROOM_ASSIGNMENT_KINDS.length)
      throw new Error('Free-tier assignment bundle is missing.');

    for (const account of accounts) {
      const hash = await bcrypt.hash(account.password, 10);
      const application = await prisma.$transaction(async (tx) => {
        const user = await tx.user.upsert({
          where: { email: account.email },
          create: {
            email: account.email,
            name: account.name,
            emailVerifiedAt: new Date(),
            ...flags.data,
            password: { create: { hash } },
          },
          update: {
            name: account.name,
            emailVerifiedAt: new Date(),
            mustChangePassword: false,
            ...flags.data,
            password: { upsert: { create: { hash }, update: { hash } } },
          },
          select: { id: true },
        });
        await reconcileTesterGrant(tx, testerGrantPlan, user.id);
        const existing = await tx.freeTierApplication.findUnique({
          where: { email: account.email },
        });
        if (existing?.organizationId) {
          const org = await tx.organization.findUnique({
            where: { id: existing.organizationId },
            select: { plan: true },
          });
          if (org?.plan !== 'FREE_CLASSROOM' || existing.userId !== user.id)
            throw new Error(
              'Existing demo application has an incompatible org or user.'
            );
        }
        return tx.freeTierApplication.upsert({
          where: { email: account.email },
          create: {
            email: account.email,
            name: account.name,
            schoolName: `${account.name} Demo`,
            location: 'Demo',
            gradeLevel: 'Demo',
            status: 'APPROVED',
            userId: user.id,
          },
          update: { name: account.name, status: 'APPROVED', userId: user.id },
          select: { id: true },
        });
      });
      // The sign-up provisioner locks by application ID and preserves existing org/class IDs.
      const result = await provisionFreeClassroom(application.id);
      if (
        result.status !== 'provisioned' &&
        result.status !== 'already_provisioned'
      ) {
        throw new Error(
          'Demo teacher cannot be provisioned through the free-tier flow.'
        );
      }
      console.info(
        `Reconciled demo teacher ${account.email}: ${result.status}.`
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (typeof Bun !== 'undefined' && Bun.main === import.meta.path)
  main().catch(() => {
    // Do not print Prisma errors: they can contain connection details or input values.
    console.error(
      'Demo intern provisioning failed. Check demo guards, password variables, and free-tier prerequisites.'
    );
    process.exitCode = 1;
  });
