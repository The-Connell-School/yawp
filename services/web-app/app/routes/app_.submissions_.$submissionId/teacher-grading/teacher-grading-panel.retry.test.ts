import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const panelPath = path.join(
  import.meta.dir,
  'teacher-grading-panel.tsx'
);

describe('submission teacher grading panel LLM retry UI', () => {
  test('uses the shared retry helper and shows retrying copy during fallback', () => {
    const source = fs.readFileSync(panelPath, 'utf8');

    expect(source).toContain('isLlmRetryResponse');
    expect(source).toContain('cloneFormDataWithFallbackRetry');
    expect(source).toContain("isAiRetrying ? 'Retrying...' : 'Grading...'");
  });
});
