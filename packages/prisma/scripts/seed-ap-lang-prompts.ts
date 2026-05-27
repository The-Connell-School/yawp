/**
 * Seed placeholder AP Lang prompt library entries.
 * Brian will replace these with curated College Board released prompts.
 *
 * Run: npx tsx packages/prisma/scripts/seed-ap-lang-prompts.ts
 */

import { PrismaClient } from '../generated/prisma';

const prisma = new PrismaClient();

const AP_LANG_KIND = 'ap-lang';

const placeholderPrompts = [
  {
    essayType: 'synthesis',
    title: 'Technology and Privacy (Placeholder)',
    promptBody:
      'The proliferation of digital technologies has raised significant questions about the balance between technological convenience and individual privacy. Read the following sources carefully. Then, in a well-written essay, synthesize at least three of the sources into a coherent, well-developed argument for your own position on the balance between technological innovation and privacy.',
    year: 2025,
    tags: ['technology', 'privacy', 'placeholder'],
  },
  {
    essayType: 'synthesis',
    title: 'Public Education Funding (Placeholder)',
    promptBody:
      'The debate over public education funding in the United States raises fundamental questions about equity, opportunity, and the role of government. Read the following sources carefully. Then, in a well-written essay that synthesizes at least three of the sources, develop your position on how public education should be funded.',
    year: 2025,
    tags: ['education', 'funding', 'placeholder'],
  },
  {
    essayType: 'rhetorical-analysis',
    title: 'Rhetorical Analysis Practice (Placeholder)',
    promptBody:
      'Read the following passage carefully. Then, in a well-written essay, analyze the rhetorical choices the author makes to argue for increased investment in renewable energy.',
    year: 2025,
    tags: ['environment', 'rhetoric', 'placeholder'],
  },
  {
    essayType: 'rhetorical-analysis',
    title: 'Commencement Address Analysis (Placeholder)',
    promptBody:
      'The following excerpt is from a commencement address delivered at a major university. Read the passage carefully. Then, in a well-written essay, analyze the rhetorical choices the speaker makes to convey their message about the importance of civic engagement.',
    year: 2025,
    tags: ['speech', 'civic engagement', 'placeholder'],
  },
  {
    essayType: 'argument',
    title: 'Individual vs. Collective Responsibility (Placeholder)',
    promptBody:
      '"The measure of a society is how it treats its most vulnerable members." In a well-written essay, develop your position on the extent to which individuals, rather than governments or institutions, bear responsibility for addressing social inequality.',
    year: 2025,
    tags: ['society', 'responsibility', 'placeholder'],
  },
  {
    essayType: 'argument',
    title: 'Value of Failure (Placeholder)',
    promptBody:
      '"Failure is simply the opportunity to begin again, this time more intelligently." — Henry Ford. In a well-written essay, develop your position on the role that failure plays in achieving success. Support your argument with evidence from your reading, experience, or observation.',
    year: 2025,
    tags: ['success', 'failure', 'placeholder'],
  },
];

async function main() {
  for (const prompt of placeholderPrompts) {
    const existing = await prisma.promptLibraryEntry.findFirst({
      where: {
        assignmentTypeKind: AP_LANG_KIND,
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
        assignmentTypeKind: AP_LANG_KIND,
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

  console.log('AP Lang prompt seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
