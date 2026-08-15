import { describe, expect, test } from 'bun:test';
import { initialRailTab, type RailLesson } from './lesson-rail';

const draft: RailLesson = {
  id: 'draft-1',
  title: 'Conclusions, period 3',
  published: false,
};
const published: RailLesson = {
  id: 'published-1',
  title: 'Evidence that earns its place',
  published: true,
};

describe('initialRailTab', () => {
  test('opens on drafts, which is where a lesson starts', () => {
    expect(initialRailTab([draft, published], 'draft-1')).toBe('drafts');
  });

  /**
   * The rail has to be showing the list that contains the lesson on screen.
   * Opening on drafts while a published lesson is open reads as though the
   * rail has lost it.
   */
  test('opens on the library when the open lesson is published', () => {
    expect(initialRailTab([draft, published], 'published-1')).toBe('library');
  });

  test('opens on drafts for a lesson that has not been saved yet', () => {
    expect(initialRailTab([draft, published], null)).toBe('drafts');
  });

  test('opens on drafts when the id belongs to no lesson it knows', () => {
    // The rail is capped at the most recent lessons, so an older one can be
    // open without being in the list.
    expect(initialRailTab([draft, published], 'archived-9')).toBe('drafts');
  });

  test('opens on drafts when the teacher has no lessons at all', () => {
    expect(initialRailTab([], null)).toBe('drafts');
  });
});
