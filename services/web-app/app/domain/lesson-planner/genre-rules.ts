/**
 * Rules by genre (Kevin, Nov 28): "some universal rules we can apply to all
 * of the lesson types, and then each genre should probably get its own set."
 *
 * The Nov 24 types test planned one lesson of each kind and found about half
 * the rules fit every kind, while the rest misfired outside literature: a
 * world slide in a grammar lesson, "never tell the theme" where a skill lesson
 * must state its rule, pictures competing with a seminar's questions. Here
 * Yawp! reads which genre a request is and gives the planner that genre's own
 * rules (the drafts of the Nov 24 test), tells it which general rules do not
 * apply, and how to read the ones written for another kind of lesson.
 *
 * Behind `lesson_planner_genre_rules`. A request whose genre cannot be told
 * gets the rules for every lesson only, as before.
 */
import { plansSeveralDays } from './lesson-ask';

export const GENRES = ['novel', 'play', 'poem', 'story', 'speech', 'memoir', 'writing', 'grammar', 'research', 'seminar', 'unit'] as const;
export type Genre = (typeof GENRES)[number];

const ONE_DAY = /\bday[\s-]*(?:\d+|one|two|three)\b|\bfirst day\b/i;

/** In order: the first that matches is the genre. A unit and the skill lessons come before the reading genres they mention. */
const READ: Array<[Genre, RegExp]> = [
  ['seminar', /\bsocratic\b|\bseminar\b|\bfishbowl\b|\bharkness\b/i],
  ['research', /\bresearch\b|\bevaluat\w* (?:sources|websites|evidence)\b|\bcredib\w*\b|\bcitations?\b|\bcit(?:e|ing) sources\b|\bannotated bibliograph\w*\b/i],
  ['grammar', /\bgrammar\b|\bsemicolons?\b|\bcommas?\b|\bpunctuation\b|\bapostrophes?\b|\bcomma splices?\b|\brun-?on sentences?\b|\bsentence fragments?\b|\bsubject-verb\b|\bparallel structure\b|\bclauses?\b|\bverb tenses?\b|\bmisplaced modifiers?\b|\bcolons?\b/i],
  ['writing', /\bwriting lesson\b|\bargument(?:ative)? (?:essay|writing|paragraph)s?\b|\bcounterclaims?\b|\brebuttals?\b|\bthesis statements?\b|\b(?:personal|narrative|college|literary analysis|expository|persuasive|informative) (?:essay|writing)s?\b|\btopic sentences?\b|\bclaim,? evidence\b|\bwrit(?:e|ing) (?:an|a) (?:essay|paragraph)\b/i],
  ['memoir', /\bmemoirs?\b|\bautobiograph\w*\b|\bnarrative of the life\b|\blearning to read and write\b|\bpersonal essays?\b|\belie wiesel\b|\bthe glass castle\b|\bcaged bird sings\b/i],
  ['speech', /\bspeech(?:es)?\b|\baddress\b|\brhetoric(?:al)?\b|\bop-?eds?\b|\bessay by\b|\bletter from (?:a )?birmingham\b|\bi have a dream\b|\bsermons?\b/i],
  ['poem', /\bpoe(?:m|ms|try|t|ts)\b|\bsonnets?\b|\bodes?\b|\bhaiku\b|\bstanzas?\b|\bvillanelles?\b|\bozymandias\b|\bwe real cool\b|\bdulce et decorum\b|\bthe raven\b|\broad not taken\b|\bdo not go gentle\b/i],
  ['play', /\bplay\b|\bdrama\b|\bact (?:\d|[ivx]+)\b|\bscene (?:\d|[ivx]+)\b|\bsoliloqu\w*\b|\bshakespeare\b|\bhamlet\b|\bmacbeth\b|\bromeo\b|\bjuliet\b|\bothello\b|\bking lear\b|\bjulius caesar\b|\bthe crucible\b|\bdeath of a salesman\b|\braisin in the sun\b|\bantigone\b|\boedipus\b|\bmidsummer\b|\bthe tempest\b|\bglass menagerie\b|\bour town\b|\bstreetcar named desire\b/i],
  ['story', /\bshort stor(?:y|ies)\b|\bthe necklace\b|\bthe lottery\b|\bmost dangerous game\b|\btell-tale heart\b|\bgift of the magi\b|\bharrison bergeron\b|\byellow wall-?paper\b|\bstory\b/i],
  ['novel', /\bnovels?\b|\bchapters?\b|\bgatsby\b|\bmockingbird\b|\bof mice and men\b|\blord of the flies\b|\b1984\b|\bfrankenstein\b|\bscarlet letter\b|\btheir eyes were watching god\b|\bthings fall apart\b|\bthe outsiders\b|\bjane eyre\b|\bpride and prejudice\b|\bbeloved\b|\bkite runner\b|\bfahrenheit 451\b|\bbrave new world\b|\bcatcher in the rye\b/i],
];

