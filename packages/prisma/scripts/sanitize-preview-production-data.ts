/* eslint-disable no-console */
import pg from 'pg';

type MembershipRole = 'TEACHER' | 'STUDENT' | string;

export type IdentitySourceUser = {
  id: string;
  isAdmin: boolean;
  memberships: Array<{ organizationId: string; role: MembershipRole }>;
};

export type SanitizedIdentity = {
  id: string;
  name: string;
  email: string;
};

type IdentityKind = 'Admin' | 'Teacher' | 'Student' | 'User';

type Queryable = Pick<pg.Client, 'query'>;

function identityKind(user: IdentitySourceUser): IdentityKind {
  if (user.isAdmin) return 'Admin';
  if (user.memberships.some(({ role }) => role === 'TEACHER')) return 'Teacher';
  if (user.memberships.some(({ role }) => role === 'STUDENT')) return 'Student';
  return 'User';
}

function inOrganization(
  user: IdentitySourceUser,
  organizationId: string,
  role?: MembershipRole
) {
  return user.memberships.some(
    (membership) =>
      membership.organizationId === organizationId &&
      (role === undefined || membership.role === role)
  );
}

function padded(value: number) {
  return String(value).padStart(4, '0');
}

/**
 * Deterministic pseudonyms make repeated rehearsals comparable while preserving every
 * production id and relationship. Only identity display fields change.
 */
export function buildSanitizedIdentityPlan(
  users: IdentitySourceUser[],
  masterOrganizationId: string
): SanitizedIdentity[] {
  const ordered = [...users].sort((a, b) => a.id.localeCompare(b.id));
  const masterTeacher = ordered.find(
    (user) =>
      identityKind(user) === 'Teacher' &&
      inOrganization(user, masterOrganizationId, 'TEACHER')
  );
  const masterStudent = ordered.find(
    (user) =>
      identityKind(user) === 'Student' &&
      inOrganization(user, masterOrganizationId, 'STUDENT')
  );
  const masterAdmin = ordered.find(
    (user) => user.isAdmin && inOrganization(user, masterOrganizationId)
  );

  if (!masterTeacher || !masterStudent) {
    throw new Error(
      `${masterOrganizationId} must contain at least one teacher and one student`
    );
  }

  const rankById = new Map<string, number>();
  for (const kind of ['Admin', 'Teacher', 'Student', 'User'] as const) {
    ordered
      .filter((user) => identityKind(user) === kind)
      .forEach((user, index) => rankById.set(user.id, index + 1));
  }

  return ordered.map((user) => {
    const kind = identityKind(user);
    const rank = rankById.get(user.id)!;
    const slug = kind.toLowerCase();
    let email = `preview-${slug}-${padded(rank)}@example.test`;
    if (user.id === masterAdmin?.id) email = 'dev.admin@yawp.local';
    if (user.id === masterTeacher.id) email = 'dev.teacher@yawp.local';
    if (user.id === masterStudent.id) email = 'dev.student@yawp.local';
    return {
      id: user.id,
      name: `${kind} ${padded(rank)}`,
      email,
    };
  });
}

export function buildTeacherReferencePlan(values: Array<string | null>) {
  const originals = Array.from(
    new Set(values.filter((value): value is string => Boolean(value?.trim())))
  ).sort((a, b) => a.trim().localeCompare(b.trim()) || a.localeCompare(b));
  const normalized = Array.from(
    new Set(originals.map((value) => value.trim()))
  ).sort((a, b) => a.localeCompare(b));
  const replacementByNormalizedValue = new Map(
    normalized.map((value, index) => [
      value,
      `Teacher Reference ${padded(index + 1)}`,
    ])
  );
  return originals.map((original) => ({
    original,
    replacement: replacementByNormalizedValue.get(original.trim())!,
  }));
}

function assertLocalDatabase(databaseUrl: string) {
  const url = new URL(databaseUrl);
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    throw new Error(
      `Refusing to sanitize a non-local database host: ${url.hostname}`
    );
  }
}

