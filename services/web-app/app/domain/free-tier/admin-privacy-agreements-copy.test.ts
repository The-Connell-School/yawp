import { expect, test } from 'bun:test';
import {
  ADMIN_APPROVE_NDPA_TRUST,
  PRIVACY_LAWS_AND_AGREEMENTS,
} from './admin-privacy-agreements-copy';

test('NDPA trust badge does not claim an executed signature', () => {
  expect(ADMIN_APPROVE_NDPA_TRUST.title).not.toMatch(/signed/i);
  expect(ADMIN_APPROVE_NDPA_TRUST.line).toContain('will sign');
  expect(ADMIN_APPROVE_NDPA_TRUST.line).toContain('align');
});

test('privacy laws section lists FERPA, COPPA, and SDPC NDPA', () => {
  const labels = PRIVACY_LAWS_AND_AGREEMENTS.map((item) => item.label);
  expect(labels).toEqual(['FERPA', 'COPPA', 'Data privacy agreements']);
  const ndpa = PRIVACY_LAWS_AND_AGREEMENTS.find((item) => item.id === 'ndpa');
  expect(ndpa?.text).toContain('will sign');
  expect(ndpa?.text).toContain('SDPC National Data Privacy Agreement');
});
