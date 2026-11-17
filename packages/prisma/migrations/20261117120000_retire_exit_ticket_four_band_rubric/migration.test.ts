import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(join(import.meta.dir, 'migration.sql'), 'utf8');

describe('retire the stock four-band Exit Ticket rubric', () => {
  test('clears only the stock understanding bands on exit ticket types', () => {
    expect(sql).toContain('UPDATE "AssignmentType"');
    expect(sql).toContain(`"kind" = 'exit_ticket'`);
    expect(sql).toContain(`"rubricJson" = NULL`);
    expect(sql).toContain(`"scoringScaleJson" = NULL`);
    expect(sql).toContain(`'{categories,0,bands,0,label}' = 'No evidence'`);
    expect(sql).toContain(`'{categories,0,bands,3,label}' = 'Explains it'`);
    expect(sql).toContain("SET lock_timeout = '5s'");
  });

  test('does not touch assignments, submissions, or other assignment types', () => {
    expect(sql).not.toMatch(/\b(DELETE|DROP|ALTER|TRUNCATE)\b/i);
    expect(sql).not.toContain('"Assignment"');
    expect(sql).not.toContain('"Submission"');
    expect(sql.match(/UPDATE/g)).toEqual(['UPDATE']);
  });
});
