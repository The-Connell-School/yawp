import { describe, expect, test } from 'bun:test';
import {
  assignmentDocumentTitleFromAssignment,
  loadAssignmentTitleForDocumentBinding,
} from './assignment-document-title.server';

describe('assignmentDocumentTitleFromAssignment', () => {
  test('trims whitespace and returns empty when missing', () => {
    expect(assignmentDocumentTitleFromAssignment('  Monday Exit Ticket  ')).toBe(
      'Monday Exit Ticket'
    );
    expect(assignmentDocumentTitleFromAssignment(null)).toBe('');
    expect(assignmentDocumentTitleFromAssignment('   ')).toBe('');
  });
});

describe('loadAssignmentTitleForDocumentBinding', () => {
  test('prefers class assignment when both ids are present', async () => {
    const title = await loadAssignmentTitleForDocumentBinding(
      {
        classAssignment: {
          findUnique: async () => ({
            assignment: { title: 'Class Starter 11/25' },
          }),
        },
        assignment: {
          findUnique: async () => ({
            title: 'Should not win',
          }),
        },
      },
      { assignmentId: 'a-1', classAssignmentId: 'ca-1' }
    );
    expect(title).toBe('Class Starter 11/25');
  });

  test('falls back to assignment id alone', async () => {
    const title = await loadAssignmentTitleForDocumentBinding(
      {
        classAssignment: { findUnique: async () => null },
        assignment: {
          findUnique: async () => ({ title: 'Gatsby Essay' }),
        },
      },
      { assignmentId: 'a-2' }
    );
    expect(title).toBe('Gatsby Essay');
  });
});