async function tableHasColumn(
  client: Queryable,
  tableName: string,
  columnName: string
) {
  const result = await client.query<{ present: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = $1
         AND column_name = $2
     ) AS present`,
    [tableName, columnName]
  );
  return result.rows[0]?.present ?? false;
}

async function exactTableCounts(client: Queryable) {
  const tables = await client.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`
  );
  const counts: Record<string, number> = {};
  for (const { table_name: tableName } of tables.rows) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tableName)) {
      throw new Error(`Unsafe table name returned by Postgres: ${tableName}`);
    }
    const result = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "${tableName}"`
    );
    counts[tableName] = Number(result.rows[0]?.count ?? 0);
  }
  return counts;
}

async function identityFingerprints(client: Queryable) {
  const result = await client.query<{
    user_ids: string | null;
    membership_ids: string | null;
    class_ids: string | null;
    document_rows: string | null;
  }>(`
    SELECT
      (SELECT md5(COALESCE(string_agg(id, '' ORDER BY id), '')) FROM "User") AS user_ids,
      (SELECT md5(COALESCE(string_agg(id, '' ORDER BY id), '')) FROM "OrgMembership") AS membership_ids,
      (SELECT md5(COALESCE(string_agg(id, '' ORDER BY id), '')) FROM "Class") AS class_ids,
      (
        SELECT md5(COALESCE(string_agg(row_hash, '' ORDER BY id), ''))
        FROM (
          SELECT id, md5(to_jsonb(document_row)::text) AS row_hash
          FROM "Document" AS document_row
        ) AS document_hashes
      ) AS document_rows
  `);
  return result.rows[0];
}

async function loadUsers(client: Queryable): Promise<IdentitySourceUser[]> {
  const result = await client.query<{
    id: string;
    isAdmin: boolean;
    memberships: IdentitySourceUser['memberships'];
  }>(`
    SELECT
      u.id,
      u."isAdmin",
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'organizationId', membership."organizationId",
            'role', membership.role::text
          ) ORDER BY membership.id
        ) FILTER (WHERE membership.id IS NOT NULL),
        '[]'::jsonb
      ) AS memberships
    FROM "User" AS u
    LEFT JOIN "OrgMembership" AS membership ON membership."userId" = u.id
    GROUP BY u.id, u."isAdmin"
    ORDER BY u.id
  `);
  return result.rows;
}

async function updateTeacherReferences(
  client: Queryable,
  replacements: Array<{ original: string; replacement: string }>
) {
  if (replacements.length === 0) return;
  const tables = [
    'OrgMembership',
    'ProfileDuplicateForensic',
    'ProfileOrphanForensic',
    'StudentProfileForensic',
  ];
  for (const tableName of tables) {
    if (!(await tableHasColumn(client, tableName, 'schoolTeacher'))) continue;
    await client.query(
      `WITH replacements AS (
         SELECT *
         FROM jsonb_to_recordset($1::jsonb)
           AS replacement(original text, replacement text)
       )
       UPDATE "${tableName}" AS target
          SET "schoolTeacher" = replacements.replacement
         FROM replacements
        WHERE target."schoolTeacher" = replacements.original`,
      [JSON.stringify(replacements)]
    );
  }
}

async function assertSanitizedTeacherReferences(client: Queryable) {
  for (const tableName of [
    'OrgMembership',
    'ProfileDuplicateForensic',
    'ProfileOrphanForensic',
    'StudentProfileForensic',
  ]) {
    if (!(await tableHasColumn(client, tableName, 'schoolTeacher'))) continue;
    const violations = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM "${tableName}"
        WHERE NULLIF(trim("schoolTeacher"), '') IS NOT NULL
          AND "schoolTeacher" !~ '^Teacher Reference [0-9]{4,}$'`
    );
    if (Number(violations.rows[0]?.count ?? 0) !== 0) {
      throw new Error(
        `Sanitized teacher reference verification failed: ${tableName}`
      );
    }
  }
}

