export const CLASS_SIMULATION_MAX_STUDENTS = 40;

export type ClassSimulationAssignmentState =
  | 'not_joined'
  | 'joined'
  | 'in_progress'
  | 'submitted';

/** Deterministic participation mix per student × assignment (seeded by student index). */
export function classSimulationAssignmentState(
  studentIndex: number,
  assignmentIndex: number
): ClassSimulationAssignmentState {
  const bucket = (studentIndex * 7 + assignmentIndex * 13) % 10;
  if (bucket <= 1) return 'not_joined';
  if (bucket <= 3) return 'joined';
  if (bucket <= 6) return 'in_progress';
  return 'submitted';
}

/** ~30% of simulated students receive canned tutor chat transcripts. */
export function classSimulationShouldIncludeTutorChat(studentIndex: number) {
  return studentIndex % 10 < 3;
}

export function simulatedStudentEmail(classId: string, studentIndex: number) {
  const shortId = classId.replace(/[^a-z0-9]/gi, '').slice(-8).toLowerCase() || 'class';
  return `sim-${shortId}-${studentIndex}@example.test`;
}

export function parseSimulatedStudentIndex(email: string | null | undefined) {
  if (!email) return null;
  const match = /^sim-[a-z0-9]+-(\d+)@example\.test$/i.exec(email);
  if (!match) return null;
  const index = Number.parseInt(match[1]!, 10);
  return Number.isFinite(index) ? index : null;
}

export const SIMULATED_STUDENT_NAMES = [
  'Alex Rivera',
  'Jordan Lee',
  'Sam Patel',
  'Taylor Brooks',
  'Casey Nguyen',
  'Riley Chen',
  'Morgan Davis',
  'Quinn Martinez',
  'Avery Johnson',
  'Blake Wilson',
  'Cameron Moore',
  'Drew Thompson',
  'Emery Clark',
  'Finley Lewis',
  'Harper Walker',
  'Indigo Hall',
  'Jules Young',
  'Kai Allen',
  'Logan King',
  'Marley Wright',
  'Noel Scott',
  'Oakley Green',
  'Parker Adams',
  'Reese Baker',
  'Sage Carter',
  'Tatum Evans',
  'Uma Foster',
  'Vale Gray',
  'Wren Hayes',
  'Xen Irving',
  'Yael Jones',
  'Zion Kelly',
  'Arden Lopez',
  'Bay Miller',
  'Cleo Nelson',
  'Dell Ortiz',
  'Echo Price',
  'Fox Reed',
  'Gray Shaw',
  'Haven Tate',
] as const;

export function simulatedStudentDisplayName(studentIndex: number) {
  const names = SIMULATED_STUDENT_NAMES;
  return names[(studentIndex - 1) % names.length] ?? `Student ${studentIndex}`;
}

export const SIMULATION_PARTIAL_TEXT =
  'My claim is that the author builds tension through contrast. I still need to tie the second paragraph back to the thesis.';

export const SIMULATION_SUBMITTED_TEXT =
  'The author uses vivid imagery and pacing to show how the protagonist changes. Specific lines from the middle section prove the theme about resilience.';

export const SIMULATION_TUTOR_TRANSCRIPT: Array<{
  agent: 'assistant' | 'user';
  content: string;
}> = [
  {
    agent: 'assistant',
    content:
      'What part of your argument feels strongest so far, and what still needs evidence?',
  },
  {
    agent: 'user',
    content:
      'I think my opening is clear, but I am not sure the middle paragraph supports my thesis.',
  },
  {
    agent: 'assistant',
    content:
      'Try naming one quote you could use and explain how it proves your claim in one sentence.',
  },
];
