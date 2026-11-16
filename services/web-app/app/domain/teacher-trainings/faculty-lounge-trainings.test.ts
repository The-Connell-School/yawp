import { describe, expect, test } from 'bun:test';
import { facultyLoungeTrainingsHome } from './faculty-lounge-trainings';

describe('facultyLoungeTrainingsHome', () => {
  test('community on: the old Trainings index goes to the community feed', () => {
    expect(facultyLoungeTrainingsHome(true)).toBe('/app/lounge');
  });

  test('community off: the course grid is still the Teacher\'s Lounge', () => {
    expect(facultyLoungeTrainingsHome(false)).toBe('/app/teacher-trainings');
  });
});
