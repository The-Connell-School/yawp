/**
 * Plausible human first names used as stand-ins for real student/teacher
 * names before a prompt leaves our servers for a third-party AI provider.
 *
 * These are deliberately ordinary first names, NOT placeholders like
 * "Student A" or "[REDACTED]". The grading system prompt forces the model
 * to open its comment with the student's name; a placeholder reads as
 * stilted, robotic prose and is the biggest quality-regression risk in
 * this scheme, so the pseudonym has to read exactly like a name.
 *
 * Deliberately gender-diverse and culturally varied so no pseudonym
 * telegraphs anything about the real student it stands in for.
 */
export const PSEUDONYM_FIRST_NAME_POOL: readonly string[] = [
  'Alex',
  'Jordan',
  'Taylor',
  'Morgan',
  'Casey',
  'Riley',
  'Jamie',
  'Avery',
  'Quinn',
  'Rowan',
  'Skylar',
  'Reese',
  'Emerson',
  'Sawyer',
  'Dakota',
  'Hayden',
  'Peyton',
  'Charlie',
  'Drew',
  'Elliot',
  'Finley',
  'Harper',
  'Kai',
  'Logan',
  'Micah',
  'Noor',
  'Parker',
  'Remy',
  'Sam',
  'Toni',
  'Amara',
  'Beckett',
  'Cass',
  'Devon',
  'Ellis',
  'Frankie',
  'Gray',
  'Indigo',
  'Jules',
  'Kendall',
  'Lane',
  'Marlowe',
  'Nico',
  'Oakley',
  'Presley',
  'Robin',
  'Shay',
  'Teagan',
  'Val',
  'Wren',
] as const;
