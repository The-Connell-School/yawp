/**
 * The public-domain works high school English teaches most, each with the
 * Project Gutenberg plain text a quotation is checked against (Nov 22;
 * docs/plans/2026-11-22-lesson-quality-review-and-plan.md, item 2). Every
 * lesson reviewed that day had a quotation or fact written from memory.
 *
 * `check` is a phrase the fetched text must contain. A wrong ebook number,
 * or a page that is not the work, then gives no text at all rather than the
 * wrong one to check against. `idConfidence: 'medium' | 'low'` marks the
 * numbers that were written from knowledge without being fetched (this
 * machine could not reach gutenberg.org when the list was made): the `check`
 * phrase is what keeps a wrong one harmless.
 *
 * Not here, because they are under copyright in the US: Their Eyes Were
 * Watching God, 1984, The Crucible, To Kill a Mockingbird, Of Mice and Men,
 * Frost's poems after 1928, and the Fagles, Fitzgerald, Lattimore, Lombardo
 * and Wilson translations of Homer. A lesson on one of those is fact-checked
 * by the model only.
 */

/** How the work is divided, for saying where a quotation is. */
export type WorkStructure = 'acts' | 'chapters' | 'books' | 'poems';

export type RegisteredWork = {
  /** A short stable id, e.g. `macbeth`. */
  id: string;
  title: string;
  author: string;
  gutenbergId: number;
  structure: WorkStructure;
  /** What the lesson might call it: titles, poem titles, the author. Case-insensitive, whole words. */
  names: string[];
  /** A phrase the fetched text must contain, or it is not this work. */
  check: string;
  /** The edition or translation the text is, named in every correction. */
  edition: string;
  /**
   * The text is one translation, or one edition, among several a lesson may
   * use: quotations are only checked (never corrected) against it. Homer in
   * Butler is not Fagles; Dickinson's 1890s editors changed her words.
   */
  verifyOnly?: boolean;
  /**
   * One public-domain translation of a work the class may read in another
   * (Homer, Sophocles): the teacher's own pages, when they add them, come
   * first (Nov 23).
   */
  translated?: boolean;
  idConfidence?: 'medium' | 'low';
  note?: string;
};

const shakespeare = (
  id: string,
  title: string,
  gutenbergId: number,
  names: string[],
  check: string,
  idConfidence?: 'medium'
): RegisteredWork => ({
  id,
  title,
  author: 'William Shakespeare',
  gutenbergId,
  structure: 'acts',
  names,
  check,
  edition: `the Project Gutenberg text of ${title}`,
  ...(idConfidence ? { idConfidence } : {}),
});

