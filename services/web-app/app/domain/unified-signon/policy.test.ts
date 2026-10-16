import { expect, test } from 'bun:test';
import {
  normalizeIdentifier,
  postAuthenticationDestination,
  codeDigest,
} from './policy.server';

test('canonical identifiers accept the display prefix and preserve class collisions', () => {
  expect(normalizeIdentifier(' @Maya.R ')).toEqual({
    kind: 'handle',
    value: 'maya.r',
  });
  expect(normalizeIdentifier(' MAYA@Example.COM ')).toEqual({
    kind: 'email',
    value: 'maya@example.com',
  });
  expect(normalizeIdentifier('ENG-11X')).toEqual({
    kind: 'handle-or-code',
    value: 'eng-11x',
  });
  expect(normalizeIdentifier('12')).toEqual({
    kind: 'handle-or-code',
    value: '12',
  });
  expect(normalizeIdentifier('student')).toEqual({
    kind: 'handle-or-code',
    value: 'student',
  });
  for (const invalid of ['', '@', 'bad@', 'a b', 'x'.repeat(101)])
    expect(normalizeIdentifier(invalid)).toBeNull();
});

test('routing precedence is password, inactive, trial, picker, safe destination', () => {
  const base = {
    mustChangePassword: false,
    activeMemberships: 1,
    trialDestination: null,
    redirectTo: '/app/my-classes',
  };
  expect(
    postAuthenticationDestination({
      ...base,
      mustChangePassword: true,
      activeMemberships: 0,
      trialDestination: '/app/free-tier/pending',
    })
  ).toBe('/auth/required-password-change');
  expect(
    postAuthenticationDestination({
      ...base,
      activeMemberships: 0,
      trialDestination: '/app/free-tier/pending',
    })
  ).toBe('/app/free-tier/pending');
  expect(
    postAuthenticationDestination({
      ...base,
      activeMemberships: 2,
      trialDestination: '/app/free-tier/pending',
    })
  ).toBe('/app/free-tier/pending');
  expect(postAuthenticationDestination({ ...base, activeMemberships: 2 })).toBe(
    'membership'
  );
  expect(postAuthenticationDestination(base)).toBe('/app/my-classes');
  expect(
    postAuthenticationDestination({ ...base, redirectTo: '//evil.example' })
  ).toBe('/app');
});

test('OTP digest is keyed and bound to the entire server challenge context', () => {
  const context = {
    flow: 'opaque',
    identity: 'a@example.com',
    purpose: 'reset',
    classId: 'a',
    generation: 'random',
  };
  const original = codeDigest(context, '123456');
  expect(original).not.toContain('123456');
  for (const key of Object.keys(context))
    expect(codeDigest({ ...context, [key]: 'substituted' }, '123456')).not.toBe(
      original
    );
  expect(codeDigest(context, '654321')).not.toBe(original);
});

test('a free-trial destination wins over the inactive screen for accounts with no active roles', () => {
  expect(
    postAuthenticationDestination({
      mustChangePassword: false,
      activeMemberships: 0,
      trialDestination: '/app/free-tier/onboarding',
      redirectTo: '/app',
    })
  ).toBe('/app/free-tier/onboarding');
  expect(
    postAuthenticationDestination({
      mustChangePassword: false,
      activeMemberships: 0,
      trialDestination: null,
      redirectTo: '/app',
    })
  ).toBe('inactive');
  expect(
    postAuthenticationDestination({
      mustChangePassword: true,
      activeMemberships: 0,
      trialDestination: '/app/free-tier/onboarding',
      redirectTo: '/app',
    })
  ).toBe('/auth/required-password-change');
});
