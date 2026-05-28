/**
 * Seed AP Lit prompt library entries from released College Board FRQs.
 *
 * COPYRIGHT: Prompt task text, poem/author attributions, and Q3 suggestion
 * lists are released by College Board (reproduced here). Poem and prose
 * PASSAGE bodies are third-party copyrighted and are NOT reproduced — Poetry
 * and Prose entries ship with a pre-labeled but EMPTY source slot the teacher
 * fills (paste or PDF upload). Literary Argument needs no passage and is
 * complete, including the suggestion list.
 *
 * Run: npx tsx packages/prisma/scripts/seed-ap-lit-prompts.ts
 */

import { PrismaClient } from '../generated/prisma';

const prisma = new PrismaClient();
const KIND = 'ap-lit';

type Source = { label: string; title?: string; attribution?: string; body: string };
type Entry = {
  essayType: string;
  title: string;
  promptBody: string;
  year?: number;
  tags?: string[];
  sourcePassages?: Source[];
};

const POETRY_TASK = (intro: string, focus: string) =>
  `${intro} Read the poem carefully. Then, in a well-written essay, analyze how the poet uses literary elements and techniques to convey ${focus}\n\nNote: The poem is copyrighted and is not included here. Add the poem text below (paste or upload the PDF) before assigning. Preserve the line breaks.`;

const PROSE_TASK = (intro: string, focus: string) =>
  `${intro} Read the passage carefully. Then, in a well-written essay, analyze how the author uses literary techniques to ${focus}\n\nNote: The passage is copyrighted and is not included here. Add the passage text below (paste or upload the PDF) before assigning.`;

const LIT_ARG_TASK = (concept: string, works: string) =>
  `${concept}\n\nThen, in a well-written essay, analyze how that element contributes to an interpretation of the work as a whole. Do not merely summarize the plot.\n\nYou may select a work from the list below or another work of literary merit:\n${works}`;

