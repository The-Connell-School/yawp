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

  return { submissionId };
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
});
