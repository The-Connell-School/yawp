import { describe, expect, test } from 'bun:test';
import { summarizePrismaQueryForLog } from './prisma-query-log.server';

describe('summarizePrismaQueryForLog', () => {
  test('labels verb, tables, and param count without raw string literals', () => {
    const query = `
      INSERT INTO "public"."Setting" ("id","name","value")
      VALUES ($1,$2,'secret-value', 'teacher@school.edu')
    `;
    const summary = summarizePrismaQueryForLog(query);
    expect(summary).toMatch(/^INSERT Setting 2p \|/);
    expect(summary).not.toContain('secret-value');
    expect(summary).not.toContain('teacher@school.edu');
    expect(summary).toContain("'[redacted]'");
  });

  test('redacts emails embedded in SQL text', () => {
    const query =
      "UPDATE \"User\" SET email = 'alice@example.com' WHERE id = $1";
    const summary = summarizePrismaQueryForLog(query);
    expect(summary).not.toContain('alice@example.com');
    expect(summary).toContain("'[redacted]'");
  });

  test('truncates very long queries', () => {
    const query = `SELECT ${'x'.repeat(400)} FROM "Class" WHERE id = $1`;
    const summary = summarizePrismaQueryForLog(query);
    expect(summary.length).toBeLessThan(280);
    expect(summary.endsWith('…')).toBe(true);
  });
});
