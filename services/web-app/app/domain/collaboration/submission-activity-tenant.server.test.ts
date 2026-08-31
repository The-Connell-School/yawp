import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Client } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
let client: Client;

type Fixture = {
  assignmentId: string;
  assignmentTypeId: string;
  classAssignmentId: string;
  membershipId: string;
  organizationId: string;
};

async function findFixture(client: Client): Promise<Fixture> {
  const source = await client.query<{
    assignment_id: string;
    assignment_type_id: string;
    class_assignment_id: string;
    membership_id: string;
    organization_id: string;
  }>(`
    SELECT assignment.id AS assignment_id,
           assignment."assignmentTypeId" AS assignment_type_id,
           class_assignment.id AS class_assignment_id,
           membership.id AS membership_id,
           school."organizationId" AS organization_id
    FROM "ClassAssignment" AS class_assignment
    JOIN "Assignment" AS assignment
      ON assignment.id = class_assignment."assignmentId"
    JOIN "Class" AS class
      ON class.id = class_assignment."classId"
    JOIN "School" AS school
      ON school.id = class."schoolId"
    JOIN LATERAL (
      SELECT id
      FROM "OrgMembership"
      WHERE "organizationId" = school."organizationId"
      ORDER BY id
      LIMIT 1
    ) AS membership ON TRUE
    ORDER BY class_assignment.id
    LIMIT 1
  `);

  if (source.rows.length === 0) {
    throw new Error('Database has no collaborative submission fixture source');
  }

  const row = source.rows[0];
  return {
    assignmentId: row.assignment_id,
    assignmentTypeId: row.assignment_type_id,
    classAssignmentId: row.class_assignment_id,
    membershipId: row.membership_id,
    organizationId: row.organization_id,
  };
}

async function createGroupSubmission(
  client: Client,
  fixture: Fixture
) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const documentId = `collab-submit-document-${suffix}`;
  const groupId = `collab-submit-group-${suffix}`;
  const submissionId = `collab-submit-submission-${suffix}`;

  await client.query(
    `INSERT INTO "Document" (
       id, "artifactKind", "membershipId", "assignmentTypeId",
       "assignmentId", "classAssignmentId", title, text, html
     ) VALUES (
       $1, 'assignment-group', NULL, $2, $3, $4,
       'Expansion Plan', 'Shared draft', '<p>Shared draft</p>'
     )`,
    [
      documentId,
      fixture.assignmentTypeId,
      fixture.assignmentId,
      fixture.classAssignmentId,
    ]
  );
  await client.query(
    `INSERT INTO "DocumentGroup" (
       id, "classAssignmentId", kind, label, ordinal, "openedAt", "documentId"
     ) VALUES (
       $1, $2, 'assignment', 'Submission contract group',
       (SELECT COALESCE(MAX(ordinal), 0) + 100000
        FROM "DocumentGroup" WHERE "classAssignmentId" = $2),
       CURRENT_TIMESTAMP, $3
     )`,
    [groupId, fixture.classAssignmentId, documentId]
  );
  await client.query(
    `INSERT INTO "Submission" (
       id, title, text, html, "submittedAt", "documentId"
     ) VALUES (
       $1, 'Expansion Plan', 'Shared draft', '<p>Shared draft</p>',
       CURRENT_TIMESTAMP, $2
     )`,
    [submissionId, documentId]
  );

  return { documentId, groupId, submissionId };
}

async function createStudentSubmission(client: Client, fixture: Fixture) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const documentId = `student-submit-document-${suffix}`;
  const submissionId = `student-submit-submission-${suffix}`;

  await client.query(
    `INSERT INTO "Document" (
       id, "artifactKind", "membershipId", "assignmentTypeId",
       title, text, html
     ) VALUES (
       $1, 'student', $2, $3,
       'Student Essay', 'Student draft', '<p>Student draft</p>'
     )`,
    [documentId, fixture.membershipId, fixture.assignmentTypeId]
  );
  await client.query(
    `INSERT INTO "Submission" (
       id, title, text, html, "submittedAt", "documentId"
     ) VALUES (
       $1, 'Student Essay', 'Student draft', '<p>Student draft</p>',
       CURRENT_TIMESTAMP, $2
     )`,
    [submissionId, documentId]
  );

  return { documentId, submissionId };
}

