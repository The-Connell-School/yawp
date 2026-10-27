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
  'observe',
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
      { item: 'summary', label: 'What we did and why', hint: 'In plain language, no jargon', checked: true },
      { item: 'help', label: 'Talking about it at dinner', hint: 'Two or three ways to start the conversation', checked: true },
      { item: 'deck', label: 'The slides from class', hint: 'What students saw, without your notes', checked: false },
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
      { item: 'standards', label: 'Standards', hint: 'The ones you named in the planner', checked: true },
      { item: 'deck', label: 'Slides', hint: 'The deck as students see it', checked: false },
      { item: 'observe', label: 'Invite them to observe', hint: 'An invitation to come and see this lesson', checked: false },
    ],
  },
};

/**
 * What an admin page adds after the summary, in the teacher's own terms:
 * the standards they named (never inferred) and an invitation to observe.
 */
export function adminExtras({
  standards,
  observe,
  className,
  lessonDate,
}: {
  standards: string[] | null;
  observe: boolean;
  className: string | null;
  lessonDate: string | null;
}): string {
  const parts: string[] = [];
  if (standards?.length) {
    parts.push(['## Standards', '', 'As the teacher named them for this lesson:', '', ...standards.map((standard) => `- ${standard}`)].join('\n'));
  }
  if (observe) {
    const when = lessonDate
      ? new Date(lessonDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
      : null;
    parts.push(
      [
        '## You’re invited to observe',
        '',
        `The teacher would welcome you in class for this lesson${className ? ` with ${className}` : ''}${when ? ` on ${when}` : ''}. Reply to this email to set a time.`,
      ].join('\n')
    );
  }
  return parts.join('\n\n');
}

/** What each audience's email says around the link (Brian's run 4, item 5). */
const EMAIL_COPY: Record<ShareAudience, { subject: string; intro: string; button: string }> = {
  sub: {
    subject: 'Sub plan',
    intro: 'Here is the plan for the class you are covering: each step in order, with its times and what to say. Handouts to print are on the page too.',
    button: 'Open the sub plan',
  },
  student: {
    subject: 'What we did in class',
    intro: 'Here is what we did in class while you were out, and what to do to catch up.',
    button: 'See what you missed',
  },
  family: {
    subject: 'What we did in class',
    intro: 'Here is what we did in class and why, with a few ways to talk about it at home.',
    button: 'Read about the lesson',
  },
  admin: {
    subject: 'Lesson plan',
    intro: 'Here is the lesson plan, timed, with a line on why each step is there.',
    button: 'Open the lesson plan',
  },
};

export function lessonEmail({
  audience,
  title,
  className,
  link,
  note,
  teacherName,
  observe = false,
}: {
  audience: ShareAudience;
  title: string;
  className: string | null;
  link: string;
  note: string | null;
  teacherName: string | null;
  observe?: boolean;
}): { subject: string; text: string; html: string } {
  const copy = EMAIL_COPY[audience];
  const who = teacherName?.trim() || 'A teacher';
  const lesson = className ? `${title} (${className})` : title;
  const subject = `${audience === 'admin' && observe ? 'Invitation to observe' : copy.subject}: ${title}`;
  const opener = `${who} sent you ${audience === 'sub' ? 'a sub plan' : 'a lesson'}: ${lesson}.`;
  const intro =
    audience === 'admin' && observe ? `${copy.intro} You are invited to come and see it taught.` : copy.intro;
  const text = [opener, '', intro, note ? `\n${note}\n` : '', `${copy.button}: ${link}`, '', 'Sent with Yawp! No login needed.'].join('\n');
  const escape = (value: string) =>
    value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);
  const html = [
    '<div style="font-family:Georgia,serif;max-width:560px;color:#2B2622">',
    `<p style="font-size:16px"><strong>${escape(opener)}</strong></p>`,
    `<p>${escape(intro)}</p>`,
    note
      ? `<p style="padding:12px;background:#F6F1EA;border-radius:8px">${escape(note).replace(/\n/g, '<br>')}</p>`
      : '',
    `<p><a href="${escape(link)}" style="display:inline-block;padding:10px 16px;background:#C2502E;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">${escape(copy.button)}</a></p>`,
    '<p style="color:#6E665C;font-size:13px">Sent with Yawp! No login needed.</p>',
    '</div>',
  ].join('');
  return { subject, text, html };
}

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