const entries: Entry[] = [
  // ───────────── Poetry Analysis (Q1) ─────────────
  {
    essayType: 'poetry-analysis',
    title: 'Colleen J. McElroy, "Monologue for Saint Louis" (2025, Set 1)',
    year: 2025,
    tags: ['poetry', 'source-required'],
    promptBody: POETRY_TASK(
      'The following poem is "Monologue for Saint Louis" by Colleen J. McElroy (1980).',
      "the speaker's complex experience of returning home."
    ),
    sourcePassages: [{ label: 'Poem', title: 'Monologue for Saint Louis', attribution: 'Colleen J. McElroy (1980)', body: '' }],
  },
  {
    essayType: 'poetry-analysis',
    title: 'John Rollin Ridge, "To a Star Seen at Twilight" (2024, Set 1)',
    year: 2024,
    tags: ['poetry', 'source-required'],
    promptBody: POETRY_TASK(
      'The following poem is "To a Star Seen at Twilight" by John Rollin Ridge (1868).',
      "the speaker's complex reflection on the star."
    ),
    sourcePassages: [{ label: 'Poem', title: 'To a Star Seen at Twilight', attribution: 'John Rollin Ridge (1868)', body: '' }],
  },
  {
    essayType: 'poetry-analysis',
    title: 'Alice Cary, "Autumn" (2023, Set 1)',
    year: 2023,
    tags: ['poetry', 'source-required'],
    promptBody: POETRY_TASK(
      'The following poem is "Autumn" by Alice Cary (19th century).',
      'the complex portrayal of autumn.'
    ),
    sourcePassages: [{ label: 'Poem', title: 'Autumn', attribution: 'Alice Cary', body: '' }],
  },
  {
    essayType: 'poetry-analysis',
    title: 'Richard Blanco, "Shaving" (2022)',
    year: 2022,
    tags: ['poetry', 'source-required'],
    promptBody: POETRY_TASK(
      'The following poem is "Shaving" by Richard Blanco (1998).',
      "the speaker's complex associations with the ritual of shaving."
    ),
    sourcePassages: [{ label: 'Poem', title: 'Shaving', attribution: 'Richard Blanco (1998)', body: '' }],
  },
  {
    essayType: 'poetry-analysis',
    title: 'Olive Senior, "Plants" (2018)',
    year: 2018,
    tags: ['poetry', 'source-required'],
    promptBody: POETRY_TASK(
      'The following poem is "Plants" by Olive Senior (2005).',
      'the complex relationships among the speaker, the audience, and plants.'
    ),
    sourcePassages: [{ label: 'Poem', title: 'Plants', attribution: 'Olive Senior (2005)', body: '' }],
  },
  {
    essayType: 'poetry-analysis',
    title: 'William Shakespeare, "Sonnet 30" (2012)',
    year: 2012,
    tags: ['poetry', 'source-required'],
    promptBody: POETRY_TASK(
      'The following poem is "Sonnet 30" ("When to the sessions of sweet silent thought") by William Shakespeare (1609).',
      "the speaker's view of memory."
    ),
    sourcePassages: [{ label: 'Poem', title: 'Sonnet 30', attribution: 'William Shakespeare (1609)', body: '' }],
  },

  // ───────────── Prose Fiction Analysis (Q2) ─────────────
  {
    essayType: 'prose-fiction-analysis',
    title: 'Rachel Cusk, The Bradshaw Variations (2025, Set 1)',
    year: 2025,
    tags: ['prose', 'source-required'],
    promptBody: PROSE_TASK(
      'The following passage is from Rachel Cusk\'s novel The Bradshaw Variations (2008).',
      'develop the complex portrayal of Thomas.'
    ),
    sourcePassages: [{ label: 'Passage', title: 'The Bradshaw Variations', attribution: 'Rachel Cusk (2008)', body: '' }],
  },
  {
    essayType: 'prose-fiction-analysis',
    title: 'Mavis Gallant, "One Morning in June" (2024, Set 1)',
    year: 2024,
    tags: ['prose', 'source-required'],
    promptBody: PROSE_TASK(
      'The following passage is from Mavis Gallant\'s short story "One Morning in June" (1952).',
      "develop Mike's complex experience of studying painting."
    ),
    sourcePassages: [{ label: 'Passage', title: 'One Morning in June', attribution: 'Mavis Gallant (1952)', body: '' }],
  },
  {
    essayType: 'prose-fiction-analysis',
    title: 'Nisi Shawl, Everfair (2023, Set 1)',
    year: 2023,
    tags: ['prose', 'source-required'],
    promptBody: PROSE_TASK(
      'The following passage is from Nisi Shawl\'s novel Everfair (2016), in which Lisette cycles through the French countryside in 1889.',
      "develop Lisette's complex experience."
    ),
    sourcePassages: [{ label: 'Passage', title: 'Everfair', attribution: 'Nisi Shawl (2016)', body: '' }],
  },
  {
    essayType: 'prose-fiction-analysis',
    title: 'Linda Hogan, People of the Whale (2022)',
    year: 2022,
    tags: ['prose', 'source-required'],
    promptBody: PROSE_TASK(
      'The following passage is from Linda Hogan\'s novel People of the Whale (2008).',
      'develop the complex characterization of the community.'
    ),
    sourcePassages: [{ label: 'Passage', title: 'People of the Whale', attribution: 'Linda Hogan (2008)', body: '' }],
  },
  {
    essayType: 'prose-fiction-analysis',
    title: 'Nathaniel Hawthorne, The Blithedale Romance (2018)',
    year: 2018,
    tags: ['prose', 'source-required'],
    promptBody: PROSE_TASK(
      'The following passage is from Nathaniel Hawthorne\'s novel The Blithedale Romance (1852).',
      "develop the narrator's complex attitude toward Zenobia."
    ),
    sourcePassages: [{ label: 'Passage', title: 'The Blithedale Romance', attribution: 'Nathaniel Hawthorne (1852)', body: '' }],
  },
  {
    essayType: 'prose-fiction-analysis',
    title: 'Thomas Hardy, The Mayor of Casterbridge (2016)',
    year: 2016,
    tags: ['prose', 'source-required'],
    promptBody: PROSE_TASK(
      'The following passage is from Thomas Hardy\'s novel The Mayor of Casterbridge (1886).',
      'develop the complex relationship between Henchard and Elizabeth-Jane.'
    ),
    sourcePassages: [{ label: 'Passage', title: 'The Mayor of Casterbridge', attribution: 'Thomas Hardy (1886)', body: '' }],
  },

  // ───────────── Literary Argument (Q3) — complete ─────────────
  {
    essayType: 'literary-argument',
    title: 'A Character Affected by Memory (2025, Set 1)',
    year: 2025,
    tags: ['literary-argument', 'memory'],
    promptBody: LIT_ARG_TASK(
      'Many works of literature feature a character who is significantly affected by a memory of the past — inspired, haunted, or motivated by it. Either from your own reading or from the list below, choose a work of fiction in which a character is significantly affected by a memory.',
      'Afterlife, Beloved, The Buried Giant, Ceremony, Crime and Punishment, A Doll\'s House, The English Patient, Fences, The Glass Menagerie, Invisible Man, Kindred, Macbeth, The Mayor of Casterbridge, Mrs. Dalloway, The Nickel Boys, On Earth We\'re Briefly Gorgeous, Purple Hibiscus, The Scarlet Letter, A Tale of Two Cities, The Woman Warrior, Wuthering Heights'
    ),
  },
  {
    essayType: 'literary-argument',
    title: 'A Character Who Delays a Decision (2024, Set 1)',
    year: 2024,
    tags: ['literary-argument', 'indecision'],
    promptBody: LIT_ARG_TASK(
      'Many works of literature feature a character who delays or avoids making a decision. Either from your own reading or from the list below, choose a work of fiction in which a character delays or avoids a decision.',
      'The Age of Innocence, Anna Karenina, Beloved, Frankenstein, Jane Eyre, The Kite Runner, Madame Bovary, The Metamorphosis, A Raisin in the Sun, The Stranger, Tess of the d\'Urbervilles, Wuthering Heights'
    ),
  },
  {
    essayType: 'literary-argument',
    title: 'A Problematic Return Home (2023, Set 1)',
    year: 2023,
    tags: ['literary-argument', 'home'],
    promptBody: LIT_ARG_TASK(
      'Many works of literature feature a character whose return home is problematic — home is not what it was. Either from your own reading or from the list below, choose a work of fiction in which a character returns home.',
      'Beloved, The Brief Wondrous Life of Oscar Wao, Crime and Punishment, Their Eyes Were Watching God, The Namesake, Mrs. Dalloway, The Odyssey, A Raisin in the Sun, Sula, The Tempest'
    ),
  },
  {
    essayType: 'literary-argument',
    title: 'A Response to Hierarchy (2022)',
    year: 2022,
    tags: ['literary-argument', 'power'],
    promptBody: LIT_ARG_TASK(
      'Many works of literature feature a character who responds to a hierarchy — social, economic, political, or familial. Either from your own reading or from the list below, choose a work of fiction in which a character responds to a hierarchy.',
      'Beloved, The Great Gatsby, Hamlet, Invisible Man, Jane Eyre, King Lear, Pride and Prejudice, A Raisin in the Sun, The Remains of the Day, Things Fall Apart, Wuthering Heights'
    ),
  },
  {
    essayType: 'literary-argument',
    title: 'A House as Significant Symbol (2021)',
    year: 2021,
    tags: ['literary-argument', 'symbol'],
    promptBody: LIT_ARG_TASK(
      'Many works of literature feature a literal or unconventional house that functions as a significant symbol. Either from your own reading or from the list below, choose a work of fiction in which a house is a significant symbol.',
      'Beloved, Bleak House, The Fall of the House of Usher, Howards End, Jane Eyre, The House of the Spirits, The House on Mango Street, Mrs. Dalloway, Wuthering Heights'
    ),
  },
  {
    essayType: 'literary-argument',
    title: 'A Gift That Is Advantage and Burden (2018)',
    year: 2018,
    tags: ['literary-argument', 'gift'],
    promptBody: LIT_ARG_TASK(
      'Many works of literature feature a literal or figurative gift that is both an advantage and a burden. Either from your own reading or from the list below, choose a work of fiction in which a character receives such a gift.',
      'Beloved, Frankenstein, The Great Gatsby, Hamlet, The Importance of Being Earnest, Invisible Man, Jane Eyre, The Kite Runner, Macbeth, Their Eyes Were Watching God'
    ),
  },
  {
    essayType: 'literary-argument',
    title: 'Cruelty as a Motivating Force (2015)',
    year: 2015,
    tags: ['literary-argument', 'cruelty'],
    promptBody: LIT_ARG_TASK(
      'Many works of literature present cruelty as a crucial motivation or as a major social or political factor. Either from your own reading or from the list below, choose a work of fiction in which cruelty plays such a role.',
      'Beloved, Crime and Punishment, The Great Gatsby, Hamlet, Heart of Darkness, Jane Eyre, King Lear, Othello, A Streetcar Named Desire, Wuthering Heights'
    ),
  },
  {
    essayType: 'literary-argument',
    title: 'A Character Who Reinvents Themselves (2026)',
    year: 2026,
    tags: ['literary-argument', 'reinvention'],
    promptBody: LIT_ARG_TASK(
      'Many works of literature feature a character who reinvents themselves — through separation, access, disguise, or a search for authenticity. Either from your own reading or from the list below, choose a work of fiction in which a character reinvents themselves.',
      'The Great Gatsby, Invisible Man, Jane Eyre, The Namesake, Passing, Their Eyes Were Watching God, Twelfth Night, The Talented Mr. Ripley'
    ),
  },
];

async function main() {
  for (const entry of entries) {
    const existing = await prisma.promptLibraryEntry.findFirst({
      where: {
        assignmentTypeKind: KIND,
        essayType: entry.essayType,
        title: entry.title,
        isSystem: true,
      },
    });
    if (existing) {
      console.log(`  skip: ${entry.title}`);
      continue;
    }
    await prisma.promptLibraryEntry.create({
      data: {
        assignmentTypeKind: KIND,
        essayType: entry.essayType,
        title: entry.title,
        promptBody: entry.promptBody,
        year: entry.year ?? null,
        tags: entry.tags ?? null,
        sourcePassages: entry.sourcePassages ?? null,
        isSystem: true,
        createdById: null,
      },
    });
    console.log(`  created: ${entry.title}`);
  }
  console.log('AP Lit prompt seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
