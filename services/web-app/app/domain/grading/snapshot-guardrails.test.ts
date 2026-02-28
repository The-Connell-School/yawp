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

describe('snapshot guardrails', () => {
  test('grade schema decouples from hard snapshot FK', () => {
    const schema = fs.readFileSync(schemaPath, 'utf8');

    expect(schema).toMatch(/documentId\s+String/);
    expect(schema).toMatch(
      /document\s+Document\s+@relation\(fields:\s*\[documentId\],\s*references:\s*\[id\],\s*onDelete:\s*Restrict\)/
    );
    expect(schema).toMatch(/snapshotId\s+String\?/);
    expect(schema).toMatch(
      /snapshot\s+DocumentSnapshot\?\s+@relation\(fields:\s*\[snapshotId\],\s*references:\s*\[id\],\s*onDelete:\s*SetNull\)/
    );
    expect(schema).not.toMatch(
      /snapshot\s+DocumentSnapshot\s+@relation\(fields:\s*\[snapshotId\],\s*references:\s*\[id\],\s*onDelete:\s*Cascade\)/
    );
  });

  test('app routes do not hard-delete document snapshots', () => {
    const files = listFilesRecursively(routesPath).filter(
      (file) => file.endsWith('.ts') || file.endsWith('.tsx')
    );

    const offenders: string[] = [];
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      if (source.includes('documentSnapshot.deleteMany(')) {
        offenders.push(path.relative(workspaceRoot, file));
      }
    }

    expect(offenders).toEqual([]);
  });
});