/** Said to every rewrite (Brian's run 4): his voice rules and the lesson's own names. */
const REWRITE_VOICE = [
  'Use the class name exactly as given (for example "English 10 · Period 3"); never name a course, department or subject area of your own ("ELA / Secondary Literature").',
  'Call each step by the name it has in the lesson ("Class Starter", not "Do Now").',
  'Say what things are, plainly. No "not this, but that" contrasts, no staged reveals, and no closing aphorism ("Students remember being seen more than being taught").',
  'The product is written Yawp! (capital Y, lowercase "awp", the exclamation point), never YAWP or Yawp.',
].join('\n');

/**
 * The stack's structure, for every audience (Brian's round 5, item 7): the
 * same steps, in the same order, under the same names as the stack.
 */
const REWRITE_STRUCTURE = [
  'Follow the lesson exactly as it is given: one "## " heading per step, in the order given, each heading the step\'s "## " line from the lesson word for word (for example "## Class Starter: When rules stop making sense"). Add no headings of your own between them, never "Step 2" or "Minute 6" in a heading, never rename a step, and never call a step "Yawp!".',
  'A step marked "A writing assignment in Yawp!" is done by students in Yawp!, never a discussion: give no discussion moves for it ("we\'ll hear a few responses"), and never paraphrase or add to its prompt.',
].join('\n');

export const REWRITE_SYSTEM: Record<ShareAudience, string> = {
  sub: [
    'Rewrite a teacher’s lesson as a plan a substitute can run cold.',
    'Step by step, in order, each with its exact start time from the start of class and its minutes, and the words to say in quotes.',
    'For every step that is a writing assignment in Yawp! (a Class Starter, an Exit Ticket, Daily Pages and the rest), say it plainly, in these words with that step\'s name and minutes: "This is a writing assignment in Yawp!. Have students open Yawp! and find the Class Starter. They have 5 minutes to write." Then what the sub does while they write. It is never a discussion the sub leads.',
    'No teacher shorthand, no "as usual", nothing that assumes they know the class or the book. Say where the materials are only if the lesson says.',
    'Markdown. At most 450 words. Return only the plan.',
    REWRITE_STRUCTURE,
    REWRITE_VOICE,
  ].join('\n'),
  student: [
    'Rewrite a teacher’s lesson for a student who missed class.',
    'Write to the student ("you"): what the class did, in order, in two or three sentences each, and what they need to do to catch up.',
    'Open with "We missed you in class."',
    'For a writing assignment in Yawp!, say so by its name ("Class opened with a Class Starter in Yawp!", "Class ended with an Exit Ticket in Yawp!") and tell the student to write it there. Its prompt is printed under the page, so never restate it. Never write "To catch up on the Yawp!" or call a step "the Yawp!".',
    'Never "Hey!", "Hey there" or any other greeting that sounds like an ad.',
    'Never include teacher moves or answers. Warm and short. Markdown. At most 300 words. Return only the page.',
    REWRITE_STRUCTURE,
    REWRITE_VOICE,
  ].join('\n'),
  family: [
    'Rewrite a teacher’s lesson for a student’s family.',
    'Plain language, no education jargon. Write for any family, about the class: begin "Today in class, students…", never "Your student…" or "Your child…" (the same page goes to every family).',
    'One opening sentence, then what the class did and why it matters under each step\'s heading, a sentence or two each; then a "## Talking about it at dinner" section with two or three open questions or conversation starters a family could use, tied to what the class actually did, none with a right answer to check.',
    'Markdown. At most 320 words. Return only the page.',
    REWRITE_STRUCTURE,
    REWRITE_VOICE,
  ].join('\n'),
  admin: [
    'Summarize a teacher’s lesson for a school administrator.',
    'What the lesson does and for whom, then the steps with their minutes and one line of why each.',
    'Never name a standard, a standards code or an alignment claim: Yawp! adds the standards the teacher named itself, and says nothing about the ones they did not.',
    'Professional and concise. Markdown. At most 350 words. Return only the summary.',
    REWRITE_STRUCTURE,
    REWRITE_VOICE,
  ].join('\n'),
};