function genreOf(text: string): Genre | null {
  if (plansSeveralDays(text) && !ONE_DAY.test(text)) return 'unit';
  for (const [genre, pattern] of READ) if (pattern.test(text)) return genre;
  return null;
}

/** The genre of the lesson: from the latest message that says, else null. Latest first. */
export function readGenre(messages: string[]): Genre | null {
  for (const message of messages) {
    const genre = genreOf(message ?? '');
    if (genre) return genre;
  }
  return null;
}

type GenreSet = {
  name: string;
  /** Its own rules, as drafted in the Nov 24 types test. */
  own: string[];
  /** General rules that made this genre's test lesson worse: switched off. */
  off: string[];
  /** General rules this genre reads its own way. */
  read: string[];
};

// The drafts of the Nov 24 types test (docs/plans/2026-11-24-rules-by-lesson-type.md).
const L1 = 'Meet the people first. Before the first read, the main characters are introduced by name, title and relationship ("Mathilde; her husband, Loisel; her friend, Mme Forestier"), never what they want or are like.';
const L2_PLAY = 'Hear it. The play is cast and spoken aloud. Say how this play\'s lines sound (the witches\' four-beat chant), not a general note on blank verse.';
const L2_POEM = 'Hear it. The poem is heard at least twice before any analysis, and the lesson says how its lines sound.';
const L3 = 'Short texts whole. A short story or poem in the public domain is printed whole, with paragraph or line numbers, from a named translation when it is translated.';
const L4 = 'No spoilers. No plot turn (a twist, a death, an ending) is on a slide or in a prompt before students have read it.';
const L5 = 'Name the device, ask its effect. Form and devices are taught directly; what they do to the meaning is always asked.';
const L6 = 'Proportion: at most ten minutes of context. A map or timeline only when place or time is part of the meaning.';
const N1 = 'The rhetorical situation first. Speaker, audience, occasion, purpose and what constrained the speaker go on one slide, with pictures of the occasion. This replaces a context day\'s map and world.';
const N2 = 'The issue and the claim. Students find the author\'s claim and how it is made. A claim the author states outright may be quoted; how it works and whether it succeeds is asked.';
const N3 = 'Structure before devices. Students see the text\'s moves in order (a diagram) before they analyze single devices. A speech is heard spoken.';
const N4 = 'Two voices. Students hear the child then and the writer now, and look for where the older writer comments on the younger.';
const N5 = 'The text in its moment. Students judge the argument against the audience it had to move, with one primary source from the time when a unit allows.';
const W1 = 'Compose live. Before students write, the teacher drafts an example live, thinking aloud and revising, not only analyzing a finished model.';
const W2 = 'A short checklist. Every writing task has at most three success criteria, and time for students to check and revise their draft against them.';
const W3 = 'Their own writing. When the request says "in their own writing", at least a third of the period goes to students applying the skill to their own draft, with a before-and-after and one sentence on why the change works.';
const W4 = 'Grammar by contrast. Show the rule through wrong-and-right pairs, with the structure marked. Practice mixes correct and incorrect items, and the lesson teaches when not to use the structure.';
const W5 = 'The model is the visual. The memorable form is the model paragraph or sentence with its moves marked in color, never a stock picture.';
const W6 = 'Mentor texts Yawp! writes are labeled as written by Yawp!, identical wherever they appear, and contain only evidence that is accurate or clearly hypothetical.';

const ARC_SKILL = 'The lesson arc: open on the students\' own experience of the move (a time they argued, were persuaded, were confused by a sentence), teach the move directly, show a model, then they try.';
const ACCESS_SKILL = 'Access: sentence frames, a partly done model, a shorter example and a partner check, rather than notes on verse or dialect.';
const NO_WORLD = 'the context and world slides: no map, timeline, world slide, author portrait or title-slide poster of a place (there is no world to set)';
const NO_THEME = '"never tell": a skill lesson states its rule and its success criteria plainly';

