import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Exit Ticket joins the free classroom bundle (FREE_CLASSROOM_ASSIGNMENT_QUOTAS).
// New free classrooms get it at provisioning; this links it for the ones that
// already exist, so their Exit Ticket tile has a type behind it.
const sql = readFileSync(join(import.meta.dir, 'migration.sql'), 'utf8');
const rollback = readFileSync(join(import.meta.dir, 'rollback.sql'), 'utf8');

describe('free classroom Exit Ticket link migration', () => {
  test('links the Exit Ticket type to every free classroom org, once', () => {
    expect(sql).toContain('INSERT INTO "OrganizationAssignmentType"');
    expect(sql).toContain(`o."plan" = 'FREE_CLASSROOM'`);
    expect(sql).toContain(`t."kind" = 'exit_ticket'`);
    expect(sql).toContain(
      'ON CONFLICT ("organizationId", "assignmentTypeId") DO NOTHING'
    );
    expect(sql).toContain("SET lock_timeout = '5s'");
  });

  test('only adds rows: no update, delete or schema change', () => {
    expect(sql).not.toMatch(/\b(UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i);
  });

  test('rollback removes only those links', () => {
    expect(rollback).toContain('DELETE FROM "OrganizationAssignmentType"');
    expect(rollback).toContain(`o."plan" = 'FREE_CLASSROOM'`);
    expect(rollback).toContain(`t."kind" = 'exit_ticket'`);
    expect(rollback).not.toMatch(/\b(DROP|ALTER|TRUNCATE)\b/i);
  });
});
