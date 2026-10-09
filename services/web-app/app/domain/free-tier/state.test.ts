import { expect, test } from 'bun:test';
import { canTransition, assertTransition } from './state';

test('legal transitions', () => {
  expect(canTransition('LEAD', 'INVITED')).toBe(true);
  expect(canTransition('INVITED', 'ACCOUNT_CREATED')).toBe(true);
  expect(canTransition('SENT', 'APPROVED')).toBe(true);
  expect(canTransition('MANUAL_REVIEW', 'REJECTED')).toBe(true);
});

test('illegal transitions', () => {
  expect(canTransition('LEAD', 'APPROVED')).toBe(false);
  expect(canTransition('APPROVED', 'LEAD')).toBe(false);
  expect(canTransition('REJECTED', 'APPROVED')).toBe(false);
});

test('assertTransition throws on illegal moves', () => {
  expect(() => assertTransition('LEAD', 'APPROVED')).toThrow();
  expect(() => assertTransition('APPROVED', 'LEAD')).toThrow();
  expect(() => assertTransition('LEAD', 'INVITED')).not.toThrow();
});

