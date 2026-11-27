import { expect, test } from 'bun:test';
import {
  ADMIN_APPROVE_NDPA_TRUST,
  ADMIN_APPROVE_STUDENT_PRIVACY_FAQ,
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

test('admin Student privacy answer ends with the agreement offer', () => {
  expect(ADMIN_APPROVE_STUDENT_PRIVACY_FAQ).toEndWith(
    'Our practices align with the SDPC National Data Privacy Agreement, and we will sign your state’s terms if/when you need an agreement.'
  );
  expect(ADMIN_APPROVE_STUDENT_PRIVACY_FAQ).not.toMatch(/signed agreement/i);
});
