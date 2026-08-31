import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
let pool: pg.Pool;

async function createFixture(client: pg.PoolClient) {
  const source = await client.query<{
    class_assignment_id: string;
    assignment_id: string;
    assignment_type_id: string;
    membership_id: string;
  }>(`
    SELECT class_assignment.id AS class_assignment_id,
           assignment.id AS assignment_id,
           assignment."assignmentTypeId" AS assignment_type_id,
           membership.id AS membership_id
    FROM "ClassAssignment" AS class_assignment
    JOIN "Assignment" AS assignment ON assignment.id = class_assignment."assignmentId"
    CROSS JOIN LATERAL (
      SELECT id FROM "OrgMembership" ORDER BY id LIMIT 1
    ) AS membership
    ORDER BY class_assignment.id
    LIMIT 1
  `);
  if (source.rows.length === 0)
    throw new Error('Database has no fixture source rows');
  const row = source.rows[0];
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const documentId = `contract-document-${suffix}`;
  const groupId = `contract-group-${suffix}`;

  await client.query(
    `INSERT INTO "Document" (
      id, "artifactKind", "membershipId", "assignmentTypeId",
      "assignmentId", "classAssignmentId", title, text, html
    ) VALUES ($1, 'assignment-group', NULL, $2, $3, $4, '', '', '')`,
    [
      documentId,
      row.assignment_type_id,
      row.assignment_id,
      row.class_assignment_id,
    ]
  );
  await client.query(
    `INSERT INTO "DocumentGroup" (
      id, "classAssignmentId", kind, label, ordinal, "openedAt", "documentId"
    ) VALUES (
      $1, $2, 'assignment', 'Contract group',
      (SELECT COALESCE(MAX(ordinal), 0) + 100000 FROM "DocumentGroup" WHERE "classAssignmentId" = $2),
      CURRENT_TIMESTAMP, $3
    )`,
    [groupId, row.class_assignment_id, documentId]
  );
  await client.query(
    `INSERT INTO "DocumentGroupMember" (id, "groupId", "membershipId")
     VALUES ($1, $2, $3)`,
    [`contract-member-${suffix}`, groupId, row.membership_id]
  );

  return {
    documentId,
    groupId,
    membershipId: row.membership_id,
    classAssignmentId: row.class_assignment_id,
    assignmentId: row.assignment_id,
  };
}

beforeAll(() => {
  if (!DATABASE_URL?.trim()) throw new Error('DATABASE_URL is required');
  pool = new pg.Pool({ connectionString: DATABASE_URL });
});

afterAll(async () => {
  await pool.end();
});