const SETS: Record<Genre, GenreSet> = {
  novel: {
    name: 'a novel',
    own: [L1, L4, L5],
    off: [],
    read: [
      'The reading in hand: a novel is too long to print, so print the passage students mark (or a labeled slot for the teacher\'s pages) and say on the read slide where it starts and ends, by chapter and page.',
      'A cast slide gives names, titles and relationships only. What a character wants is for students to find.',
      'Care: day 1 warns of hard content anywhere in the book, not only in today\'s pages.',
    ],
  },
  play: {
    name: 'a play',
    own: [L1, L2_PLAY, L4, L5],
    off: [],
    read: [
      'Tell who is who and what happens; never what a speech means.',
      'Access: verse gets one line on how to read it, to the punctuation, not the line end.',
      'The places on a map are the play\'s own (Glamis, Inverness, Forres), never a modern town of the same name.',
    ],
  },
  poem: {
    name: 'a poem',
    own: [L2_POEM, L3, L5, L6],
    off: [],
    read: [
      'Tell the poet\'s dates and the form\'s name; ask what the lines do.',
      'In one period, "found over time" means the opening question comes back at the close.',
      'The world slides, map and timeline only when place or time is part of the poem\'s meaning.',
    ],
  },
  story: {
    name: 'a short story',
    own: [L1, L3, L4, L5, L6],
    off: [],
    read: [
      'A translated story is printed from a named public-domain translation, never recalled.',
      'Read the whole story when the lesson turns on its ending.',
      'In one period, "found over time" means the opening question comes back at the close.',
    ],
  },
  speech: {
    name: 'a speech or essay',
    own: [N1, N2, N3, N5],
    off: [],
    read: [
      'The lesson arc: open on the issue as a question about students\' own experience, then bring in the speech against what they said.',
      'Topic and theme read as the issue and the author\'s claim (N2).',
    ],
  },
  memoir: {
    name: 'a memoir',
    own: [N2, N4, N1],
    off: [],
    read: [
      'Real people, the writer included, get their faces on the slide that talks about them.',
      'Topic and theme read as the issue and the author\'s claim (N2).',
    ],
  },
  writing: {
    name: 'a writing lesson (argument, narrative, analysis)',
    own: [W1, W2, W3, W5, W6],
    off: [NO_WORLD, NO_THEME, 'the "quotations were checked against" line (no work is read)'],
    read: [
      ARC_SKILL,
      'The text in hand is the model: the same version on the slide and the handout.',
      ACCESS_SKILL,
    ],
  },
  grammar: {
    name: 'a grammar lesson',
    own: [W4, W1, W3, W5],
    off: [NO_WORLD, NO_THEME, 'pictures from a subject\'s world (a sentence with its structure marked is the visual)', 'the "quotations were checked against" line (no work is read)'],
    read: [ARC_SKILL, ACCESS_SKILL],
  },
  research: {
    name: 'a research lesson',
    own: [
      'Real sources in hand. Students examine real, checkable sources (a printed page or screenshot with author, date and address), or a labeled slot for the teacher\'s own. Never summaries that already judge the source, and never invented books, authors or citations.',
      'Lateral reading. Students leave the page to find out who is behind it, alongside any checklist. Relevance to the student\'s own question is taught before it is assessed.',
      'Build at once. With no topic given, build the lesson around "[the class\'s research topic]". Never open by asking what the class is reading.',
      W2,
    ],
    off: [NO_WORLD, NO_THEME, 'the "quotations were checked against" line (no work is read)'],
    read: [
      ARC_SKILL,
      'The texts are the sources: the visual is the source itself, with its author, date and address.',
      'Access: a shorter source and a partner check.',
    ],
  },
  seminar: {
    name: 'a Socratic seminar',
    own: [
      'A prep sheet. Students get the questions in advance, with room to note a passage and its page for each.',
      'A structure to run and assess: inner and outer circles, or a tracker of who speaks, cites and builds, with a task for the outer circle.',
      'The teacher\'s map. For each question, the notes list the passages students are likely to bring and one follow-up for each.',
    ],
    off: ['pictures and dual coding: the slides are the questions, without pictures', NO_WORLD],
    read: [
      'The lesson arc: open on the seminar\'s big question; the text comes in through the passages students bring.',
      'Model first: model one seminar move (quoting with a page, building on a peer) before round 1.',
      'Check during: a 60-second write before round 2.',
    ],
  },
  unit: {
    name: 'a unit',
    own: [
      'Every chapter accounted for. Each chapter is assigned, or skipped with a reason, at a pace a class can keep (about 15 to 20 pages a night).',
      'A tracker across the unit: a topic tracker for literature, an argument tracker for nonfiction (claim, evidence, appeal to the audience of the time). Students turn it into their own statement before they draft.',
      'Care for the whole book. Day 1 warns of hard content anywhere in the book, with respectful words to use.',
    ],
    off: [],
    read: ['The map\'s day titles and the essay prompt never state a theme; the tracker collects what students find.'],
  },
};

/** The genre's own set, as a section of the planner's instructions. */
export function genreRulesSection(genre: Genre): string[] {
  const set = SETS[genre];
  return [
    '',
    `THIS LESSON IS ${set.name.toUpperCase()}. Every rule above still applies, except where this section says otherwise. These are its own rules:`,
    ...set.own.map((rule) => `- ${rule}`),
    ...(set.read.length ? [`Read these general rules this way for ${set.name}:`, ...set.read.map((rule) => `- ${rule}`)] : []),
    ...(set.off.length ? [`Do not apply here, for ${set.name}:`, ...set.off.map((rule) => `- ${rule}`)] : []),
  ];
}