async function createOtherTenantFixture(
  client: Client,
  source: Fixture
): Promise<Fixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const organizationId = `tenant-contract-org-${suffix}`;
  const schoolId = `tenant-contract-school-${suffix}`;
  const classId = `tenant-contract-class-${suffix}`;
  const assignmentId = `tenant-contract-assignment-${suffix}`;
  const classAssignmentId = `tenant-contract-deployment-${suffix}`;

  await client.query(
    `INSERT INTO "Organization" (id, name)
     VALUES ($1, 'Tenant contract organization')`,
    [organizationId]
  );
  await client.query(
    `INSERT INTO "School" (id, name, code, "organizationId")
     VALUES ($1, 'Tenant contract school', $2, $3)`,
    [schoolId, `TENANT-${suffix}`, organizationId]
  );
  await client.query(
    `INSERT INTO "Class" (id, code, "schoolId") VALUES ($1, $2, $3)`,
    [classId, `CLASS-${suffix}`, schoolId]
  );
  await client.query(
    `INSERT INTO "Assignment" (
       id, "assignmentTypeId", title, prompt, "collaborationEnabled"
     ) VALUES ($1, $2, 'Tenant contract assignment', 'Write together.', true)`,
    [assignmentId, source.assignmentTypeId]
  );
  await client.query(
    `INSERT INTO "ClassAssignment" (id, "assignmentId", "classId")
     VALUES ($1, $2, $3)`,
    [classAssignmentId, assignmentId, classId]
  );

  return {
    assignmentId,
    assignmentTypeId: source.assignmentTypeId,
    classAssignmentId,
    membershipId: source.membershipId,
    organizationId,
  };
}

async function insertActivity({
  client,
  submissionId,
  organizationId,
  source,
}: {
  client: Client;
  submissionId: string;
  organizationId: string;
  source: string;
}) {
  return client.query(
    `INSERT INTO "SubmissionActivity" (
       id, "submissionId", "organizationId", "actorType",
       "eventType", source, changes
     ) VALUES (
       $1, $2, $3, 'system', 'submission.created', $4, '{}'::jsonb
     )`,
    [
      `submission-activity-${Date.now()}-${Math.random()}`,
      submissionId,
      organizationId,
      source,
    ]
  );
}

