import { describe, expect, test } from 'bun:test';

import { parseAssignmentTutorEnabled } from './assignment-tutor-enabled.server';

describe('parseAssignmentTutorEnabled', () => {
  test('defaults to true when the field is absent (preserves current behavior)', () => {
    const formData = new FormData();
    expect(parseAssignmentTutorEnabled(formData)).toEqual({
      success: true,
      value: true,
    });
  });

  test('parses "true"/"on"/"1"/"yes" as enabled', () => {
    for (const raw of ['true', 'on', '1', 'yes']) {
      const formData = new FormData();
      formData.set('tutorEnabled', raw);
      expect(parseAssignmentTutorEnabled(formData)).toEqual({
        success: true,
        value: true,
      });
    }
  });

  test('parses "false"/"off"/"0"/"no" as disabled', () => {
    for (const raw of ['false', 'off', '0', 'no']) {
      const formData = new FormData();
      formData.set('tutorEnabled', raw);
      expect(parseAssignmentTutorEnabled(formData)).toEqual({
        success: true,
        value: false,
      });
    }
  });

  test('takes the last value when the field appears more than once (checkbox + hidden fallback)', () => {
    const formData = new FormData();
    formData.append('tutorEnabled', 'false');
    formData.append('tutorEnabled', 'true');
    expect(parseAssignmentTutorEnabled(formData)).toEqual({
      success: true,
      value: true,
    });
  });

  test('rejects an invalid value', () => {
    const formData = new FormData();
    formData.set('tutorEnabled', 'maybe');
    expect(parseAssignmentTutorEnabled(formData)).toEqual({
      success: false,
      message: 'Tutor enabled value is invalid.',
    });
  });

  test('the revised Exit Ticket builder never turns the tutor on (Brian, Nov 17)', () => {
    const formData = new FormData();
    formData.set('tutorEnabled', 'true');
    formData.set('exitTicketPromptVersion', '2');
    expect(parseAssignmentTutorEnabled(formData)).toEqual({
      success: true,
      value: false,
    });
  });

  test('older exit ticket forms keep whatever they posted', () => {
    const formData = new FormData();
    formData.set('tutorEnabled', 'true');
    formData.set('exitTicketKind', 'reflection');
    expect(parseAssignmentTutorEnabled(formData)).toEqual({
      success: true,
      value: true,
    });
  });
});
