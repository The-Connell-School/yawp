import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const panelPath = path.join(
  import.meta.dir,
  'teacher-grading-panel.tsx'
);

describe('submission teacher grading panel LLM retry UI', () => {
  test('does not claim a fallback-retry capability that no longer exists', () => {
    // Grading now runs with allowFallbackProvider: false and no client-side
    // retry-onto-fallback wiring - there is no other provider to fall back
    // to, so this panel must not reference the removed retry helpers or
    // show "Retrying..." copy that could never actually fire.
    const source = fs.readFileSync(panelPath, 'utf8');

    expect(source).not.toContain('isLlmRetryResponse');
    expect(source).not.toContain('cloneFormDataWithFallbackRetry');
    expect(source).not.toContain('isAiRetrying');
    expect(source).not.toContain('Retrying...');
  });
});
