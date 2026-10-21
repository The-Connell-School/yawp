import { expect, test } from 'bun:test';
import {
  teachingAccessBannerMessage,
  teachingAccessMobileSheetBody,
  teachingAccessMobileSheetBodyInvite,
  teachingAccessMobileSheetBodySend,
  teachingAccessClassCodeCaption,
  TEACHING_ACCESS_LOCKED_TOOLTIP,
} from './teaching-access-copy';

test('teachingAccessBannerMessage includes admin name', () => {
  expect(teachingAccessBannerMessage('Dr. Patel')).toBe(
    'Waiting for Dr. Patel to approve your classroom.'
  );
});

test('locked tooltip copy matches design spec', () => {
  expect(TEACHING_ACCESS_LOCKED_TOOLTIP).toBe(
    'Unlocks once your administrator approves.'
  );
});

test('mobile sheet body uses the admin name when present', () => {
  expect(teachingAccessMobileSheetBody('Dr. Patel')).toContain('Dr. Patel');
  expect(teachingAccessMobileSheetBody('your administrator')).toContain(
    'your administrator'
  );
});

test('invite and send mobile sheet bodies match design copy', () => {
  expect(teachingAccessMobileSheetBodyInvite('Dr. Patel')).toBe(
    'Inviting students and sharing your class code unlock once Dr. Patel approves your classroom.'
  );
  expect(teachingAccessMobileSheetBodySend('Dr. Patel')).toBe(
    'Sending assignments to your class unlocks once Dr. Patel approves your classroom.'
  );
  expect(teachingAccessClassCodeCaption('Dr. Patel')).toBe(
    'Your class code appears once Dr. Patel approves.'
  );
});
