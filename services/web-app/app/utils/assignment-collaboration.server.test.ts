import { describe, expect, test } from 'bun:test';

import { type CollaborationGroupMode } from '~/domain/assignments/collaboration';
import {
  applyCollaborationRolloutGate,
  parseAssignmentCollaboration,
} from './assignment-collaboration.server';

const form = (entries: Record<string, string | string[]>) => {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      formData.append(key, item);
    }
  }
  return formData;
};

describe('parseAssignmentCollaboration', () => {
  test('defaults to disabled when the field is absent', () => {
    // Unlike tutorEnabled, which defaults on, collaboration must default OFF:
    // any form that does not render the toggle -- including older deployed
    // builds posting to a newer server -- must keep producing solo assignments.
    expect(parseAssignmentCollaboration(new FormData())).toEqual({
      success: true,
      value: {
        collaborationEnabled: false,
        collaborationGroupMode: 'teacher',
        collaborationGroupSize: null,
      },
    });
  });

  test('parses truthy and falsy toggle spellings', () => {
    for (const raw of ['true', 'on', '1', 'yes']) {
      const result = parseAssignmentCollaboration(
        form({ collaborationEnabled: raw, collaborationGroupSize: '3' })
      );
      expect(result.success).toBe(true);
      expect(result.success && result.value.collaborationEnabled).toBe(true);
    }

    for (const raw of ['false', 'off', '0', 'no']) {
      const result = parseAssignmentCollaboration(
        form({ collaborationEnabled: raw })
      );
      expect(result.success).toBe(true);
      expect(result.success && result.value.collaborationEnabled).toBe(false);
    }
  });

  test('takes the last toggle value (checkbox plus hidden fallback)', () => {
    const result = parseAssignmentCollaboration(
      form({
        collaborationEnabled: ['false', 'true'],
        collaborationGroupSize: '3',
      })
    );
    expect(result.success && result.value.collaborationEnabled).toBe(true);
  });

  test('rejects an invalid toggle value', () => {
    expect(
      parseAssignmentCollaboration(form({ collaborationEnabled: 'maybe' }))
    ).toEqual({
      success: false,
      message: 'Collaboration enabled value is invalid.',
    });
  });

  test('accepts the three supported group modes', () => {
    const modes: CollaborationGroupMode[] = ['teacher', 'random', 'whole-class'];
    for (const mode of modes) {
      const result = parseAssignmentCollaboration(
        form({
          collaborationEnabled: 'true',
          collaborationGroupMode: mode,
          ...(mode === 'whole-class' ? {} : { collaborationGroupSize: '3' }),
        })
      );
      expect(result.success).toBe(true);
      expect(result.success && result.value.collaborationGroupMode).toBe(mode);
    }
  });

  test('rejects an unknown group mode', () => {
    expect(
      parseAssignmentCollaboration(
        form({ collaborationEnabled: 'true', collaborationGroupMode: 'pairs' })
      )
    ).toEqual({
      success: false,
      message: 'Collaboration group mode is invalid.',
    });
  });

  test('whole-class carries no group size', () => {
    // The group is the roster, so a size would be meaningless. A size posted
    // alongside whole-class is dropped rather than rejected, so switching modes
    // in the UI without clearing the stepper is not an error.
    const result = parseAssignmentCollaboration(
      form({
        collaborationEnabled: 'true',
        collaborationGroupMode: 'whole-class',
        collaborationGroupSize: '4',
      })
    );
    expect(result.success && result.value.collaborationGroupSize).toBe(null);
  });

  test('requires a group size for grouped modes', () => {
    for (const mode of ['teacher', 'random']) {
      expect(
        parseAssignmentCollaboration(
          form({ collaborationEnabled: 'true', collaborationGroupMode: mode })
        )
      ).toEqual({
        success: false,
        message: 'Group size must be between 2 and 8 students.',
      });
    }
  });

  test('rejects a group size outside 2 to 8', () => {
    for (const size of ['1', '0', '-2', '9', '40']) {
      const result = parseAssignmentCollaboration(
        form({
          collaborationEnabled: 'true',
          collaborationGroupMode: 'teacher',
          collaborationGroupSize: size,
        })
      );
      expect(result).toEqual({
        success: false,
        message: 'Group size must be between 2 and 8 students.',
      });
    }
  });

  test('rejects a non-numeric group size', () => {
    expect(
      parseAssignmentCollaboration(
        form({
          collaborationEnabled: 'true',
          collaborationGroupMode: 'teacher',
          collaborationGroupSize: 'three',
        })
      )
    ).toEqual({
      success: false,
      message: 'Group size must be between 2 and 8 students.',
    });
  });

  test('ignores group settings entirely when collaboration is off', () => {
    // A teacher who configures groups and then switches the toggle back off
    // should get a plain solo assignment, not a validation error.
    expect(
      parseAssignmentCollaboration(
        form({
          collaborationEnabled: 'false',
          collaborationGroupMode: 'nonsense',
          collaborationGroupSize: '99',
        })
      )
    ).toEqual({
      success: true,
      value: {
        collaborationEnabled: false,
        collaborationGroupMode: 'teacher',
        collaborationGroupSize: null,
      },
    });
  });
});

describe('applyCollaborationRolloutGate', () => {
  const on = {
    collaborationEnabled: true,
    collaborationGroupMode: 'teacher' as const,
    collaborationGroupSize: 3,
  };

  test('passes settings through when every target organization is enabled', () => {
    expect(applyCollaborationRolloutGate(on, [true, true])).toEqual(on);
  });

  test('forces collaboration off when any target organization is not enabled', () => {
    // Fail closed, and force off rather than erroring: a teacher whose school
    // is not in the rollout gets an ordinary solo assignment, not a dead end.
    expect(applyCollaborationRolloutGate(on, [true, false])).toEqual({
      collaborationEnabled: false,
      collaborationGroupMode: 'teacher',
      collaborationGroupSize: null,
    });
  });

  test('forces collaboration off when there are no target organizations', () => {
    expect(applyCollaborationRolloutGate(on, [])).toEqual({
      collaborationEnabled: false,
      collaborationGroupMode: 'teacher',
      collaborationGroupSize: null,
    });
  });

  test('leaves an already-disabled assignment untouched', () => {
    const off = {
      collaborationEnabled: false,
      collaborationGroupMode: 'teacher' as const,
      collaborationGroupSize: null,
    };
    expect(applyCollaborationRolloutGate(off, [true])).toEqual(off);
  });
});
