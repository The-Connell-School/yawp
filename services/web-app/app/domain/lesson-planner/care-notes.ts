/**
 * Care with hard content (S7; Nov 28 fiction run). The rule is in the
 * instructions, and three of seven novel lessons missed it: Their Eyes Were
 * Watching God's chapter 2 holds Nanny's account of rape and a slur, with no
 * note; Of Mice and Men's note said nothing about a counselor or the slur.
 * Code cannot read a whole book, but it can know the works most often taught
 * and what in them a class needs care with. A lesson on one of them needs a
 * care note for the teacher: how to frame it, a way to opt out, and when to
 * involve a counselor. If it has none, or one without those, the repair pass
 * writes it.
 */
export type HardContent = { work: string; content: string };

/** Commonly taught works, by the names a request uses, and what in them needs care. */
const WORKS: Array<{ names: RegExp; work: string; content: string }> = [
  { names: /\bof mice and men\b/i, work: 'Of Mice and Men', content: 'a racial slur, the shooting of Candy\'s dog and of Lennie, and Lennie\'s disability' },
  { names: /\bto kill a mockingbird\b|\bmockingbird\b/i, work: 'To Kill a Mockingbird', content: 'racial slurs, an accusation of rape, and racist violence' },
  { names: /\btheir eyes were watching god\b/i, work: 'Their Eyes Were Watching God', content: 'sexual violence (Nanny\'s and Leafy\'s stories), a racial slur, and domestic violence' },
  { names: /\bthe outsiders\b/i, work: 'The Outsiders', content: 'gang violence and the deaths of teenagers' },
  { names: /\bthings fall apart\b/i, work: 'Things Fall Apart', content: 'violence, the killing of a child (Ikemefuna), and suicide' },
  { names: /\bmacbeth\b/i, work: 'Macbeth', content: 'murder, including of children, and suicide' },
  { names: /\bhamlet\b/i, work: 'Hamlet', content: 'suicide and murder' },
  { names: /\bromeo and juliet\b/i, work: 'Romeo and Juliet', content: 'suicide' },
  { names: /\blord of the flies\b/i, work: 'Lord of the Flies', content: 'the killing of children' },
  { names: /\bnight\b.*\bwiesel\b|\bwiesel\b.*\bnight\b|\belie wiesel\b/i, work: 'Night', content: 'genocide and the deaths of children' },
  { names: /\bbeloved\b/i, work: 'Beloved', content: 'infanticide, sexual violence and the violence of slavery' },
  { names: /\bthe kite runner\b/i, work: 'The Kite Runner', content: 'sexual assault of a child and violence' },
  { names: /\bspeak\b.*\banderson\b|\blaurie halse anderson\b/i, work: 'Speak', content: 'sexual assault' },
  { names: /\bthe bluest eye\b/i, work: 'The Bluest Eye', content: 'incest and sexual abuse' },
  { names: /\bhuckleberry finn\b|\bhuck finn\b/i, work: 'Adventures of Huckleberry Finn', content: 'racial slurs' },
  { names: /\bthe glass castle\b/i, work: 'The Glass Castle', content: 'neglect and abuse' },
  { names: /\bcaged bird sings\b/i, work: 'I Know Why the Caged Bird Sings', content: 'sexual abuse of a child' },
  { names: /\b1984\b|\bnineteen eighty-four\b/i, work: '1984', content: 'torture' },
  { names: /\bnarrative of the life\b|\bfrederick douglass\b/i, work: 'Narrative of the Life of Frederick Douglass', content: 'the violence of slavery, whipping and a racial slur' },
];

/** The work the lesson is on, when it is one a class needs care with: the latest message that says. */
export function hardContentOf(messages: string[]): HardContent | null {
  for (const message of messages) {
    const found = WORKS.find((entry) => entry.names.test(message ?? ''));
    if (found) return { work: found.work, content: found.content };
  }
  return null;
}

const CARE_NOTE = /\bcare note\b|\bcontent (?:note|warning|advisory)\b|\bsensitive (?:content|material)\b|\bbefore (?:you )?read(?:ing)?\b[^.\n]{0,60}\b(?:warn|let (?:students|them) know)\b/i;
const OPT_OUT = /\bopt(?:s|ing)?[- ]out\b|\bstep out\b|\bsit out\b|\balternative (?:reading|assignment|passage)\b|\bmay leave\b/i;
const COUNSELOR = /\bcounsel(?:l)?or\b|\bschool psychologist\b|\bsocial worker\b/i;

export type CareProblem = { what: string; words: string; note: string };

const headingOf = (reply: string) => reply.split('\n').find((line) => /^\s{0,3}#{1,3}\s+\S/.test(line))?.trim() ?? reply.trim().split('\n')[0]!.trim();

/** A lesson on a work with hard content and no full care note, as a problem for the repair pass. */
export function careNoteProblems(reply: string, asked: string[]): CareProblem[] {
  const hard = hardContentOf(asked);
  if (!hard || /```yawp-unit\b/.test(reply)) return [];
  const hasNote = CARE_NOTE.test(reply);
  const full = hasNote && OPT_OUT.test(reply) && COUNSELOR.test(reply);
  if (full) return [];
  const words = headingOf(reply);
  if (!words) return [];
  return [
    {
      what:
        `This lesson is on ${hard.work}, which contains ${hard.content}. ${hasNote ? 'Its care note is missing a part. ' : ''}` +
        'Under the lesson\'s title, add (or complete) a short **Care note** for the teacher: how to frame the hard content before students meet it, a way for a student to opt out (a different passage, stepping out of the read-aloud), when to involve the school counselor, and respectful words to use (a slur is never read aloud by students). Keep it to three or four sentences, in the teacher\'s voice.',
      words,
      note: `${hard.work} contains ${hard.content}: add a care note (framing, a way to opt out, when to involve a counselor) before class.`,
    },
  ];
}