async function waitForMembershipAdvisoryLock(
  probe: Client,
  backendPid: number,
  membershipId: string
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const lock = await probe.query<{ held: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM pg_locks
         WHERE pid = $1
           AND locktype = 'advisory'
           AND classid = 81202
           AND objid = (
             (hashtext($2)::bigint + 4294967296) % 4294967296
           )
           AND granted
       ) AS held`,
      [backendPid, membershipId]
    );
    if (lock.rows[0]?.held) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for the membership advisory lock');
}

async function expectNoMembershipLockDeadlock({
  guardClient,
  membershipClient,
  guardQuery,
  membershipId,
}: {
  guardClient: Client;
  membershipClient: Client;
  guardQuery: () => Promise<unknown>;
  membershipId: string;
}) {
  await guardClient.query(`SET LOCAL deadlock_timeout = '100ms'`);
  await guardClient.query(`SET LOCAL statement_timeout = '3s'`);
  await membershipClient.query(`SET LOCAL deadlock_timeout = '100ms'`);
  await membershipClient.query(`SET LOCAL statement_timeout = '3s'`);
  await membershipClient.query(
    `SELECT id FROM "OrgMembership" WHERE id = $1 FOR UPDATE`,
    [membershipId]
  );

  const backend = await guardClient.query<{ pid: number }>(
    `SELECT pg_backend_pid() AS pid`
  );
  const guardedUpdate = guardQuery();
  await waitForMembershipAdvisoryLock(
    client,
    backend.rows[0].pid,
    membershipId
  );
  const membershipUpdate = membershipClient.query(
    `UPDATE "OrgMembership"
     SET "organizationId" = "organizationId"
     WHERE id = $1`,
    [membershipId]
  );

  const errors: Error[] = [];
  try {
    await guardedUpdate;
    await guardClient.query('COMMIT');
  } catch (error) {
    errors.push(error as Error);
    await guardClient.query('ROLLBACK');
  }
  try {
    await membershipUpdate;
    await membershipClient.query('ROLLBACK');
  } catch (error) {
    errors.push(error as Error);
    await membershipClient.query('ROLLBACK');
  }

  expect(errors.map((error) => error.message)).toEqual([]);
}

async function cleanupStudentSubmissions(
  submissionIds: string[],
  documentIds: string[]
) {
  await client.query('BEGIN');
  try {
    await client.query(
      `SET LOCAL yawp.submission_activity_cleanup = 'on'`
    );
    await client.query(
      `DELETE FROM "SubmissionActivity"
       WHERE "submissionId" = ANY($1::text[])`,
      [submissionIds]
    );
    await client.query(
      `DELETE FROM "Submission" WHERE id = ANY($1::text[])`,
      [submissionIds]
    );
    await client.query(
      `DELETE FROM "Document" WHERE id = ANY($1::text[])`,
      [documentIds]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

beforeAll(() => {
  if (!DATABASE_URL?.trim()) throw new Error('DATABASE_URL is required');
  client = new Client({ connectionString: DATABASE_URL });
  return client.connect();
});

afterAll(async () => {
  await client.end();
});

describe('collaborative submission activity tenant guard', () => {
  test('accepts activity for an assignment-owned draft in the class organization', async () => {
    try {
      await client.query('BEGIN');
      const fixture = await findFixture(client);
      const { submissionId } = await createGroupSubmission(client, fixture);

      await expect(
        client.query(
          `INSERT INTO "SubmissionActivity" (
             id, "submissionId", "organizationId", "actorMembershipId",
             "actorType", "eventType", source, changes
           ) VALUES (
             $1, $2, $3, $4, 'membership', 'submission.created',
             'collab-submit', '{}'::jsonb
           )`,
          [
            `collab-submit-activity-${Date.now()}`,
            submissionId,
            fixture.organizationId,
            fixture.membershipId,
          ]
        )
      ).resolves.toBeDefined();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  test('rejects activity when an assignment-owned draft is attributed to another organization', async () => {
    try {
      await client.query('BEGIN');
      const fixture = await findFixture(client);
      const { submissionId } = await createGroupSubmission(client, fixture);
      const otherOrganization = await client.query<{ id: string }>(
        `SELECT id FROM "Organization" WHERE id <> $1 ORDER BY id LIMIT 1`,
        [fixture.organizationId]
      );
      if (otherOrganization.rows.length === 0) {
        throw new Error('Database needs two organizations for tenant proof');
      }

      await expect(
        client.query(
          `INSERT INTO "SubmissionActivity" (
             id, "submissionId", "organizationId", "actorType",
             "eventType", source, changes
           ) VALUES (
             $1, $2, $3, 'system', 'submission.created',
             'collab-submit', '{}'::jsonb
           )`,
          [
            `cross-tenant-collab-submit-activity-${Date.now()}`,
            submissionId,
            otherOrganization.rows[0].id,
          ]
        )
      ).rejects.toThrow(/organization must match submission tenant/i);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  test('preserves the student-document tenant path', async () => {
    try {
      await client.query('BEGIN');
      const fixture = await findFixture(client);
      const { submissionId } = await createStudentSubmission(client, fixture);

      await expect(
        insertActivity({
          client,
          submissionId,
          organizationId: fixture.organizationId,
          source: 'student-submit-contract',
        })
      ).resolves.toBeDefined();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  test('still rejects a cross-tenant student activity', async () => {
    try {
      await client.query('BEGIN');
      const fixture = await findFixture(client);
      const otherOrganization = await client.query<{ id: string }>(
        `SELECT id FROM "Organization" WHERE id <> $1 ORDER BY id LIMIT 1`,
        [fixture.organizationId]
      );
      if (otherOrganization.rows.length === 0) {
        throw new Error('Database needs two organizations for tenant proof');
      }
      const { submissionId } = await createStudentSubmission(client, fixture);

      await expect(
        insertActivity({
          client,
          submissionId,
          organizationId: otherOrganization.rows[0].id,
          source: 'cross-tenant-student-submit-contract',
        })
      ).rejects.toThrow(/organization must match submission tenant/i);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  test('rejects moving an audited group submission to another tenant document', async () => {
    try {
      await client.query('BEGIN');
      const sourceFixture = await findFixture(client);
      const targetFixture = await createOtherTenantFixture(
        client,
        sourceFixture
      );
      const source = await createGroupSubmission(client, sourceFixture);
      const target = await createGroupSubmission(client, targetFixture);
      await insertActivity({
        client,
        submissionId: source.submissionId,
        organizationId: sourceFixture.organizationId,
        source: 'group-submit-handoff-contract',
      });

      await expect(
        client.query(
          `UPDATE "Submission" SET "documentId" = $1 WHERE id = $2`,
          [target.documentId, source.submissionId]
        )
      ).rejects.toThrow(/cannot move an audited submission/i);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  test('rejects reparenting an audited group document into another tenant', async () => {
    try {
      await client.query('BEGIN');
      const sourceFixture = await findFixture(client);
      const targetFixture = await createOtherTenantFixture(
        client,
        sourceFixture
      );
      const source = await createGroupSubmission(client, sourceFixture);
      await insertActivity({
        client,
        submissionId: source.submissionId,
        organizationId: sourceFixture.organizationId,
        source: 'group-document-reparent-contract',
      });

      await client.query(
        `UPDATE "DocumentGroup"
         SET "classAssignmentId" = $1,
             ordinal = (
               SELECT COALESCE(MAX(ordinal), 0) + 200000
               FROM "DocumentGroup"
               WHERE "classAssignmentId" = $1
             )
         WHERE id = $2`,
        [targetFixture.classAssignmentId, source.groupId]
      );

      await expect(
        client.query(
          `UPDATE "Document"
           SET "classAssignmentId" = $1,
               "assignmentId" = $2,
               "assignmentTypeId" = $3
           WHERE id = $4`,
          [
            targetFixture.classAssignmentId,
            targetFixture.assignmentId,
            targetFixture.assignmentTypeId,
            source.documentId,
          ]
        )
      ).rejects.toThrow(
        /cannot move a document with durable submission activity/i
      );
    } finally {
      await client.query('ROLLBACK');
    }
  });

  test('does not deadlock a student document move with a membership update', async () => {
    const guardClient = new Client({ connectionString: DATABASE_URL });
    const membershipClient = new Client({ connectionString: DATABASE_URL });
    const submissionIds: string[] = [];
    const documentIds: string[] = [];
    try {
      await client.query('BEGIN');
      const fixture = await findFixture(client);
      const peer = await client.query<{ id: string }>(
        `SELECT id
         FROM "OrgMembership"
         WHERE "organizationId" = $1 AND id <> $2
         ORDER BY id
         LIMIT 1`,
        [fixture.organizationId, fixture.membershipId]
      );
      if (!peer.rows[0]) {
        throw new Error('Database needs two same-tenant memberships');
      }
      const source = await createStudentSubmission(client, fixture);
      submissionIds.push(source.submissionId);
      documentIds.push(source.documentId);
      await insertActivity({
        client,
        submissionId: source.submissionId,
        organizationId: fixture.organizationId,
        source: 'db-proof',
      });
      await client.query('COMMIT');

      await Promise.all([guardClient.connect(), membershipClient.connect()]);
      await Promise.all([
        guardClient.query('BEGIN'),
        membershipClient.query('BEGIN'),
      ]);
      await expectNoMembershipLockDeadlock({
        guardClient,
        membershipClient,
        membershipId: fixture.membershipId,
        guardQuery: () =>
          guardClient.query(
            `UPDATE "Document" SET "membershipId" = $1 WHERE id = $2`,
            [peer.rows[0].id, source.documentId]
          ),
      });
    } finally {
      await Promise.allSettled([
        guardClient.query('ROLLBACK'),
        membershipClient.query('ROLLBACK'),
      ]);
      await Promise.allSettled([
        guardClient.end(),
        membershipClient.end(),
      ]);
      await cleanupStudentSubmissions(submissionIds, documentIds);
    }
  });

  test('does not deadlock a student submission handoff with a membership update', async () => {
    const guardClient = new Client({ connectionString: DATABASE_URL });
    const membershipClient = new Client({ connectionString: DATABASE_URL });
    const submissionIds: string[] = [];
    const documentIds: string[] = [];
    try {
      await client.query('BEGIN');
      const fixture = await findFixture(client);
      const source = await createStudentSubmission(client, fixture);
      const target = await createStudentSubmission(client, fixture);
      submissionIds.push(source.submissionId, target.submissionId);
      documentIds.push(source.documentId, target.documentId);
      await insertActivity({
        client,
        submissionId: source.submissionId,
        organizationId: fixture.organizationId,
        source: 'db-proof',
      });
      await client.query('COMMIT');

      await Promise.all([guardClient.connect(), membershipClient.connect()]);
      await Promise.all([
        guardClient.query('BEGIN'),
        membershipClient.query('BEGIN'),
      ]);
      await expectNoMembershipLockDeadlock({
        guardClient,
        membershipClient,
        membershipId: fixture.membershipId,
        guardQuery: () =>
          guardClient.query(
            `UPDATE "Submission" SET "documentId" = $1 WHERE id = $2`,
            [target.documentId, source.submissionId]
          ),
      });
    } finally {
      await Promise.allSettled([
        guardClient.query('ROLLBACK'),
        membershipClient.query('ROLLBACK'),
      ]);
      await Promise.allSettled([
        guardClient.end(),
        membershipClient.end(),
      ]);
      await cleanupStudentSubmissions(submissionIds, documentIds);
    }
  });
});
