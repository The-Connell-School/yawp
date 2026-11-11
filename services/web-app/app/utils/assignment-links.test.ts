import { describe, expect, test } from 'bun:test';
import { assignmentStudentLink } from './assignment-links';

describe('assignmentStudentLink', () => {
  test('builds the stable student open URL from origin and assignment id', () => {
    expect(assignmentStudentLink('https://yawp.example', 'asgn-1')).toBe(
      'https://yawp.example/app/assignments/asgn-1/open'
    );
  });
});