describe('assignment-owned collaborative artifact contracts', () => {
  test('database ownership constraints are installed', async () => {
    const { rows } = await pool.query<{ constraint_name: string }>(`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_schema = current_schema()
        AND constraint_name IN (
          'Document_artifact_ownership_check',
          'DocumentGroup_assignment_only_check',
          'DocumentGroup_opened_artifact_check'
        )
      ORDER BY constraint_name
    `);

    expect(rows.map((row) => row.constraint_name)).toEqual([
      'DocumentGroup_assignment_only_check',
      'DocumentGroup_opened_artifact_check',
      'Document_artifact_ownership_check',
    ]);
  });

  test('every assignment-group artifact is ownerless and linked to one assignment group', async () => {
    const { rows } = await pool.query<{ invalid_count: number }>(`
      SELECT COUNT(*)::int AS invalid_count
      FROM "Document" AS document
      LEFT JOIN "DocumentGroup" AS group_row
        ON group_row."documentId" = document."id"
      WHERE document."artifactKind" = 'assignment-group'
        AND (
          document."membershipId" IS NOT NULL
          OR document."assignmentId" IS NULL
          OR document."classAssignmentId" IS NULL
          OR group_row."id" IS NULL
          OR group_row."classAssignmentId" <> document."classAssignmentId"
        )
    `);
    expect(rows[0].invalid_count).toBe(0);
  });

  test('removing a student membership cannot delete the assignment-owned artifact', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const fixture = await createFixture(client);

      await client.query('DELETE FROM "OrgMembership" WHERE id = $1', [
        fixture.membershipId,
      ]);
      const artifact = await client.query(
        'SELECT 1 FROM "Document" WHERE id = $1',
        [fixture.documentId]
      );
      expect(artifact.rowCount).toBe(1);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  test('deleting a group deletes its owned artifact instead of orphaning it', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const fixture = await createFixture(client);

      await client.query('DELETE FROM "DocumentGroup" WHERE id = $1', [
        fixture.groupId,
      ]);
      const artifact = await client.query(
        'SELECT 1 FROM "Document" WHERE id = $1',
        [fixture.documentId]
      );
      expect(artifact.rowCount).toBe(0);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  test('an owned artifact cannot be deleted behind its group', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const fixture = await createFixture(client);

      await expect(
        client.query('DELETE FROM "Document" WHERE id = $1', [
          fixture.documentId,
        ])
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  test('a finalized group cannot detach or replace its owned artifact', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const fixture = await createFixture(client);

      await client.query(
        'UPDATE "DocumentGroup" SET "documentId" = NULL, "openedAt" = NULL WHERE id = $1',
        [fixture.groupId]
      );
      await expect(
        client.query('SET CONSTRAINTS ALL IMMEDIATE')
      ).rejects.toThrow(
        /cannot detach or replace|must have exactly one matching assignment group owner/i
      );
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  test('an owned artifact cannot be retyped as student work', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const fixture = await createFixture(client);

      await client.query(
        `UPDATE "Document"
         SET "artifactKind" = 'student', "membershipId" = $1
         WHERE id = $2`,
        [fixture.membershipId, fixture.documentId]
      );
      await expect(
        client.query('SET CONSTRAINTS ALL IMMEDIATE')
      ).rejects.toThrow(
        /cannot be retyped|must reference its matching assignment-group artifact/i
      );
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  test('an assignment with shared artifacts cannot change assignment type', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const fixture = await createFixture(client);
      const otherType = await client.query<{ id: string }>(
        `SELECT id FROM "AssignmentType"
         WHERE id <> (SELECT "assignmentTypeId" FROM "Assignment" WHERE id = $1)
         ORDER BY id LIMIT 1`,
        [fixture.assignmentId]
      );
      if (otherType.rows.length === 0)
        throw new Error('Need two assignment types');

      await expect(
        client.query(
          'UPDATE "Assignment" SET "assignmentTypeId" = $1 WHERE id = $2',
          [otherType.rows[0].id, fixture.assignmentId]
        )
      ).rejects.toThrow(/cannot change type/i);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  test('a collaborative assignment cannot change type before finalization', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const source = await client.query<{
        assignment_id: string;
        assignment_type_id: string;
      }>(`
        SELECT assignment.id AS assignment_id,
               assignment."assignmentTypeId" AS assignment_type_id
        FROM "Assignment" AS assignment
        WHERE NOT EXISTS (
          SELECT 1
          FROM "ClassAssignment" AS deployment
          JOIN "DocumentGroup" AS group_row
            ON group_row."classAssignmentId" = deployment.id
          WHERE deployment."assignmentId" = assignment.id
            AND group_row."documentId" IS NOT NULL
        )
        ORDER BY assignment.id
        LIMIT 1
      `);
      if (source.rows.length === 0)
        throw new Error('Need an assignment without shared artifacts');
      const otherType = await client.query<{ id: string }>(
        'SELECT id FROM "AssignmentType" WHERE id <> $1 ORDER BY id LIMIT 1',
        [source.rows[0].assignment_type_id]
      );
      if (otherType.rows.length === 0)
        throw new Error('Need two assignment types');

      await client.query(
        'UPDATE "Assignment" SET "collaborationEnabled" = true WHERE id = $1',
        [source.rows[0].assignment_id]
      );
      await expect(
        client.query(
          'UPDATE "Assignment" SET "assignmentTypeId" = $1 WHERE id = $2',
          [otherType.rows[0].id, source.rows[0].assignment_id]
        )
      ).rejects.toThrow(/cannot change type/i);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  test('a deployment with shared artifacts cannot change assignment owner', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const fixture = await createFixture(client);
      const otherAssignment = await client.query<{ id: string }>(
        'SELECT id FROM "Assignment" WHERE id <> $1 ORDER BY id LIMIT 1',
        [fixture.assignmentId]
      );
      if (otherAssignment.rows.length === 0)
        throw new Error('Need two assignments');

      await expect(
        client.query(
          'UPDATE "ClassAssignment" SET "assignmentId" = $1 WHERE id = $2',
          [otherAssignment.rows[0].id, fixture.classAssignmentId]
        )
      ).rejects.toThrow(/cannot change owner/i);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  test('a group cannot point at an artifact from a different assignment graph', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const fixture = await createFixture(client);
      const other = await client.query<{ id: string }>(
        'SELECT id FROM "ClassAssignment" WHERE id <> $1 ORDER BY id LIMIT 1',
        [fixture.classAssignmentId]
      );
      if (other.rows.length === 0)
        throw new Error('Need two class assignments');

      await client.query(
        'UPDATE "Document" SET "classAssignmentId" = $1 WHERE id = $2',
        [other.rows[0].id, fixture.documentId]
      );
      await expect(
        client.query('SET CONSTRAINTS ALL IMMEDIATE')
      ).rejects.toThrow(
        /matching assignment-group artifact|matching assignment group owner/
      );
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  test('deleting a class assignment cascades its owned artifact', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const fixture = await createFixture(client);
      await client.query('DELETE FROM "ClassAssignment" WHERE id = $1', [
        fixture.classAssignmentId,
      ]);
      const artifact = await client.query(
        'SELECT 1 FROM "Document" WHERE id = $1',
        [fixture.documentId]
      );
      expect(artifact.rowCount).toBe(0);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  test('deleting an assignment cascades its owned artifacts through class assignments', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const fixture = await createFixture(client);
      await client.query('DELETE FROM "Assignment" WHERE id = $1', [
        fixture.assignmentId,
      ]);
      const artifact = await client.query(
        'SELECT 1 FROM "Document" WHERE id = $1',
        [fixture.documentId]
      );
      expect(artifact.rowCount).toBe(0);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
