import { describe, expect, test } from 'bun:test';
import { trainingCardCounts } from './teacher-training-counts';

describe('trainingCardCounts', () => {
  test("counts the resources inside each module, not only the course's own", () => {
    const course = {
      resources: [],
      teacherTrainingModules: [{ resources: [{ id: 'a' }, { id: 'b' }] }, { resources: [{ id: 'c' }] }, { resources: [] }],
    };
    expect(trainingCardCounts(course)).toEqual({ modules: '3 modules', resources: '3 resources' });
  });

  test('adds course-level resources to module resources', () => {
    const course = { resources: [{ id: 'x' }], teacherTrainingModules: [{ resources: [{ id: 'a' }] }] };
    expect(trainingCardCounts(course)).toEqual({ modules: '1 module', resources: '2 resources' });
  });

  test('says so plainly when there are none', () => {
    expect(trainingCardCounts({ resources: [], teacherTrainingModules: [] })).toEqual({
      modules: '0 modules',
      resources: '0 resources',
    });
    expect(trainingCardCounts({ resources: [{ id: 'x' }], teacherTrainingModules: [] }).resources).toBe('1 resource');
  });
});
