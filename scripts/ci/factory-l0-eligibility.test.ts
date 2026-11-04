import { describe, expect, test } from 'bun:test';
import {
  evaluateFactoryL0Eligibility,
  evaluateFactoryL0EligibilityFromChangedFiles,
  isFactoryL0ScopeViolationPath,
  isFactoryL0ShipReviewArtifactPath,
} from './factory-l0-eligibility';

describe('isFactoryL0ShipReviewArtifactPath', () => {
  test('allows top-level ship review markdown', () => {
    expect(isFactoryL0ShipReviewArtifactPath('state/SHIP_REVIEW_907_r1.md')).toBe(
      true
    );
    expect(
      isFactoryL0ShipReviewArtifactPath(
        'state/SHIP_REVIEW_teacher-lounge-eric-chris_r1.md'
      )
    ).toBe(true);
  });

  test('rejects non-ship-review and malformed ship review paths', () => {
    expect(isFactoryL0ShipReviewArtifactPath('state/other.md')).toBe(false);
    expect(isFactoryL0ShipReviewArtifactPath('state/SHIP_REVIEW_x.md.bak')).toBe(
      false
    );
    expect(isFactoryL0ShipReviewArtifactPath('state/sub/SHIP_REVIEW_x.md')).toBe(
      false
    );
    expect(isFactoryL0ShipReviewArtifactPath('services/web-app/foo.tsx')).toBe(
      false
    );
  });
});

describe('isFactoryL0ScopeViolationPath', () => {
  test('allows ship review artifact under state/', () => {
    expect(isFactoryL0ScopeViolationPath('state/SHIP_REVIEW_907_r1.md')).toBe(
      false
    );
  });

  test('blocks other state paths and forbidden prefixes', () => {
    expect(isFactoryL0ScopeViolationPath('state/other.md')).toBe(true);
    expect(isFactoryL0ScopeViolationPath('state/SHIP_REVIEW_x.md.bak')).toBe(
      true
    );
    expect(isFactoryL0ScopeViolationPath('state/sub/SHIP_REVIEW_x.md')).toBe(
      true
    );
    expect(isFactoryL0ScopeViolationPath('scripts/ci/foo.ts')).toBe(true);
    expect(isFactoryL0ScopeViolationPath('services/web-app/app/routes/foo.tsx')).toBe(
      false
    );
  });
});

describe('evaluateFactoryL0EligibilityFromChangedFiles', () => {
  test('eligible with label, web-app diff, and ship review artifact', () => {
    expect(
      evaluateFactoryL0EligibilityFromChangedFiles({
        hasFactoryL0Label: true,
        changedFiles: [
          'services/web-app/app/foo.tsx',
          'state/SHIP_REVIEW_907_r1.md',
        ],
      })
    ).toEqual({ active: true, blockedReason: null });
  });

  test('ineligible when ship review accompanies migrations', () => {
    expect(
      evaluateFactoryL0EligibilityFromChangedFiles({
        hasFactoryL0Label: true,
        changedFiles: [
          'services/web-app/app/foo.tsx',
          'state/SHIP_REVIEW_906_r1.md',
          'packages/prisma/migrations/20261104160000_example/migration.sql',
        ],
      })
    ).toEqual({ active: false, blockedReason: 'prisma_migrations' });
  });
});

describe('evaluateFactoryL0Eligibility', () => {
  test('inactive without label', () => {
    expect(
      evaluateFactoryL0Eligibility({
        hasFactoryL0Label: false,
        scopeViolation: false,
        prismaMigrations: false,
      })
    ).toEqual({ active: false, blockedReason: null });
  });

  test('active with label and only web-app scope', () => {
    expect(
      evaluateFactoryL0Eligibility({
        hasFactoryL0Label: true,
        scopeViolation: false,
        prismaMigrations: false,
      })
    ).toEqual({ active: true, blockedReason: null });
  });

  test('blocked when migrations change', () => {
    expect(
      evaluateFactoryL0Eligibility({
        hasFactoryL0Label: true,
        scopeViolation: false,
        prismaMigrations: true,
      })
    ).toEqual({ active: false, blockedReason: 'prisma_migrations' });
  });

  test('blocked when diff leaves L0 scope', () => {
    expect(
      evaluateFactoryL0Eligibility({
        hasFactoryL0Label: true,
        scopeViolation: true,
        prismaMigrations: false,
      })
    ).toEqual({ active: false, blockedReason: 'scope_violation' });
  });

  test('migrations beat scope for blocked reason ordering', () => {
    expect(
      evaluateFactoryL0Eligibility({
        hasFactoryL0Label: true,
        scopeViolation: true,
        prismaMigrations: true,
      })
    ).toEqual({ active: false, blockedReason: 'prisma_migrations' });
  });
});
