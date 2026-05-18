import { describe, expect, test } from 'bun:test';
import {
  studentModuleSessionListSelect,
  studentModuleSessionSingleSelect,
} from './module-session-select.server';

describe('module-session-select', () => {
  test('single select takes the furthest module by position', () => {
    expect(studentModuleSessionSingleSelect).toMatchObject({
      select: {
        assignmentModule: {
          select: { title: true },
        },
      },
      orderBy: {
        assignmentModule: {
          position: 'desc',
        },
      },
      take: 1,
    });
  });

  test('list select preserves descending module position order', () => {
    expect(studentModuleSessionListSelect).toMatchObject({
      select: {
        assignmentModule: {
          select: { title: true },
        },
      },
      orderBy: {
        assignmentModule: {
          position: 'desc',
        },
      },
    });
    expect('take' in studentModuleSessionListSelect).toBe(false);
  });
});
