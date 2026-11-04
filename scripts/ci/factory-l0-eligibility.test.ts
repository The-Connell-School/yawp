import { describe, expect, test } from 'bun:test';
import { evaluateFactoryL0Eligibility } from './factory-l0-eligibility';

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
