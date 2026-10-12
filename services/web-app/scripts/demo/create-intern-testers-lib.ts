export type DmmfField = {
  name: string;
  type: string;
  kind?: string;
  isRequired?: boolean;
  isUnique?: boolean;
  hasDefaultValue?: boolean;
};

export type DmmfModel = {
  name: string;
  fields: readonly DmmfField[];
  uniqueFields?: readonly (readonly string[])[];
  uniqueIndexes?: readonly { fields: readonly string[] }[];
};

export type DmmfDocument = {
  datamodel: {
    models: readonly DmmfModel[];
    enums?: readonly { name: string; values: readonly { name: string }[] }[];
  };
};

export type InternAccount = {
  email: string;
  name: string;
  password: string;
};

export type TesterGrantPlan = {
  delegateName: string;
  where?: Record<string, unknown>;
  create: Record<string, unknown>;
  update: Record<string, unknown>;
};

export function parseDemoInternArgs(args: string[]) {
  if (args.length === 0) return { dryRun: false };
  if (args.length === 1 && args[0] === '--dry-run') return { dryRun: true };
  throw new Error(
    'Usage: bun scripts/demo/create-intern-testers.ts [--dry-run]'
  );
}

export function buildInternAccounts(
  env: Record<string, string | undefined>
): InternAccount[] {
  return [1, 2, 3, 4].map((number) => {
    const password = env[`INTERN_PASSWORD_${number}`];
    if (!password?.trim())
      throw new Error(`INTERN_PASSWORD_${number} is required.`);
    return {
      email: `bryant+intern${number}@brock.software`,
      name: `Intern Tester ${number}`,
      password,
    };
  });
}

export function buildUserTesterFlags(dmmf: DmmfDocument) {
  const fields =
    dmmf.datamodel.models.find((model) => model.name === 'User')?.fields ?? [];
  const data: Record<string, boolean | string> = {};
  const warnings: string[] = [];

  for (const name of ['isTester', 'mockAdminGranted', 'testerRole']) {
    const field = fields.find((candidate) => candidate.name === name);
    if (
      (name === 'isTester' || name === 'mockAdminGranted') &&
      field?.type === 'Boolean'
    ) {
      data[name] = true;
    } else if (name === 'testerRole' && field?.type === 'String') {
      data[name] = 'MOCK_ADMIN';
    } else if (name === 'testerRole' && field?.kind === 'enum') {
      const values =
        dmmf.datamodel.enums?.find((item) => item.name === field.type)
          ?.values ?? [];
      const role = values.find((value) => value.name === 'MOCK_ADMIN');
      if (role) data[name] = role.name;
      else warnings.push('Skipping testerRole: MOCK_ADMIN is unavailable.');
    } else {
      warnings.push(
        `Skipping ${name}: compatible User column is absent from Prisma DMMF.`
      );
    }
  }

  return { data, warnings };
}

export function buildTesterGrantPlan(
  dmmf: DmmfDocument,
  userId = 'user-id'
): TesterGrantPlan | null {
  const model = dmmf.datamodel.models.find(
    (candidate) => candidate.name === 'TesterGrant'
  );
  if (!model) return null;

  const userIdField = model.fields.find((field) => field.name === 'userId');
  if (userIdField?.type !== 'String') return null;

  const grantField = ['kind', 'type', 'role', 'grant', 'name', 'testerRole']
    .map((name) => model.fields.find((field) => field.name === name))
    .find((field): field is DmmfField => {
      if (!field) return false;
      if (field.type === 'String') return true;
      if (field.kind !== 'enum') return false;
      const values =
        dmmf.datamodel.enums?.find((item) => item.name === field.type)
          ?.values ?? [];
      return values.some((value) => value.name === 'MOCK_ADMIN');
    });
  if (!grantField) return null;

  const create: Record<string, unknown> = {
    userId,
    [grantField.name]: 'MOCK_ADMIN',
  };
  const update: Record<string, unknown> = {};

  for (const name of [
    'enabled',
    'isEnabled',
    'active',
    'granted',
    'mockAdminGranted',
  ]) {
    const field = model.fields.find((candidate) => candidate.name === name);
    if (field?.type === 'Boolean') {
      create[name] = true;
      update[name] = true;
    }
  }

  const uniqueGroups = [
    ...(model.uniqueFields ?? []),
    ...(model.uniqueIndexes?.map((index) => index.fields) ?? []),
  ];
  const compoundUnique = uniqueGroups.find(
    (fields) =>
      fields.length === 2 &&
      fields.includes('userId') &&
      fields.includes(grantField.name)
  );
  const delegateName = `${model.name[0]?.toLowerCase()}${model.name.slice(1)}`;

  if (compoundUnique) {
    const key = compoundUnique.join('_');
    return {
      delegateName,
      where: {
        [key]: {
          userId,
          [grantField.name]: 'MOCK_ADMIN',
        },
      },
      create,
      update,
    };
  }

  if (userIdField.isUnique) {
    return { delegateName, where: { userId }, create, update };
  }

  return { delegateName, create, update };
}
