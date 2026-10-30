import { expect, test } from 'bun:test';
import {
  lessonPlannerMonthlyQuotaEnforced,
  monthlyQuotaCapEnforcesNewUsage,
  reporterMonthlyQuotaEnforced,
} from './monthly-quota-cap.server';

test('monthlyQuotaCapEnforcesNewUsage treats max bound as unmetered', () => {
  expect(monthlyQuotaCapEnforcesNewUsage(0, 'reporterMonthly')).toBe(false);
  expect(monthlyQuotaCapEnforcesNewUsage(2, 'reporterMonthly')).toBe(true);
  expect(monthlyQuotaCapEnforcesNewUsage(100, 'reporterMonthly')).toBe(false);
  expect(monthlyQuotaCapEnforcesNewUsage(5, 'lessonPlannerMonthly')).toBe(true);
  expect(monthlyQuotaCapEnforcesNewUsage(100, 'lessonPlannerMonthly')).toBe(
    false
  );
});

test('reporter and lesson planner helpers read configured limits', () => {
  expect(
    reporterMonthlyQuotaEnforced({
      studentSeatCap: 35,
      lessonPlannerMonthly: 5,
      reporterMonthly: 2,
    })
  ).toBe(true);
  expect(
    reporterMonthlyQuotaEnforced({
      studentSeatCap: 35,
      lessonPlannerMonthly: 100,
      reporterMonthly: 100,
    })
  ).toBe(false);
  expect(
    lessonPlannerMonthlyQuotaEnforced({
      studentSeatCap: 35,
      lessonPlannerMonthly: 100,
      reporterMonthly: 2,
    })
  ).toBe(false);
});
