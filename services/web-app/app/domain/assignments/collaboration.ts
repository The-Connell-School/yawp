// Collaborative drafts: the pieces both the server and the browser need.
// Form parsing and the rollout gate live in
// `~/utils/assignment-collaboration.server`; this module holds only what a
// component can safely import, mirroring the saved-assignments split.

/**
 * How groups are formed for a collaborative assignment.
 *
 * - `teacher` — the teacher arranges groups, seeded by a shuffle
 * - `random` — the system assigns, teacher may still adjust afterwards
 * - `whole-class` — one shared document for the entire roster
 *
 * Stored as a string column rather than a Prisma enum, matching
 * `gradingAssistantStrictnessLevel`.
 */
export const COLLABORATION_GROUP_MODES = [
  'teacher',
  'random',
  'whole-class',
] as const;

export type CollaborationGroupMode =
  (typeof COLLABORATION_GROUP_MODES)[number];

export const DEFAULT_COLLABORATION_GROUP_MODE: CollaborationGroupMode =
  'teacher';

/** Modes where students are split into groups and a target size is required. */
export const SIZED_COLLABORATION_GROUP_MODES: CollaborationGroupMode[] = [
  'teacher',
  'random',
];

export const MIN_COLLABORATION_GROUP_SIZE = 2;
/**
 * Eight is a pedagogical ceiling rather than a technical one, but it is also
 * where concurrent-editor load starts to matter: presence fan-out grows with the
 * square of the participant count. Whole-class mode deliberately bypasses this
 * and is the heaviest case.
 */
export const MAX_COLLABORATION_GROUP_SIZE = 8;

/** Sensible starting point in the creation sheet: pairs are the common case. */
export const DEFAULT_COLLABORATION_GROUP_SIZE = 3;

/** Every size a teacher may pick, for rendering a stepper or select. */
export const COLLABORATION_GROUP_SIZE_OPTIONS = Array.from(
  { length: MAX_COLLABORATION_GROUP_SIZE - MIN_COLLABORATION_GROUP_SIZE + 1 },
  (_, index) => MIN_COLLABORATION_GROUP_SIZE + index
);

export type AssignmentCollaborationSettings = {
  collaborationEnabled: boolean;
  collaborationGroupMode: CollaborationGroupMode;
  collaborationGroupSize: number | null;
};

/** The settings a non-collaborative assignment gets. */
export const SOLO_COLLABORATION_SETTINGS: AssignmentCollaborationSettings = {
  collaborationEnabled: false,
  collaborationGroupMode: DEFAULT_COLLABORATION_GROUP_MODE,
  collaborationGroupSize: null,
};

/**
 * Narrows a stored mode string. Anything unrecognised reads as the default
 * rather than letting a bad value reach group formation.
 */
export function toCollaborationGroupMode(
  value: string
): CollaborationGroupMode {
  return (
    COLLABORATION_GROUP_MODES.find((mode) => mode === value) ??
    DEFAULT_COLLABORATION_GROUP_MODE
  );
}
