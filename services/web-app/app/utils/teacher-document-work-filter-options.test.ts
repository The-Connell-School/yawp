import { describe, expect, test } from 'bun:test';

import {
  assignmentMatchesClassFilters,
  buildStudentFilterOptionsFromDocuments,
  dedupeAssignmentFilterOptions,
  parseDocumentWorkFilterIds,
  serializeDocumentWorkFilterIds,
  studentMatchesStudentFilters,
} from './teacher-document-work-filter-options';

describe('teacher document work filter options', () => {
  test('dedupes students from documents by user id', () => {
    const students = buildStudentFilterOptionsFromDocuments([
      {
        membership: {
          id: 'profile-1',
          user: {
            id: 'user-1',
            name: 'Alex Student',
            email: 'alex@example.com',
          },
        },
      },
      {
        membership: {
          id: 'profile-2',
          user: {
            id: 'user-1',
            name: 'Alex Student',
            email: 'alex@example.com',
          },
        },
      },
      {
        membership: {
          id: 'profile-3',
          user: { id: 'user-2', name: null, email: 'sam@example.com' },
        },
      },
    ]);

    expect(students).toEqual([
      {
        id: 'user-1',
        label: 'Alex Student',
        membershipIds: ['profile-1', 'profile-2'],
      },
      {
        id: 'user-2',
        label: 'sam@example.com',
        membershipIds: ['profile-3'],
      },
    ]);
  });

  test('disambiguates different students who share a name', () => {
    const students = buildStudentFilterOptionsFromDocuments([
      {
        membership: {
          id: 'profile-1',
          user: {
            id: 'user-1',
            name: 'Adrian Adams',
            email: 'adrian.a@example.com',
          },
        },
      },
      {
        membership: {
          id: 'profile-2',
          user: {
            id: 'user-2',
            name: 'Adrian Adams',
            email: 'adrian.b@example.com',
          },
        },
      },
    ]);

    expect(students).toEqual([
      {
        id: 'user-1',
        label: 'Adrian Adams (adrian.a@example.com)',
        membershipIds: ['profile-1'],
      },
      {
        id: 'user-2',
        label: 'Adrian Adams (adrian.b@example.com)',
        membershipIds: ['profile-2'],
      },
    ]);
  });

  test('matches documents across duplicate profile ids for one user', () => {
    const studentOptions = buildStudentFilterOptionsFromDocuments([
      {
        membership: {
          id: 'profile-1',
          user: {
            id: 'user-1',
            name: 'Adrian Adams',
            email: 'adrian@example.com',
          },
        },
      },
      {
        membership: {
          id: 'profile-2',
          user: {
            id: 'user-1',
            name: 'Adrian Adams',
            email: 'adrian@example.com',
          },
        },
      },
    ]);

    expect(
      studentMatchesStudentFilters(
        {
          membership: {
            id: 'profile-2',
            user: { id: 'user-1' },
          },
        },
        ['user-1'],
        studentOptions
      )
    ).toBe(true);
  });

  test('dedupes assignments deployed to multiple classes', () => {
    const assignments = dedupeAssignmentFilterOptions([
      {
        id: 'assignment-1',
        label: 'Essay 1',
        classId: 'class-a',
        createdAt: new Date('2024-01-01'),
      },
      {
        id: 'assignment-1',
        label: 'Essay 1',
        classId: 'class-b',
        createdAt: new Date('2024-02-01'),
      },
      {
        id: 'assignment-2',
        label: 'Essay 2',
        classId: 'class-a',
        createdAt: new Date('2024-03-01'),
      },
    ]);

    expect(assignments).toEqual([
      {
        id: 'assignment-2',
        label: 'Essay 2',
        classId: 'class-a',
        classIds: ['class-a'],
        latestCreatedAt: new Date('2024-03-01').getTime(),
      },
      {
        id: 'assignment-1',
        label: 'Essay 1',
        classId: 'class-a',
        classIds: ['class-a', 'class-b'],
        latestCreatedAt: new Date('2024-02-01').getTime(),
      },
    ]);
  });

  test('parses and serializes multi-select filter ids', () => {
    expect(parseDocumentWorkFilterIds(null)).toEqual([]);
    expect(parseDocumentWorkFilterIds('all')).toEqual([]);
    expect(parseDocumentWorkFilterIds('a,b,c')).toEqual(['a', 'b', 'c']);
    expect(serializeDocumentWorkFilterIds(['b', 'a', 'b'])).toBe('a,b');
    expect(serializeDocumentWorkFilterIds([])).toBeNull();
  });

  test('matches assignments against any selected class', () => {
    const assignment = {
      id: 'assignment-1',
      label: 'Essay 1',
      classId: 'class-a',
      classIds: ['class-a', 'class-b'],
    };

    expect(assignmentMatchesClassFilters(assignment, [])).toBe(true);
    expect(assignmentMatchesClassFilters(assignment, ['class-b'])).toBe(true);
    expect(assignmentMatchesClassFilters(assignment, ['class-c'])).toBe(false);
  });
});
