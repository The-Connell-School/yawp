import { describe, expect, test } from 'bun:test';

import { THESIS_ESSAY_COURSE } from '~/routes/app.assignment-types.$id/landing-copy/thesis-essay-course';
import {
  lessonNumberOfTrainingModule,
  tutorialsForTrainingModule,
  withLessonTutorial,
} from './lounge-lesson-tutorials';

const COURSE = 'The Thesis-Driven Essay';
const lesson = (number: number) => THESIS_ESSAY_COURSE[number - 1]!.tutorials;

describe("Brian's tutorials in the Lounge's Thesis-Driven Essay course", () => {
  test('a "Lesson N: …" module plays that lesson\'s tutorial', () => {
    expect(tutorialsForTrainingModule(COURSE, 'Lesson 1: Introduce Students to Yawp!')).toEqual(lesson(1));
    expect(tutorialsForTrainingModule(COURSE, 'Lesson 2: Pre-writing')).toEqual(lesson(2));
    expect(tutorialsForTrainingModule(COURSE, 'Lesson 3: Developing a Thesis Statement')).toEqual(lesson(3));
    expect(tutorialsForTrainingModule(COURSE, 'Lesson 7: Titling Your Essay')).toEqual(lesson(7));
    // Titles are typed by hand in the admin: case and spacing don't matter.
    expect(tutorialsForTrainingModule('the thesis-driven essay ', '  lesson 4: Introduction Paragraph')).toEqual(lesson(4));
  });

  test('Body paragraphs has two: the paragraphs, then supporting quotes', () => {
    expect(
      tutorialsForTrainingModule(COURSE, 'Lesson 5: Body Paragraphs').map((tutorial) => tutorial.title)
    ).toEqual(['Body paragraphs', 'Supporting quotes']);
  });

  test('every other module keeps the video it was given', () => {
    // No lesson number: the course's opening videos.
    expect(tutorialsForTrainingModule(COURSE, 'Meet Your Instructor')).toEqual([]);
    expect(tutorialsForTrainingModule(COURSE, 'Introduction to Lesson Plan Modules')).toEqual([]);
    // A lesson Brian has not recorded, and a number off the course.
    expect(tutorialsForTrainingModule(COURSE, 'Lesson 8: Review my Essay (optional)')).toEqual([]);
    expect(tutorialsForTrainingModule(COURSE, 'Lesson 12: Something new')).toEqual([]);
    // Another course's lessons are its own.
    expect(tutorialsForTrainingModule('5-Paragraph Essay', 'Lesson 2: Pre-writing')).toEqual([]);
  });

  test('the lesson number comes from the start of the title', () => {
    expect(lessonNumberOfTrainingModule('Lesson 2: Pre-writing')).toBe(2);
    expect(lessonNumberOfTrainingModule('Welcome to Yawp!')).toBeNull();
    expect(lessonNumberOfTrainingModule('Review of Lesson 2')).toBeNull();
  });
});

describe('a module as the teacher watches it', () => {
  const module = (title: string, videoDuration: number | null, watched: number[]) => ({
    id: 'm',
    title,
    videoDuration,
    teacherTrainingModuleSessions: watched.map((videoTimestamp, index) => ({ id: `s${index}`, videoTimestamp })),
  });

  test('a lesson with a tutorial runs as long as the tutorial, not the video it replaced', () => {
    const taught = withLessonTutorial(COURSE, module('Lesson 2: Pre-writing', 1865, []));
    expect(taught.videoDuration).toBe(lesson(2)[0]!.seconds);
    expect(taught.id).toBe('m');
  });

  test('progress on the longer old video never runs past the end of the new one', () => {
    const seconds = lesson(2)[0]!.seconds;
    // Finished the 31-minute video: finished. Ten minutes in: still ten minutes in.
    expect(
      withLessonTutorial(COURSE, module('Lesson 2: Pre-writing', 1865, [1865])).teacherTrainingModuleSessions
    ).toEqual([{ id: 's0', videoTimestamp: seconds }]);
    expect(
      withLessonTutorial(COURSE, module('Lesson 2: Pre-writing', 1865, [600])).teacherTrainingModuleSessions
    ).toEqual([{ id: 's0', videoTimestamp: 600 }]);
  });

  test('a module without a tutorial is left exactly as it is', () => {
    const intro = module('Meet Your Instructor', 187, [187]);
    expect(withLessonTutorial(COURSE, intro)).toBe(intro);
    const other = module('Lesson 2: Pre-writing', 1865, [900]);
    expect(withLessonTutorial('Another course', other)).toBe(other);
  });
});
