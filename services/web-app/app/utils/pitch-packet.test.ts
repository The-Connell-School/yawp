import { expect, test } from 'bun:test';
import { pitchPacketSections, pitchPacketText } from './pitch-packet';
import { getEntitlementsForPlan } from './entitlements.server';
import { CLASSROOM_REPORT_RULES, CLASSROOM_REPORT_SCOPE } from './classroom-report';

const report = { activeClasses: 2, enrolledStudents: 2, assignments: 2, submittedWriting: 3, generatedAt: '2026-10-01T12:00:00.000Z' };
const entitlements = getEntitlementsForPlan('FREE_CLASSROOM');
const limits = { teacherSeats: entitlements.teacherSeatCap!, studentSeats: entitlements.studentSeatCap!, activeClasses: entitlements.activeClassCap! };

test('packet shares the visible section content, current entitlement limits and existing report definitions', () => {
  const sections = pitchPacketSections(report, limits);
  const text = pitchPacketText(sections);
  for (const section of sections) for (const line of [section.heading, ...section.paragraphs, ...section.items]) expect(text).toContain(line);
  for (const line of ['1 teacher seat', '35 student seats', '1 active class', 'Evaluation checklist', 'Submitted writing: 3', CLASSROOM_REPORT_SCOPE, ...CLASSROOM_REPORT_RULES, 'not evidence of learning gains']) expect(text).toContain(line);
  expect(text).not.toMatch(/\/app\/|@|student name|automatic upgrade|\$|days|learning gains guaranteed/i);
});

test('all-zero activity retains useful planning content and true zero counts', () => {
  const text = pitchPacketText(pitchPacketSections({ ...report, activeClasses: 0, enrolledStudents: 0, assignments: 0, submittedWriting: 0 }, limits));
  for (const line of ['Active classes: 0', 'Distinct enrolled students: 0', 'Assignments: 0', 'Submitted writing: 0', 'Evaluation checklist', 'No submitted writing in this scope yet.']) expect(text).toContain(line);
});

test('packet writes the name as Yawp!', () => {
  const text = pitchPacketText(pitchPacketSections(report, limits));
  expect(text).toContain('whether Yawp! fits your teaching workflow');
  expect(text).toContain('activity report in Yawp!');
  expect(text).not.toMatch(/\bYawp\b(?!!)/);
  expect(text).not.toContain('Yawp!.');
});