async function sanitizeDatabase(
  databaseUrl: string,
  masterOrganizationId: string
) {
  assertLocalDatabase(databaseUrl);
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const beforeCounts = await exactTableCounts(client);
    const beforeFingerprints = await identityFingerprints(client);
    const sourceUsers = await loadUsers(client);
    const identityPlan = buildSanitizedIdentityPlan(
      sourceUsers,
      masterOrganizationId
    );
    const originalEmailByUserId = new Map(
      (
        await client.query<{ id: string; email: string }>(
          `SELECT id, email FROM "User" ORDER BY id`
        )
      ).rows.map(({ id, email }) => [id, email])
    );
    const replacementEmailByOriginal = new Map(
      identityPlan.map((identity) => [
        originalEmailByUserId.get(identity.id)!,
        identity.email,
      ])
    );

    const teacherValues: Array<string | null> = [];
    for (const tableName of [
      'OrgMembership',
      'ProfileDuplicateForensic',
      'ProfileOrphanForensic',
      'StudentProfileForensic',
    ]) {
      if (!(await tableHasColumn(client, tableName, 'schoolTeacher'))) continue;
      const rows = await client.query<{ value: string | null }>(
        `SELECT DISTINCT "schoolTeacher" AS value FROM "${tableName}"`
      );
      teacherValues.push(...rows.rows.map(({ value }) => value));
    }
    const teacherReferencePlan = buildTeacherReferencePlan(teacherValues);

    const invitationRows = await client.query<{ id: string; target: string }>(
      `SELECT id, target FROM "Invitation" WHERE target LIKE '%@%' ORDER BY id`
    );
    const invitationPlan = invitationRows.rows.map((invitation, index) => ({
      id: invitation.id,
      target:
        replacementEmailByOriginal.get(invitation.target) ??
        `preview-invitation-${padded(index + 1)}@example.test`,
    }));

    await client.query('BEGIN');
    await client.query(`SET LOCAL lock_timeout = '5s'`);
    await client.query(`SET LOCAL statement_timeout = '10min'`);
    await client.query(
      `WITH replacements AS (
         SELECT *
         FROM jsonb_to_recordset($1::jsonb)
           AS replacement(id text, name text, email text)
       )
       UPDATE "User" AS target
          SET name = replacements.name,
              email = replacements.email
         FROM replacements
        WHERE target.id = replacements.id`,
      [JSON.stringify(identityPlan)]
    );
    await updateTeacherReferences(client, teacherReferencePlan);
    if (invitationPlan.length > 0) {
      await client.query(
        `WITH replacements AS (
           SELECT *
           FROM jsonb_to_recordset($1::jsonb)
             AS replacement(id text, target text)
         )
         UPDATE "Invitation" AS target
            SET target = replacements.target
           FROM replacements
          WHERE target.id = replacements.id`,
        [JSON.stringify(invitationPlan)]
      );
    }

    const identityViolations = await client.query<{ count: string }>(`
      SELECT count(*)::text AS count
      FROM "User"
      WHERE name !~ '^(Admin|Teacher|Student|User) [0-9]{4,}$'
         OR email !~ '^(dev\\.(admin|teacher|student)@yawp\\.local|preview-(admin|teacher|student|user)-[0-9]{4,}@example\\.test)$'
    `);
    if (Number(identityViolations.rows[0]?.count ?? 0) !== 0) {
      throw new Error('Sanitized user identity verification failed');
    }
    await assertSanitizedTeacherReferences(client);

    const invitationViolations = await client.query<{ count: string }>(`
      SELECT count(*)::text AS count
        FROM "Invitation"
       WHERE target LIKE '%@%'
         AND target !~ '^(dev\\.(admin|teacher|student)@yawp\\.local|preview-(admin|teacher|student|user)-[0-9]{4,}@example\\.test|preview-invitation-[0-9]{4,}@example\\.test)$'
    `);
    if (Number(invitationViolations.rows[0]?.count ?? 0) !== 0) {
      throw new Error('Sanitized invitation target verification failed');
    }

    const masterPersonas = await client.query<{ role: string; count: string }>(
      `SELECT membership.role::text AS role, count(*)::text AS count
         FROM "User" AS u
         JOIN "OrgMembership" AS membership ON membership."userId" = u.id
        WHERE membership."organizationId" = $1
          AND u.email IN ('dev.teacher@yawp.local', 'dev.student@yawp.local')
        GROUP BY membership.role::text`,
      [masterOrganizationId]
    );
    const masterRoles = new Map(
      masterPersonas.rows.map(({ role, count }) => [role, Number(count)])
    );
    if (!masterRoles.get('TEACHER') || !masterRoles.get('STUDENT')) {
      throw new Error('Sanitized preview dev-login personas are incomplete');
    }

    const afterCounts = await exactTableCounts(client);
    const afterFingerprints = await identityFingerprints(client);
    if (JSON.stringify(beforeCounts) !== JSON.stringify(afterCounts)) {
      throw new Error('Table row counts changed during identity sanitization');
    }
    if (
      JSON.stringify(beforeFingerprints) !== JSON.stringify(afterFingerprints)
    ) {
      throw new Error(
        'IDs or document rows changed during identity sanitization'
      );
    }
    await client.query('COMMIT');

    return {
      usersSanitized: identityPlan.length,
      invitationsSanitized: invitationPlan.length,
      teacherReferencesSanitized: teacherReferencePlan.length,
      tablesVerified: Object.keys(afterCounts).length,
      tableCounts: afterCounts,
      masterOrganizationId,
      fingerprints: afterFingerprints,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const masterOrganizationId =
    process.env.PREVIEW_ACCESS_MASTER_ORGANIZATION_ID?.trim() || 'default-org';
  const result = await sanitizeDatabase(databaseUrl, masterOrganizationId);
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.main) {
  await main();
}
