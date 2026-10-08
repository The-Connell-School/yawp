import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';
import {
  buildPreviewAccessSeatRegistry,
  countProvisionedPreviewSeatOrgs,
} from '../../packages/prisma/preview-access-code.ts';

describe('preview deploy access seat wiring', () => {
  test('deploy.sh passes slug and fixture flags into access-code generation', () => {
    const deploy = readFileSync(new URL('./deploy.sh', import.meta.url), 'utf8');
    expect(deploy).toContain('-e PREVIEW_SLUG="$SLUG"');
    expect(deploy).toContain('INCLUDE_PREVIEW_FREE_CLASSROOM_FIXTURE');
    expect(deploy).toContain('resolve-provisioned-seat-count.sh');
  });

  test('simulates demo deploy seat registry (matches access-code.mjs)', () => {
    const seats = buildPreviewAccessSeatRegistry({
      count: 1,
      previewSlug: 'demo',
      generateCode: () => 'brave-otter-4193',
    });
    expect(seats).toHaveLength(1);
    expect(countProvisionedPreviewSeatOrgs(seats)).toBe(1);
  });
});
