import {
  COLLABORATION_GROUP_MODES,
  DEFAULT_COLLABORATION_GROUP_MODE,
  MAX_COLLABORATION_GROUP_SIZE,
  MIN_COLLABORATION_GROUP_SIZE,
  SIZED_COLLABORATION_GROUP_MODES,
  SOLO_COLLABORATION_SETTINGS,
  type AssignmentCollaborationSettings,
} from '~/domain/assignments/collaboration';

export type ParseAssignmentCollaborationResult =
  | { success: true; value: AssignmentCollaborationSettings }
  | { success: false; message: string };

function lastValue(formData: FormData, field: string): string | undefined {
  return formData
    .getAll(field)
    .map((value) => value.toString().trim().toLowerCase())
    .filter(Boolean)
    .at(-1);
}

/**
 * Parses the collaborative-draft settings from create/edit assignment form data.
 *
 * Defaults to **disabled** when the toggle is absent. This is the opposite of
 * `parseAssignmentTutorEnabled`, which defaults on, and the difference is
 * deliberate: a form that does not render this toggle — including an older
 * deployed client posting to a newer server — must keep producing ordinary
 * solo assignments.
 *
 * Group settings are only validated when collaboration is on, so a teacher who
 * configures groups and then switches the toggle back off gets a plain solo
 * assignment rather than a validation error.
 */
export function parseAssignmentCollaboration(
  formData: FormData
): ParseAssignmentCollaborationResult {
  const rawEnabled = lastValue(formData, 'collaborationEnabled');

  if (!rawEnabled) {
    return { success: true, value: SOLO_COLLABORATION_SETTINGS };
  }

  let collaborationEnabled: boolean;
  if (['true', 'on', '1', 'yes'].includes(rawEnabled)) {
    collaborationEnabled = true;
  } else if (['false', 'off', '0', 'no'].includes(rawEnabled)) {
    collaborationEnabled = false;
  } else {
    return {
      success: false,
      message: 'Collaboration enabled value is invalid.',
    };
  }

  if (!collaborationEnabled) {
    return { success: true, value: SOLO_COLLABORATION_SETTINGS };
  }

  const rawMode =
    lastValue(formData, 'collaborationGroupMode') ??
    DEFAULT_COLLABORATION_GROUP_MODE;
  const collaborationGroupMode = COLLABORATION_GROUP_MODES.find(
    (mode) => mode === rawMode
  );
  if (!collaborationGroupMode) {
    return { success: false, message: 'Collaboration group mode is invalid.' };
  }

  if (!SIZED_COLLABORATION_GROUP_MODES.includes(collaborationGroupMode)) {
    // Whole class: the group is the roster, so any posted size is dropped rather
    // than rejected — switching modes in the UI need not clear the stepper.
    return {
      success: true,
      value: {
        collaborationEnabled: true,
        collaborationGroupMode,
        collaborationGroupSize: null,
      },
    };
  }

  const rawSize = lastValue(formData, 'collaborationGroupSize');
  const sizeMessage = `Group size must be between ${MIN_COLLABORATION_GROUP_SIZE} and ${MAX_COLLABORATION_GROUP_SIZE} students.`;
  if (!rawSize) return { success: false, message: sizeMessage };

  // Reject "3.5" and "3px" rather than letting parseInt truncate them.
  if (!/^\d+$/.test(rawSize)) return { success: false, message: sizeMessage };

  const collaborationGroupSize = Number(rawSize);
  if (
    collaborationGroupSize < MIN_COLLABORATION_GROUP_SIZE ||
    collaborationGroupSize > MAX_COLLABORATION_GROUP_SIZE
  ) {
    return { success: false, message: sizeMessage };
  }

  return {
    success: true,
    value: {
      collaborationEnabled: true,
      collaborationGroupMode,
      collaborationGroupSize,
    },
  };
}
