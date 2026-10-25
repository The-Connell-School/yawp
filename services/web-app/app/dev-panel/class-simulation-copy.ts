export function classSimulationPopulateSuccessMessage(counts: {
  students: number;
  assignments: number;
}): string {
  const students = Number(counts.students);
  const assignments = Number(counts.assignments);
  const assignmentLabel = assignments === 1 ? 'assignment' : 'assignments';
  return `Added ${students} students across ${assignments} ${assignmentLabel}.`;
}

export function classSimulationClearSuccessMessage(removedStudents: number): string {
  const removed = Number(removedStudents);
  if (removed === 1) {
    return 'Cleared 1 simulated student.';
  }
  return `Cleared ${removed} simulated students.`;
}
