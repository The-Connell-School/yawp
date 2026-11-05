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
  const roll = (studentIndex * 11 + assignmentIndex * 17) % 20;
  if (roll < 8) return 'in_progress';
  return 'submitted';
}

/** ~30% of simulated students receive canned tutor chat transcripts. */
export function classSimulationShouldIncludeTutorChat(studentIndex: number) {
  return studentIndex % 10 < 3;
}

export function classIdToSimulatedEmailSlug(classId: string) {
  return classId.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'class';
}

export function simulatedStudentEmail(classId: string, studentIndex: number) {
  return `sim-${classIdToSimulatedEmailSlug(classId)}-${studentIndex}@example.test`;
}

export function parseSimulatedStudentEmail(email: string | null | undefined) {
  if (!email) return null;
  const match = /^sim-([a-z0-9]+)-(\d+)@example\.test$/i.exec(email.trim());
  if (!match) return null;
  const studentIndex = Number.parseInt(match[2]!, 10);
  if (!Number.isFinite(studentIndex) || studentIndex < 1) return null;
  return {
    classIdSlug: match[1]!.toLowerCase(),
    studentIndex,
  };
}

export function parseSimulatedStudentIndex(
  email: string | null | undefined,
  classId?: string
) {
  const parsed = parseSimulatedStudentEmail(email);
  if (!parsed) return null;
  if (
    classId &&
    parsed.classIdSlug !== classIdToSimulatedEmailSlug(classId)
  ) {
    return null;
  }
  return parsed.studentIndex;
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
