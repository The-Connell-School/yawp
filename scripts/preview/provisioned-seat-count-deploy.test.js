import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';
import { countProvisionedPreviewSeatOrgs } from '../../packages/prisma/preview-access-code.ts';

const resolveScriptPath = fileURLToPath(
  new URL('./resolve-provisioned-seat-count.sh', import.meta.url)
);

function countViaDeployResolver(seats, masterOrganizationId = 'local-dev-org') {
  const result = spawnSync(
    'bash',
    [
      '-c',
      `source ${JSON.stringify(resolveScriptPath)}; resolve_provisioned_preview_seat_count`,
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        PREVIEW_ACCESS_SEATS: JSON.stringify(seats),
        PREVIEW_ACCESS_MASTER_ORGANIZATION_ID: masterOrganizationId,
      },
    }
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'resolver failed');
  }
  return result.stdout.trim();
}

describe('deploy provisioned seat count (no PR checkout files)', () => {
  test('deploy.sh resolves count from host tooling, not PR checkout mjs', () => {
    const deploy = readFileSync(new URL('./deploy.sh', import.meta.url), 'utf8');
    expect(deploy).toContain('resolve-provisioned-seat-count.sh');
    expect(deploy).not.toMatch(/bun scripts\/preview\/provisioned-seat-count\.mjs/);
  });

  test('resolver matches countProvisionedPreviewSeatOrgs when mjs is absent', () => {
    const seats = [
      { code: 'brave-otter-4193', organizationId: 'local-dev-org', label: 'Master' },
      { code: 'calm-panda-8127', organizationId: 'preview-free-classroom', label: 'Free classroom' },
      {
        code: 'nimble-fox-4512',
        organizationId: 'preview-school-reporter-nav',
        label: 'School reporter nav',
      },
    ];
    expect(countViaDeployResolver(seats)).toBe('1');
    expect(countProvisionedPreviewSeatOrgs(seats)).toBe(1);
  });

  test('resolver honors max preview-seat-N and ignores fixture orgs', () => {
    const seats = [
      { code: 'a', organizationId: 'local-dev-org', label: 'Master' },
      { code: 'b', organizationId: 'preview-seat-3', label: 'Seat 3' },
      { code: 'c', organizationId: 'preview-free-classroom', label: 'Free classroom' },
    ];
    expect(countViaDeployResolver(seats)).toBe('3');
    expect(countProvisionedPreviewSeatOrgs(seats)).toBe(3);
  });
});
