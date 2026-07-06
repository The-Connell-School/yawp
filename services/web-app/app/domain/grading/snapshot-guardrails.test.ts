import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const workspaceRoot = path.resolve(import.meta.dir, '../../../../..');
const schemaPath = path.join(workspaceRoot, 'packages/prisma/schema.prisma');
const routesPath = path.join(workspaceRoot, 'services/web-app/app/routes');

function listFilesRecursively(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursively(fullPath));
      continue;
    }
    if (entry.isFile()) files.push(fullPath);
  }

  return files;
}

describe('submission guardrails', () => {
  test('submission schema links to document with Restrict delete', () => {
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Submission should reference Document via documentId
    expect(schema).toMatch(/model Submission \{/);
    expect(schema).toMatch(
      /document\s+Document\s+@relation\(fields:\s*\[documentId\],\s*references:\s*\[id\],\s*onDelete:\s*Restrict\)/
    );
  });

  test('documents and submissions can be marked as AI sandbox records', () => {
    const schema = fs.readFileSync(schemaPath, 'utf8');

    expect(schema).toMatch(/model Document \{[\s\S]*isAiSandbox\s+Boolean\s+@default\(false\)/);
    expect(schema).toMatch(/model Document \{[\s\S]*aiSandboxRunId\s+String\?\s+@unique/);
    expect(schema).toMatch(/model Submission \{[\s\S]*isAiSandbox\s+Boolean\s+@default\(false\)/);
    expect(schema).toMatch(/model Submission \{[\s\S]*aiSandboxRunId\s+String\?\s+@unique/);
  });

  test('old Grade/DocumentSnapshot models are removed from schema', () => {
    const schema = fs.readFileSync(schemaPath, 'utf8');

    expect(schema).not.toMatch(/model Grade \{/);
    expect(schema).not.toMatch(/model DocumentSnapshot \{/);
    expect(schema).not.toMatch(/model GradeComment \{/);
    expect(schema).not.toMatch(/model GradeCommentResponse \{/);
  });

  test('app routes do not reference deleted models', () => {
    const files = listFilesRecursively(routesPath).filter(
      (file) => file.endsWith('.ts') || file.endsWith('.tsx')
    );

    const offenders: string[] = [];
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      if (
        source.includes('prisma.documentSnapshot.') ||
        source.includes('prisma.grade.') ||
        source.includes('prisma.gradeComment.')
      ) {
        offenders.push(path.relative(workspaceRoot, file));
      }
    }

    expect(offenders).toEqual([]);
  });
});