/**
 * A step's heading on every share page (Brian's round 5, item 7): its stack
 * name, then its title, without saying the name twice.
 */
export function stepHeading(name: string, title: string): string {
  const cleanTitle = title.trim();
  if (!cleanTitle || cleanTitle.toLowerCase().includes(name.toLowerCase())) {
    return cleanTitle.toLowerCase().startsWith(name.toLowerCase()) ? cleanTitle : name;
  }
  return `${name}: ${cleanTitle}`;
}

export type RewriteStep = {
  /** The stack's name for it: "Class Starter", "Class Discussion" (`stackStepName`). */
  name?: string;
  title: string;
  minutes: number;
  startsAt: number;
  excerpt: string;
  content: string;
  /** A writing assignment students do in Yawp!. */
  yawp?: boolean;
};

/** What every rewrite is given: the steps, in the stack's order and names. */
export function rewriteInput({
  title,
  className,
  steps,
}: {
  title: string;
  className: string | null;
  steps: RewriteStep[];
}): string {
  return [
    `Lesson: ${title}${className ? ` (${className})` : ''}`,
    '',
    ...steps.map((step) => {
      const heading = step.name ? stepHeading(step.name, step.title) : step.title;
      return [
        `## ${heading}`,
        `Minute ${step.startsAt}, ${step.minutes} min.${
          step.yawp
            ? ` A writing assignment in Yawp!: students open Yawp! and find the ${step.name ?? step.title}. ${step.minutes} minutes to write.`
            : ''
        }`,
        step.content.replace(/\s+/g, ' ').slice(0, 700),
        '',
      ].join('\n');
    }),
  ].join('\n');
}

/**
 * The purple box's list (Brian's round 5, item 10): each assignment by its
 * type, with its title only where two share a type.
 */
export function inYawpNames(steps: Array<{ name: string; title: string }>): string[] {
  const counts = new Map<string, number>();
  for (const step of steps) counts.set(step.name, (counts.get(step.name) ?? 0) + 1);
  return steps.map((step) => ((counts.get(step.name) ?? 0) > 1 ? stepHeading(step.name, step.title) : step.name));
}

/**
 * Never a share of class time spent writing in the rewritten text (Brian's
 * run 4, item 6): the page shows the one number, worked out from the stack,
 * and a second one from the model (29% beside 20%) is always wrong. Drops
 * any sentence that puts a percentage on writing.
 */
export function withoutWritingShare(text: string): string {
  const share = /\d+\s*(?:%|percent)[^.!?\n]*\bwrit|\bwrit[^.!?\n]*\d+\s*(?:%|percent)/i;
  return text
    .split('\n')
    .map((line) => {
      if (!share.test(line)) return line;
      const sentences = line.match(/[^.!?]+[.!?]*\s*/g) ?? [line];
      return sentences.filter((sentence) => !share.test(sentence)).join('').trimEnd();
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** What the page says when no rewrite came back: the steps, timed, under the stack's names. */
export function fallbackLessonText(
  steps: Array<{ name?: string; title: string; minutes: number; startsAt: number; excerpt: string }>
): string {
  return steps
    .map(
      (step) =>
        `## Minute ${step.startsAt} · ${step.name ? stepHeading(step.name, step.title) : step.title} (${step.minutes} min)\n\n${step.excerpt}`
    )
    .join('\n\n');
}

/** "The writing prompt", or "The writing prompts" over more than one (Brian's round 3, 1.7). */
export function writingPromptsHeading(count: number): string {
  return count === 1 ? 'The writing prompt' : 'The writing prompts';
}

/** A handout from a writing prompt is headed by its type (Brian's round 3, 1.8). */
export function handoutHeading(title: string, type: string | null): string {
  if (!type || title.toLowerCase().startsWith(type.toLowerCase())) return title;
  return `${type}: ${title}`;
}

/**
 * The purple box's first line. A family's question is what their student
 * should have finished or made up (Brian's round 3, 1.9).
 */
export function inYawpLead(audience: ShareAudience): string {
  return audience === 'family'
    ? 'These assignments are available to your student in Yawp! and should be completed before the next class session (or by an agreed-upon time):'
    : 'These writing exercises are available to students as assignments in Yawp!';
}
