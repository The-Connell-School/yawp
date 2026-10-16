import { expect, test } from 'bun:test';
import { classGradePrefill, parseClassPreparation, needsClassPreparation } from './class-preparation';

test('prefills only supported, unambiguous application grades', () => {
  for (const grade of ['9', '10', '11', '12', 'mixed']) expect(classGradePrefill(grade)).toBe(grade);
  for (const grade of ['', '8', '9–12', 'college', null]) expect(classGradePrefill(grade)).toBe('');
});

test('validates and bounds class details without silently truncating', () => {
  expect(parseClassPreparation(' AP English 11 ', '11')).toEqual({ ok: true, className: 'AP English 11', grade: '11' });
  for (const name of ['', '  ', 'x'.repeat(101), 'Class\u0000']) expect(parseClassPreparation(name, '11').ok).toBe(false);
  for (const grade of ['', '8', '11th', 'mixed extra']) expect(parseClassPreparation('English', grade).ok).toBe(false);
});

test('only new eligible applications need preparation; never rewind approval', () => {
  const app = { status: 'ACCOUNT_CREATED', starterClassName: null, starterClassGrade: null };
  expect(needsClassPreparation(app, true)).toBe(true);
  expect(needsClassPreparation(app, false)).toBe(false);
  expect(needsClassPreparation({ ...app, starterClassName: 'English', starterClassGrade: '11' }, true)).toBe(false);
  for (const status of ['LEAD', 'INVITED', 'ADMIN_SUBMITTED', 'SENT', 'MANUAL_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED']) {
    expect(needsClassPreparation({ ...app, status }, true)).toBe(false);
  }
});
