import { describe, expect, test } from 'bun:test';
import {
  COMPOSER_TOPICS,
  LOUNGE_POST_KINDS,
  isComposerTopic,
  isLoungeTopic,
  loungeKindLabel,
  loungeTopicLabel,
} from './topics';

describe('Lounge topics', () => {
  test('the composer lists the topics in the order Brian gave them', () => {
    expect(COMPOSER_TOPICS.map((topic) => topic.label)).toEqual([
      'Writing practice',
      'Class starters',
      'Thesis development',
      'Grading & rubrics',
      'Reporter',
      'Lesson planner',
      'Classroom routines',
      'Prewriting',
      'Lessons learned',
      'Something else',
    ]);
  });

  test('keys already stored on posts keep their key and take the new label', () => {
    expect(loungeTopicLabel('writing-lessons')).toBe('Writing practice');
    expect(loungeTopicLabel('daily-pages')).toBe('Class starters');
    expect(loungeTopicLabel('thesis-essays')).toBe('Thesis development');
  });

  test('AP History is retired: it still labels old posts but is not offered for new ones', () => {
    expect(isLoungeTopic('ap-history')).toBe(true);
    expect(loungeTopicLabel('ap-history')).toBe('AP History');
    expect(isComposerTopic('ap-history')).toBe(false);
    expect(COMPOSER_TOPICS.some((topic) => topic.key === 'ap-history')).toBe(false);
  });

  test('Prewriting and Lessons learned are new topics', () => {
    expect(isComposerTopic('prewriting')).toBe(true);
    expect(isComposerTopic('lessons-learned')).toBe(true);
  });
});

describe('Lounge post kinds', () => {
  test('are General question, Share an assignment, and Win', () => {
    expect(LOUNGE_POST_KINDS.map((kind) => kind.label)).toEqual([
      'General question',
      'Share an assignment',
      'Win',
    ]);
    expect(loungeKindLabel('SHARE')).toBe('Share an assignment');
  });

  test('every kind tells the teacher what it is for', () => {
    for (const kind of LOUNGE_POST_KINDS) expect(kind.prompt.length).toBeGreaterThan(10);
  });

  test('Win and Share an assignment use the words of their threads', () => {
    const prompt = (key: string) => LOUNGE_POST_KINDS.find((kind) => kind.key === key)?.prompt;
    expect(prompt('WIN')).toBe(
      'Share a sample of student work that made you happy or proud this week. Remember to take the student’s name off.'
    );
    expect(prompt('SHARE')).toBe('Share an assignment that worked. What made it land?');
  });

  test('only Share an assignment attaches a YAWP! lesson', () => {
    expect(LOUNGE_POST_KINDS.filter((kind) => kind.attachesLesson).map((kind) => kind.key)).toEqual(['SHARE']);
  });
});
