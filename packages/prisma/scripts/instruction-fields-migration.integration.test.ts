import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';

const connection =
  process.env.INTERNAL_DIRECTORY_TEST_DATABASE_URL ?? process.env.DATABASE_URL;

test.skipIf(!connection)(
  'instruction field migration preserves existing rows and adds nullable text without defaults',
  async () => {
    const database = new URL(connection!);
    if (
      !['localhost', '127.0.0.1'].includes(database.hostname) ||
      !database.pathname.startsWith('/yawp_')
    ) {
      throw new Error(
        'Instruction migration proof requires isolated local Postgres'
      );
    }
    const client = new Client({ connectionString: connection });
    await client.connect();
    try {
      await client.query('BEGIN');
      // A temporary historical table shadows the real table for this connection.
      // Running the exact migration here proves its effect on a preexisting tuple.
      await client.query(
        'CREATE TEMP TABLE "AssignmentModuleInstruction" (id TEXT PRIMARY KEY, title TEXT NOT NULL, prompt TEXT NOT NULL) ON COMMIT DROP'
      );
      await client.query(
        `INSERT INTO "AssignmentModuleInstruction" VALUES ('legacy-step', 'Original title', 'Original prompt')`
      );
      const before = (
        await client.query(
          'SELECT to_jsonb(t) AS row, xmin::text AS version FROM "AssignmentModuleInstruction" t'
        )
      ).rows[0];
      const sql = await readFile(
        new URL(
          '../migrations/20261019030000_instruction_answer_key_next_button_label/migration.sql',
          import.meta.url
        ),
        'utf8'
      );
      await client.query(sql);
      const after = (
        await client.query(
          'SELECT to_jsonb(t) AS row, xmin::text AS version FROM "AssignmentModuleInstruction" t'
        )
      ).rows[0];
      expect(after).toEqual({
        row: { ...before.row, answerKey: null, nextButtonLabel: null },
        version: before.version,
      });
      const columns = (
        await client.query(`
      SELECT attname, atttypid::regtype::text AS type, attnotnull, atthasdef
      FROM pg_attribute WHERE attrelid = 'pg_temp."AssignmentModuleInstruction"'::regclass
      AND attname IN ('answerKey', 'nextButtonLabel') ORDER BY attname
    `)
      ).rows;
      expect(columns).toEqual([
        {
          attname: 'answerKey',
          type: 'text',
          attnotnull: false,
          atthasdef: false,
        },
        {
          attname: 'nextButtonLabel',
          type: 'text',
          attnotnull: false,
          atthasdef: false,
        },
      ]);
      await client.query(
        `UPDATE "AssignmentModuleInstruction" SET "answerKey" = 'Saved key', "nextButtonLabel" = 'Continue'`
      );
      expect(
        (
          await client.query(
            'SELECT "answerKey", "nextButtonLabel" FROM "AssignmentModuleInstruction"'
          )
        ).rows
      ).toEqual([{ answerKey: 'Saved key', nextButtonLabel: 'Continue' }]);
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  }
);
