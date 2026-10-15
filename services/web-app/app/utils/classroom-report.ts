export type ClassroomActivityReport = {
  activeClasses: number;
  enrolledStudents: number;
  assignments: number;
  submittedWriting: number;
  generatedAt: string;
};

export const CLASSROOM_REPORT_SCOPE =
  'Your active classes in your selected organization, all years; current records at generation time.';

export const CLASSROOM_REPORT_RULES = [
  'Active classes: non-archived classes where you are an active teacher in your selected organization. Deleted classes are absent.',
  'Distinct enrolled students: active student accounts currently enrolled in those classes, counted once across classes. Former and inactive enrollments are excluded.',
  'Assignments: class assignment deployments in those classes, including scheduled assignments. The same assignment assigned to two classes counts twice. Deleted deployments are excluded; archiving an assignment type does not remove existing assignments.',
  'Submitted writing: distinct student or shared group documents attached to those class assignments with at least one non-archived, non-withdrawn submission. Deleted or archived documents and drafts without submissions are excluded. Repeated submissions and document revisions do not add to the count; a collaborative document counts once for the whole group. Work from former students remains included while the document and submission are active.',
  'This report excludes independent writing and writing practice outside class assignments. Activity counts describe recorded activity only, not learning outcomes.',
] as const;

export const CLASSROOM_REPORT_METRICS = [
  ['activeClasses', 'Active classes'],
  ['enrolledStudents', 'Distinct enrolled students'],
  ['assignments', 'Assignments'],
  ['submittedWriting', 'Submitted writing'],
] as const;

export function classroomReportSummary(report: ClassroomActivityReport): string {
  return [
    'Classroom activity report',
    `Scope: ${CLASSROOM_REPORT_SCOPE}`,
    `Generated at: ${report.generatedAt} (UTC)`,
    '',
    ...CLASSROOM_REPORT_METRICS.map(([key, label]) => `${label}: ${report[key]}`),
    '',
    'How counts work',
    ...CLASSROOM_REPORT_RULES,
  ].join('\n');
}
