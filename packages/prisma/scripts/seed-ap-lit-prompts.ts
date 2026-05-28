/**
 * Seed placeholder AP Lit prompt library entries.
 * Brian will replace these with curated College Board released prompts.
 *
 * Run: npx tsx packages/prisma/scripts/seed-ap-lit-prompts.ts
 */

import { PrismaClient } from '../generated/prisma';

const prisma = new PrismaClient();

const AP_LIT_KIND = 'ap-lit';

const placeholderPrompts = [
  {
    essayType: 'poetry-analysis',
    title: 'Poetry Analysis Practice (Placeholder)',
    promptBody:
      'Read the following poem carefully. Then, in a well-written essay, analyze how the poet uses literary elements and techniques to convey the speaker\'s complex attitude toward the natural world.',
    year: 2025,
    tags: ['poetry', 'placeholder'],
  },
  {
    essayType: 'poetry-analysis',
    title: 'Poetry Analysis: Memory (Placeholder)',
    promptBody:
      'Read the following poem carefully. Then, in a well-written essay, analyze how the poet uses literary techniques to develop the speaker\'s relationship to memory.',
    year: 2025,
    tags: ['poetry', 'memory', 'placeholder'],
  },
  {
    essayType: 'prose-fiction-analysis',
    title: 'Prose Fiction Analysis Practice (Placeholder)',
    promptBody:
      'Read the following passage carefully. Then, in a well-written essay, analyze how the author uses literary techniques to portray the protagonist\'s changing understanding of their family.',
    year: 2025,
    tags: ['prose', 'placeholder'],
  },
  {
    essayType: 'prose-fiction-analysis',
    title: 'Prose Analysis: Conflict (Placeholder)',
    promptBody:
      'Read the following passage carefully. Then, in a well-written essay, analyze how the author uses literary techniques to develop the central conflict of the passage.',
    year: 2025,
    tags: ['prose', 'conflict', 'placeholder'],
  },
  {
    essayType: 'literary-argument',
    title: 'Literary Argument: Isolation (Placeholder)',
    promptBody:
      'Many works of literature feature a character who experiences isolation. Choose a novel or play in which a character is isolated from others. Then, in a well-written essay, analyze how the character\'s isolation contributes to an interpretation of the work as a whole.',
    year: 2025,
    tags: ['literary-argument', 'isolation', 'placeholder'],
  },
  {
    essayType: 'literary-argument',
    title: 'Literary Argument: Power (Placeholder)',
    promptBody:
      'In many works of literature, a character pursues or wields power. Choose a novel or play in which power plays a significant role. Then, in a well-written essay, analyze how the depiction of power contributes to an interpretation of the work as a whole.',
    year: 2025,
    tags: ['literary-argument', 'power', 'placeholder'],
  },
];

async function main() {
  for (const prompt of placeholderPrompts) {
    const existing = await prisma.promptLibraryEntry.findFirst({
      where: {
        assignmentTypeKind: AP_LIT_KIND,
        essayType: prompt.essayType,
        title: prompt.title,
        isSystem: true,
      },
    });

    if (existing) {
      console.log(`  skip: ${prompt.title} (already exists)`);
      continue;
    }

    await prisma.promptLibraryEntry.create({
      data: {
        assignmentTypeKind: AP_LIT_KIND,
        essayType: prompt.essayType,
        title: prompt.title,
        promptBody: prompt.promptBody,
        year: prompt.year,
        tags: prompt.tags,
        isSystem: true,
        createdById: null,
      },
    });
    console.log(`  created: ${prompt.title}`);
  }

  console.log('AP Lit prompt seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
