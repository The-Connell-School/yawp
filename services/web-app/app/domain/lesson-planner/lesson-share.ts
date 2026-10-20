/**
 * Post to your class and Send this lesson (stack page redesign).
 *
 * One link opens a read-only page for the lesson, for students or for a sub,
 * a family or an admin. The teacher chooses what it opens. v1 is a plain
 * share link: no Google, Canvas or Microsoft account is connected, so the
 * teacher picks the class and the kind of post on the other side.
 */

export const SHARE_AUDIENCES = ['student', 'sub', 'family', 'admin'] as const;
export type ShareAudience = (typeof SHARE_AUDIENCES)[number];

export const SHARE_ITEMS = [
  'plan',
  'summary',
  'handouts',
  'deck',
  'daily-pages',
  'roster',
  'help',
  'standards',
  'writing',
] as const;
export type ShareItem = (typeof SHARE_ITEMS)[number];

export type AudienceSetup = {
  tab: string;
  recipientLabel: string;
  noteLabel: string;
  noteHint: string;
  button: string;
  items: Array<{ item: ShareItem; label: string; hint: string; checked: boolean }>;
};

export const AUDIENCE_SETUP: Record<Exclude<ShareAudience, 'student'> | 'student', AudienceSetup> = {
  sub: {
    tab: 'Substitute',
    recipientLabel: 'Substitute’s email',
    noteLabel: 'Special instructions for your sub',
    noteHint: 'Shows up at the top of their plan, before anything else.',
    button: 'Send sub plan',
    items: [
      { item: 'plan', label: 'Sub-ready lesson plan', hint: 'Step-by-step, with exact times and what to say', checked: true },
      { item: 'handouts', label: 'Handouts to print', hint: 'Ready to copy before first period', checked: true },
      { item: 'deck', label: 'Slide deck link', hint: 'Opens without a Yawp! login', checked: true },
      { item: 'roster', label: 'Class roster', hint: 'Names only, for attendance', checked: false },
    ],
  },
  student: {
    tab: 'Student',
    recipientLabel: 'Student’s email',
    noteLabel: 'A note for the student',
    noteHint: 'Shows up first, above what they missed.',
    button: 'Send to student',
    items: [
      { item: 'summary', label: 'What we did in class', hint: 'Written for a student who missed it', checked: true },
      { item: 'handouts', label: 'Handouts', hint: 'To print or fill in', checked: true },
      { item: 'deck', label: 'Slide deck link', hint: 'Opens without a Yawp! login', checked: true },
      { item: 'daily-pages', label: 'The writing prompt', hint: 'So they can do it too', checked: true },
    ],
  },
  family: {
    tab: 'Family',
    recipientLabel: 'Family email',
    noteLabel: 'A note for the family',
    noteHint: 'Shows up first, in your words.',
    button: 'Send to family',
    items: [
      { item: 'summary', label: 'What we’re learning', hint: 'In plain language', checked: true },
      { item: 'help', label: 'How to help at home', hint: 'One question to ask at dinner', checked: true },
    ],
  },
  admin: {
    tab: 'Admin',
    recipientLabel: 'Admin’s email',
    noteLabel: 'A note for your admin',
    noteHint: 'Shows up first.',
    button: 'Send lesson plan',
    items: [
      { item: 'plan', label: 'Lesson plan', hint: 'Timed, with a why for each step', checked: true },
      { item: 'writing', label: 'Writing time', hint: 'How much of class is writing', checked: true },
      { item: 'standards', label: 'Standards', hint: 'From your lesson plan, when you added them', checked: false },
    ],
  },
};

/** What "Post to your class" can open (the student page). */
export const POST_ITEMS: Array<{ item: ShareItem; label: string }> = [
  { item: 'deck', label: 'Slide deck' },
  { item: 'handouts', label: 'Lesson handouts' },
  { item: 'daily-pages', label: 'Daily Pages prompt' },
];

export function parseShareItems(raw: string | null | undefined): ShareItem[] {
  return [...new Set((raw ?? '').split(','))].filter((item): item is ShareItem =>
    (SHARE_ITEMS as readonly string[]).includes(item)
  );
}

/** Google Classroom's share button: the teacher picks the class there. */
export function classroomShareUrl(link: string, title: string): string {
  const params = new URLSearchParams({ url: link, title });
  return `https://classroom.google.com/share?${params}`;
}

/** Teams' share link. */
export function teamsShareUrl(link: string, title: string): string {
  const params = new URLSearchParams({ href: link, msgText: title });
  return `https://teams.microsoft.com/share?${params}`;
}

export const REWRITE_SYSTEM: Record<ShareAudience, string> = {
  sub: [
    'Rewrite a teacher’s lesson as a plan a substitute can run cold.',
    'Step by step, in order, each with its exact start time from the start of class and its minutes, and the words to say in quotes.',
    'No teacher shorthand, no "as usual", nothing that assumes they know the class or the book. Say where the materials are only if the lesson says.',
    'Markdown: one "## " heading per step. At most 450 words. Return only the plan.',
  ].join('\n'),
  student: [
    'Rewrite a teacher’s lesson for a student who missed class.',
    'Write to the student ("you"): what the class did, in order, in two or three sentences each, and what they need to do to catch up.',
    'Never include teacher moves or answers. Warm and short. Markdown. At most 300 words. Return only the page.',
  ].join('\n'),
  family: [
    'Rewrite a teacher’s lesson for a student’s family.',
    'Plain language, no education jargon: what the class is learning and why, in four or five sentences, then a "## How to help at home" section with one question to ask at dinner.',
    'Markdown. At most 220 words. Return only the page.',
  ].join('\n'),
  admin: [
    'Summarize a teacher’s lesson for a school administrator.',
    'What the lesson does and for whom, then the steps with their minutes and one line of why each, then how much of the period is writing.',
    'Professional and concise. Markdown. At most 350 words. Return only the summary.',
  ].join('\n'),
};

/** What the page says when no rewrite came back: the steps, timed. */
export function fallbackLessonText(
  steps: Array<{ title: string; minutes: number; startsAt: number; excerpt: string }>
): string {
  return steps
    .map(
      (step) =>
        `## Minute ${step.startsAt} · ${step.title} (${step.minutes} min)\n\n${step.excerpt}`
    )
    .join('\n\n');
}
