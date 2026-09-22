import { describe, expect, test } from 'bun:test';
import {
  COLLABORATION_GROUP_MODES,
  COLLABORATION_GROUP_MODE_OPTIONS,
  collaborationModeAutoArranges,
  collaborationModeNeedsGroupSize,
} from './collaboration';

describe('COLLABORATION_GROUP_MODE_OPTIONS', () => {
  test('offers every mode the parser accepts', () => {
    // A mode missing here is a mode a teacher can never choose, which is how
    // the sheet ended up offering only a group size.
    expect(
      COLLABORATION_GROUP_MODE_OPTIONS.map((option) => option.value)
    ).toEqual([...COLLABORATION_GROUP_MODES]);
  });

  test('every option carries copy to render', () => {
    for (const option of COLLABORATION_GROUP_MODE_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.description.length).toBeGreaterThan(0);
    }
  });
});

describe('collaborationModeNeedsGroupSize', () => {
  test('sized modes need one', () => {
    expect(collaborationModeNeedsGroupSize('teacher')).toBe(true);
    expect(collaborationModeNeedsGroupSize('random')).toBe(true);
  });

  test('whole class does not: the group is the roster', () => {
    expect(collaborationModeNeedsGroupSize('whole-class')).toBe(false);
  });
});

describe('collaborationModeAutoArranges', () => {
  test('random and whole class arrange at creation', () => {
    // Neither leaves the teacher an arrangement decision, so making them press
    // Shuffle to reach the same result is busywork.
    expect(collaborationModeAutoArranges('random')).toBe(true);
    expect(collaborationModeAutoArranges('whole-class')).toBe(true);
  });

  test('teacher-built groups start empty', () => {
    expect(collaborationModeAutoArranges('teacher')).toBe(false);
  });
});
