/** Demo-only account reconciliation. Never run against production. */
import { assertDemoEnvironment } from './create-intern-testers-guard';

async function main() {
  assertDemoEnvironment(process.env);
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--dry-run'))
    throw new Error('Only --dry-run is supported.');
  const dryRun = args.includes('--dry-run');
  const accounts = [1, 2, 3, 4].map((number) => {
    const password = process.env[`INTERN_PASSWORD_${number}`];
    if (!password?.trim())
      throw new Error(`INTERN_PASSWORD_${number} is required.`);
    return {
      email: `bryant+intern${number}@brock.software`,
      name: `Intern Tester ${number}`,
      password,
    };
  });

  // Import only after validation. Dry-run never constructs a database client.
  const { Prisma } = await import('@app/prisma');
  const fields =
    Prisma.dmmf.datamodel.models.find((model) => model.name === 'User')
      ?.fields ?? [];
  const flags: Record<string, boolean | string> = {};
  for (const name of ['isTester', 'testerRole']) {
    const field = fields.find((candidate) => candidate.name === name);
    if (name === 'isTester' && field?.type === 'Boolean') {
      flags[name] = true;
    } else if (name === 'testerRole' && field?.type === 'String') {
      flags[name] = 'MOCK_ADMIN';
    } else if (name === 'testerRole' && field?.kind === 'enum') {
      const values =
        Prisma.dmmf.datamodel.enums.find((item) => item.name === field.type)
          ?.values ?? [];
      const role = values.find((value) => value.name === 'MOCK_ADMIN');
      if (role) flags[name] = role.name;
      else console.warn('Skipping testerRole: MOCK_ADMIN is unavailable.');
    } else {
      console.warn(
        `Skipping ${name}: compatible User column is absent from Prisma DMMF.`
      );
    }
  }

  if (dryRun) {
    for (const account of accounts)
      console.info(
        `Would reconcile demo teacher ${account.email} with an individual free-tier org/class.`
      );
    console.info(
      `Supported tester flags: ${Object.keys(flags).join(', ') || 'none'}. No database connection or writes.`
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
            ...flags,
            password: { create: { hash } },
          },
          update: {
            name: account.name,
            emailVerifiedAt: new Date(),
            mustChangePassword: false,
            ...flags,
            password: { upsert: { create: { hash }, update: { hash } } },
          },
          select: { id: true },
        });
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

main().catch(() => {
  // Do not print Prisma errors: they can contain connection details or input values.
  console.error(
    'Demo intern provisioning failed. Check demo guards, password variables, and free-tier prerequisites.'
  );
  process.exitCode = 1;
});