export const SOURCE_TEXT_WORKS: readonly RegisteredWork[] = [
  shakespeare('macbeth', 'Macbeth', 1533, ['Macbeth'], 'Lady Macbeth'),
  shakespeare('hamlet', 'Hamlet', 1524, ['Hamlet'], 'Polonius'),
  shakespeare(
    'romeo-and-juliet',
    'Romeo and Juliet',
    1513,
    ['Romeo and Juliet', 'Romeo & Juliet'],
    'Mercutio'
  ),
  shakespeare('othello', 'Othello', 1531, ['Othello'], 'Iago'),
  shakespeare(
    'julius-caesar',
    'Julius Caesar',
    1522,
    ['Julius Caesar'],
    'Brutus',
    'medium'
  ),
  shakespeare(
    'midsummer',
    "A Midsummer Night's Dream",
    1514,
    ["A Midsummer Night's Dream", 'Midsummer Night’s Dream', 'Midsummer'],
    'Titania'
  ),
  shakespeare(
    'king-lear',
    'King Lear',
    1532,
    ['King Lear'],
    'Cordelia',
    'medium'
  ),
  shakespeare(
    'the-tempest',
    'The Tempest',
    1540,
    ['The Tempest'],
    'Prospero',
    'medium'
  ),
  {
    id: 'shakespeare-sonnets',
    title: "Shakespeare's Sonnets",
    author: 'William Shakespeare',
    gutenbergId: 1041,
    structure: 'poems',
    names: [
      "Shakespeare's sonnets",
      'Shakespeare’s sonnets',
      'Sonnet 18',
      'Sonnet 130',
      'Sonnet 116',
      'Sonnet 73',
      'Sonnet 29',
    ],
    check: 'summer’s day',
    edition: "the Project Gutenberg text of Shakespeare's Sonnets",
  },
  {
    id: 'odyssey',
    title: 'The Odyssey',
    author: 'Homer',
    gutenbergId: 1727,
    structure: 'books',
    names: ['Odyssey', 'Odysseus'],
    check: 'Telemachus',
    edition: "Samuel Butler's translation (1900)",
    verifyOnly: true,
    translated: true,
    note: 'Public domain in Butler only. Fagles (1996), Fitzgerald (1961), Lombardo and Wilson (2017) are under copyright.',
  },
  {
    // Kevin's Antigone unit (Nov 23): the planner said "Antigone is in the
    // public domain, so I can quote it directly" and printed Fitts and
    // Fitzgerald (1939) from memory. Sophocles is; most school translations
    // are not. Storr's (1912) is: the planner prints it, and a line of it
    // misremembered is corrected. A line of another translation is not near
    // enough to Storr's to be rewritten; it is only not found.
    id: 'sophocles-theban',
    title: 'Antigone, Oedipus the King and Oedipus at Colonus',
    author: 'Sophocles',
    gutenbergId: 31,
    structure: 'poems',
    names: ['Antigone', 'Oedipus Rex', 'Oedipus the King', 'Oedipus Tyrannus', 'Oedipus at Colonus'],
    check: 'Creon',
    edition: "F. Storr's translation (1912)",
    translated: true,
    idConfidence: 'medium',
    note: 'Public domain in Storr (1912) and Jebb (1891). Fitts and Fitzgerald (1939), Fagles (1982) and Woodruff (2001) are under copyright.',
  },
  {
    id: 'iliad',
    title: 'The Iliad',
    author: 'Homer',
    gutenbergId: 2199,
    structure: 'books',
    names: ['Iliad', 'Achilles'],
    check: 'Agamemnon',
    edition: "Samuel Butler's translation (1898)",
    verifyOnly: true,
    translated: true,
    note: 'Public domain in Butler only. Fagles, Fitzgerald and Lattimore are under copyright.',
  },
  {
    id: 'frankenstein',
    title: 'Frankenstein',
    author: 'Mary Shelley',
    gutenbergId: 84,
    structure: 'chapters',
    names: ['Frankenstein'],
    check: 'Elizabeth',
    edition: 'the Project Gutenberg text of Frankenstein',
  },
  {
    id: 'great-gatsby',
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    gutenbergId: 64317,
    structure: 'chapters',
    names: ['The Great Gatsby', 'Gatsby'],
    check: 'Daisy',
    edition: 'the 1925 text (Project Gutenberg)',
    note: 'US public domain since January 1, 2021.',
  },
  {
    id: 'wilfred-owen',
    title: 'Poems by Wilfred Owen',
    author: 'Wilfred Owen',
    gutenbergId: 57265,
    structure: 'poems',
    names: [
      'Wilfred Owen',
      'Dulce et Decorum Est',
      'Anthem for Doomed Youth',
      'Strange Meeting',
      'Futility',
      'The Send-Off',
      'Spring Offensive',
      'Mental Cases',
      'Insensibility',
    ],
    check: 'Bent double, like old beggars under sacks',
    edition: 'Poems (1920), edited by Siegfried Sassoon',
    idConfidence: 'low',
  },
  {
    id: 'scarlet-letter',
    title: 'The Scarlet Letter',
    author: 'Nathaniel Hawthorne',
    gutenbergId: 25344,
    structure: 'chapters',
    names: ['The Scarlet Letter', 'Hester Prynne'],
    check: 'Hester',
    edition: 'the Project Gutenberg text of The Scarlet Letter',
  },
  {
    id: 'pride-and-prejudice',
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    gutenbergId: 1342,
    structure: 'chapters',
    names: ['Pride and Prejudice'],
    check: 'Darcy',
    edition: 'the Project Gutenberg text of Pride and Prejudice',
  },
  {
    id: 'jane-eyre',
    title: 'Jane Eyre',
    author: 'Charlotte Brontë',
    gutenbergId: 1260,
    structure: 'chapters',
    names: ['Jane Eyre'],
    check: 'Rochester',
    edition: 'the Project Gutenberg text of Jane Eyre',
  },
  {
    id: 'huckleberry-finn',
    title: 'Adventures of Huckleberry Finn',
    author: 'Mark Twain',
    gutenbergId: 76,
    structure: 'chapters',
    names: ['Huckleberry Finn', 'Huck Finn'],
    check: 'Tom Sawyer',
    edition: 'the Project Gutenberg text of Adventures of Huckleberry Finn',
  },
  {
    id: 'tom-sawyer',
    title: 'The Adventures of Tom Sawyer',
    author: 'Mark Twain',
    gutenbergId: 74,
    structure: 'chapters',
    names: ['The Adventures of Tom Sawyer'],
    check: 'Aunt Polly',
    edition: 'the Project Gutenberg text of The Adventures of Tom Sawyer',
  },
  {
    id: 'the-raven',
    title: 'The Raven',
    author: 'Edgar Allan Poe',
    gutenbergId: 17192,
    structure: 'poems',
    names: ['The Raven', 'Nevermore'],
    check: 'Nevermore',
    edition: 'the Project Gutenberg text of The Raven',
    idConfidence: 'medium',
  },
  {
    id: 'poe-tales',
    title: 'The Works of Edgar Allan Poe, Volume 2',
    author: 'Edgar Allan Poe',
    gutenbergId: 2148,
    structure: 'poems',
    names: [
      'The Tell-Tale Heart',
      'The Cask of Amontillado',
      'The Fall of the House of Usher',
      'The Masque of the Red Death',
      'The Pit and the Pendulum',
      'The Black Cat',
    ],
    check: 'Amontillado',
    edition: 'The Works of Edgar Allan Poe, Raven Edition, Volume 2',
    idConfidence: 'medium',
  },
  {
    id: 'dickinson',
    title: 'Poems by Emily Dickinson, Three Series, Complete',
    author: 'Emily Dickinson',
    gutenbergId: 12242,
    structure: 'poems',
    names: ['Emily Dickinson', 'Dickinson'],
    check: 'Because I could not stop for Death',
    edition: 'the 1890–1896 editions by Todd and Higginson',
    verifyOnly: true,
    note: 'Her first editors changed words, punctuation and titles; modern texts (Johnson, Franklin) are under copyright and differ. Never corrected against.',
  },
  {
    id: 'whitman',
    title: 'Leaves of Grass',
    author: 'Walt Whitman',
    gutenbergId: 1322,
    structure: 'poems',
    names: [
      'Walt Whitman',
      'Leaves of Grass',
      'Song of Myself',
      'O Captain! My Captain!',
      'I Hear America Singing',
    ],
    check: 'I celebrate myself',
    edition: 'the 1891–92 ("deathbed") edition of Leaves of Grass',
  },
  {
    id: 'frost-a-boys-will',
    title: "A Boy's Will",
    author: 'Robert Frost',
    gutenbergId: 3021,
    structure: 'poems',
    names: ["A Boy's Will", 'Into My Own', 'Mowing', 'Reluctance'],
    check: 'Into My Own',
    edition: "A Boy's Will (1913)",
    idConfidence: 'medium',
  },
  {
    id: 'frost-north-of-boston',
    title: 'North of Boston',
    author: 'Robert Frost',
    gutenbergId: 3026,
    structure: 'poems',
    names: [
      'North of Boston',
      'Mending Wall',
      'The Death of the Hired Man',
      'After Apple-Picking',
      'Home Burial',
    ],
    check: 'Something there is that doesn',
    edition: 'North of Boston (1914)',
    idConfidence: 'medium',
  },
  {
    id: 'frost-mountain-interval',
    title: 'Mountain Interval',
    author: 'Robert Frost',
    gutenbergId: 29345,
    structure: 'poems',
    names: ['Mountain Interval', 'The Road Not Taken', 'Birches', 'Out, Out'],
    check: 'Two roads diverged',
    edition: 'Mountain Interval (1916)',
    idConfidence: 'medium',
  },
  {
    id: 'heart-of-darkness',
    title: 'Heart of Darkness',
    author: 'Joseph Conrad',
    gutenbergId: 219,
    structure: 'chapters',
    names: ['Heart of Darkness'],
    check: 'Kurtz',
    edition: 'the Project Gutenberg text of Heart of Darkness',
  },
  {
    id: 'christmas-carol',
    title: 'A Christmas Carol',
    author: 'Charles Dickens',
    gutenbergId: 46,
    structure: 'chapters',
    names: ['A Christmas Carol', 'Scrooge'],
    check: 'Scrooge',
    edition: 'the Project Gutenberg text of A Christmas Carol',
  },
  {
    id: 'great-expectations',
    title: 'Great Expectations',
    author: 'Charles Dickens',
    gutenbergId: 1400,
    structure: 'chapters',
    names: ['Great Expectations'],
    check: 'Havisham',
    edition: 'the Project Gutenberg text of Great Expectations',
  },
  {
    id: 'tale-of-two-cities',
    title: 'A Tale of Two Cities',
    author: 'Charles Dickens',
    gutenbergId: 98,
    structure: 'chapters',
    names: ['A Tale of Two Cities'],
    check: 'It was the best of times',
    edition: 'the Project Gutenberg text of A Tale of Two Cities',
  },
  {
    id: 'dracula',
    title: 'Dracula',
    author: 'Bram Stoker',
    gutenbergId: 345,
    structure: 'chapters',
    names: ['Dracula'],
    check: 'Harker',
    edition: 'the Project Gutenberg text of Dracula',
  },
  {
    id: 'dorian-gray',
    title: 'The Picture of Dorian Gray',
    author: 'Oscar Wilde',
    gutenbergId: 174,
    structure: 'chapters',
    names: ['The Picture of Dorian Gray', 'Dorian Gray'],
    check: 'Basil',
    edition: 'the Project Gutenberg text of The Picture of Dorian Gray',
  },
  {
    id: 'importance-of-being-earnest',
    title: 'The Importance of Being Earnest',
    author: 'Oscar Wilde',
    gutenbergId: 844,
    structure: 'acts',
    names: ['The Importance of Being Earnest'],
    check: 'Bracknell',
    edition: 'the Project Gutenberg text of The Importance of Being Earnest',
  },
  {
    id: 'jekyll-and-hyde',
    title: 'The Strange Case of Dr. Jekyll and Mr. Hyde',
    author: 'Robert Louis Stevenson',
    gutenbergId: 43,
    structure: 'chapters',
    names: ['Jekyll and Hyde', 'Dr. Jekyll'],
    check: 'Utterson',
    edition: 'the Project Gutenberg text of Dr. Jekyll and Mr. Hyde',
  },
  {
    id: 'douglass-narrative',
    title: 'Narrative of the Life of Frederick Douglass',
    author: 'Frederick Douglass',
    gutenbergId: 23,
    structure: 'chapters',
    names: [
      'Narrative of the Life of Frederick Douglass',
      'Frederick Douglass',
    ],
    check: 'Covey',
    edition: 'the Project Gutenberg text of the Narrative (1845)',
  },
  {
    id: 'yellow-wallpaper',
    title: 'The Yellow Wallpaper',
    author: 'Charlotte Perkins Gilman',
    gutenbergId: 1952,
    structure: 'poems',
    names: ['The Yellow Wallpaper', 'The Yellow Wall-Paper'],
    check: 'John',
    edition: 'the Project Gutenberg text of The Yellow Wallpaper',
  },
  {
    id: 'the-awakening',
    title: 'The Awakening',
    author: 'Kate Chopin',
    gutenbergId: 160,
    structure: 'chapters',
    names: ['The Awakening', 'Kate Chopin'],
    check: 'Pontellier',
    edition: 'the Project Gutenberg text of The Awakening',
  },
  {
    id: 'call-of-the-wild',
    title: 'The Call of the Wild',
    author: 'Jack London',
    gutenbergId: 215,
    structure: 'chapters',
    names: ['The Call of the Wild'],
    check: 'Buck',
    edition: 'the Project Gutenberg text of The Call of the Wild',
  },
  {
    id: 'a-dolls-house',
    title: "A Doll's House",
    author: 'Henrik Ibsen',
    gutenbergId: 2542,
    structure: 'acts',
    names: ["A Doll's House", 'A Doll’s House'],
    check: 'Helmer',
    edition: 'the Project Gutenberg translation of A Doll’s House',
    verifyOnly: true,
  },
  {
    id: 'beowulf',
    title: 'Beowulf',
    author: 'Anonymous (tr. Francis B. Gummere)',
    gutenbergId: 16328,
    structure: 'poems',
    names: ['Beowulf'],
    check: 'Grendel',
    edition: "Francis B. Gummere's translation (1910)",
    verifyOnly: true,
    note: 'Heaney (1999) is under copyright.',
  },
];
