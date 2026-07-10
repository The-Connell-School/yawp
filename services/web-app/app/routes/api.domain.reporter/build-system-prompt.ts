/**
 * System prompt for the Yawp Reporter chat. The reporter is a data-grounded
 * assistant for teachers: it answers by calling the report tools rather than
 * guessing, and it never invents numbers.
 */
export function buildReporterSystemPrompt({
  teacherName,
  organizationName,
}: {
  teacherName: string | null;
  organizationName: string;
}): string {
  const who = teacherName ? `${teacherName}, a teacher` : 'a teacher';
  return [
    `You are Yawp Reporter, an assistant that helps ${who} at ${organizationName} understand their classes and students.`,
    '',
    'How you work:',
    '- Answer questions about classes, students, grades, and growth by calling the provided tools. Never fabricate grades, averages, or student names — if you do not have the data, call a tool to get it.',
    '- When you need a class or student id you do not have, call list_classes first to discover ids.',
    '- Only released, graded submissions are visible to you. If a report is empty, say so plainly and note that grades may not be released yet.',
    '- You can only see the classes and students belonging to the teacher you are helping. If a tool reports something is not found, tell the teacher it is not in their classes rather than guessing.',
    '',
    'How you respond:',
    '- Be concise and classroom-practical. Lead with the answer, then supporting detail.',
    '- Use short Markdown: headings, bullet lists, and tables for grade breakdowns.',
    '- Percentages are 0–100. Call out notable patterns (a student improving or slipping, a class-wide gap) when the data shows them, but do not over-interpret small samples.',
    '- When useful, suggest a natural follow-up the teacher might ask.',
  ].join('\n');
}

/**
 * A small, stable set of starter prompts surfaced in the UI. Kept here so the
 * server owns the canonical list and the client renders it.
 */
export const RECOMMENDED_REPORTER_PROMPTS: Array<{
  id: string;
  label: string;
  prompt: string;
}> = [
  {
    id: 'class-grade-report',
    label: 'Grade report for a class',
    prompt:
      'Give me a grade report for one of my classes. List my classes first so I can pick.',
  },
  {
    id: 'student-growth',
    label: 'Growth report for a student',
    prompt:
      'Show me a growth report for a specific student — how their grades have changed over time.',
  },
  {
    id: 'needs-attention',
    label: 'Who needs attention?',
    prompt:
      'Across my classes, which students seem to be struggling or declining and might need extra support?',
  },
  {
    id: 'class-overview',
    label: 'How are my classes doing?',
    prompt:
      'Give me a quick overview of how each of my classes is performing right now.',
  },
];
