import { describe, expect, test } from 'bun:test';
import { LOUNGE_SHARE_PARAM, assignmentShareSnapshot, loungeShareHref } from './shares';

const assignment = {
  id: 'a1',
  title: 'Conclusion checklist',
  prompt: 'Before you write your conclusion, answer these.',
  submitForGrade: false,
  pointValue: null,
  tutorEnabled: false,
  gradingAssistantStrictnessLevel: 'intermediate',
  assignmentType: { id: 't1', title: 'Exit Ticket' },
};

describe('assignmentShareSnapshot', () => {
  test('freezes what another teacher needs to reuse it', () => {
    expect(assignmentShareSnapshot(assignment)).toEqual({
      kind: 'assignment',
      sourceId: 'a1',
      assignmentTypeId: 't1',
      assignmentTypeTitle: 'Exit Ticket',
      title: 'Conclusion checklist',
      prompt: 'Before you write your conclusion, answer these.',
      settings: { submitForGrade: false, pointValue: null, tutorEnabled: false, gradingAssistantStrictnessLevel: 'intermediate' },
    });
  });

  test('an untitled assignment is named from its prompt', () => {
    const snapshot = assignmentShareSnapshot({
      ...assignment,
      title: null,
      prompt: 'Write a paragraph that argues whether the narrator of the story can be trusted, using two quotations.',
    });
    expect(snapshot.title).toBe('Write a paragraph that argues whether the narrator of the…');
  });
});

describe('loungeShareHref', () => {
  test('opens the assignment type page with the share to load', () => {
    expect(LOUNGE_SHARE_PARAM).toBe('loungeShare');
    expect(loungeShareHref('t1', 'att 1')).toBe('/app/assignment-types/t1?loungeShare=att%201');
  });
});
