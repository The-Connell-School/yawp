/**
 * Seed AP Lang prompt library entries from released College Board FRQs.
 *
 * COPYRIGHT: College Board releases the prompt TASK text and source
 * attributions (reproduced here). The source PASSAGES, speeches, and articles
 * are third-party copyrighted and are NOT reproduced — Synthesis and
 * Rhetorical Analysis entries ship with pre-labeled but EMPTY source slots
 * that the teacher fills (paste or PDF upload). Argument prompts need no
 * passage and are complete.
 *
 * Run: npx tsx packages/prisma/scripts/seed-ap-lang-prompts.ts
 */

import { PrismaClient } from '../generated/prisma';

const prisma = new PrismaClient();
const KIND = 'ap-lang';

type Source = { label: string; title?: string; attribution?: string; body: string };
type Entry = {
  essayType: string;
  title: string;
  promptBody: string;
  year?: number;
  tags?: string[];
  sourcePassages?: Source[];
};

// Empty-body source slot: real attribution, teacher supplies the text.
const slot = (label: string, attribution: string): Source => ({
  label,
  attribution,
  body: '',
});

const SYNTHESIS_TASK = (topic: string) =>
  `Carefully read the following sources, including the introductory information for each source. Then write an essay that synthesizes material from at least three of the sources and develops your position on ${topic}.\n\nNote: The source passages are copyrighted and are not included here. Add each source's text below (paste or upload the PDF) before assigning.`;

const RHET_TASK = (context: string, task: string) =>
  `${context} Read the passage carefully. Then write an essay that analyzes the rhetorical choices ${task}\n\nNote: The passage is copyrighted and is not included here. Add the passage text below (paste or upload the PDF) before assigning.`;

const entries: Entry[] = [
  // ───────────── Synthesis (Q1) ─────────────
  {
    essayType: 'synthesis',
    title: 'Space Debris (2025, Set 1)',
    year: 2025,
    tags: ['synthesis', 'environment', 'policy', 'source-required'],
    promptBody: SYNTHESIS_TASK(
      'the most important factors that space agencies and nations should consider when developing policies to address space debris'
    ),
    sourcePassages: [
      slot('Source A', "O'Callaghan, Natural History Museum"),
      slot('Source B', 'European Space Agency (graph)'),
      slot('Source C', 'Quell, Courthouse News'),
      slot('Source D', 'Rossettini, SpaceNews (op-ed)'),
      slot('Source E', 'NOAA'),
      slot('Source F', 'Mosher & Kiersz, Business Insider (chart)'),
    ],
  },
  {
    essayType: 'synthesis',
    title: 'Preserving Historic Buildings (2024, Set 1)',
    year: 2024,
    tags: ['synthesis', 'civic', 'preservation', 'source-required'],
    promptBody: SYNTHESIS_TASK(
      'the factors a community should consider when deciding whether to preserve historic buildings'
    ),
    sourcePassages: [
      slot('Source A', 'Merlino'),
      slot('Source B', 'National Park Service'),
      slot('Source C', 'Shayla Martin, Veranda ("Save Harlem Now!")'),
      slot('Source D', 'Rosen, The New Yorker (cartoon)'),
      slot('Source E', 'preservation policy brief'),
      slot('Source F', 'community perspective'),
    ],
  },
  {
    essayType: 'synthesis',
    title: 'Urban Rewilding (2023, Set 1)',
    year: 2023,
    tags: ['synthesis', 'environment', 'source-required'],
    promptBody: SYNTHESIS_TASK(
      'whether urban rewilding initiatives are worthwhile for communities to pursue'
    ),
    sourcePassages: [
      slot('Source A', 'Fastnacht (infographic)'),
      slot('Source B', 'Jepson & Schepers, Rewilding Europe (policy brief)'),
      slot('Source C', 'National Recreation and Park Association'),
      slot('Source D', 'Garland, The Nature of Cities (essay)'),
      slot('Source E', 'McDonald et al. (graph)'),
      slot('Source F', 'Chatterton (excerpt)'),
    ],
  },
  {
    essayType: 'synthesis',
    title: 'Siting Commercial Wind Farms (2019)',
    year: 2019,
    tags: ['synthesis', 'environment', 'energy', 'source-required'],
    promptBody: SYNTHESIS_TASK(
      'the considerations that should guide decisions about where to site commercial wind farms'
    ),
    sourcePassages: [
      slot('Source A', 'news article'),
      slot('Source B', 'research report'),
      slot('Source C', 'visual/map'),
      slot('Source D', 'opinion piece'),
      slot('Source E', 'data table'),
      slot('Source F', 'community statement'),
    ],
  },
  {
    essayType: 'synthesis',
    title: 'The Value of a College Degree (2014)',
    year: 2014,
    tags: ['synthesis', 'education', 'source-required'],
    promptBody: SYNTHESIS_TASK(
      'whether the cost of a college education is worth the value of the degree'
    ),
    sourcePassages: [
      slot('Source A', 'news article'),
      slot('Source B', 'economic data'),
      slot('Source C', 'opinion piece'),
      slot('Source D', 'research study'),
      slot('Source E', 'visual'),
      slot('Source F', 'personal account'),
    ],
  },

  // ───────────── Rhetorical Analysis (Q2) ─────────────
  {
    essayType: 'rhetorical-analysis',
    title: 'David Treuer, Rez Life (2025, Set 1)',
    year: 2025,
    tags: ['rhetorical-analysis', 'source-required'],
    promptBody: RHET_TASK(
      'The following passage is from the introduction to David Treuer\'s Rez Life: An Indian\'s Journey Through Reservation Life (2012).',
      'Treuer makes to develop his argument about Native American contributions.'
    ),
    sourcePassages: [slot('Passage', 'David Treuer, Rez Life (2012)')],
  },
  {
    essayType: 'rhetorical-analysis',
    title: 'Maria W. Stewart (2024, Set 1)',
    year: 2024,
    tags: ['rhetorical-analysis', 'source-required'],
    promptBody: RHET_TASK(
      'The following passage is by Maria W. Stewart, an early-19th-century African American educator and writer.',
      'Stewart makes to convey her position.'
    ),
    sourcePassages: [slot('Passage', 'Maria W. Stewart')],
  },
  {
    essayType: 'rhetorical-analysis',
    title: 'Michelle Obama, Final Speech as First Lady (2023, Set 1)',
    year: 2023,
    tags: ['rhetorical-analysis', 'source-required'],
    promptBody: RHET_TASK(
      'The following passage is from Michelle Obama\'s final speech as First Lady, delivered January 6, 2017, at the School Counselor of the Year event.',
      'Obama makes to convey her message about her expectations and hopes for young people in the United States.'
    ),
    sourcePassages: [slot('Passage', 'Michelle Obama (Jan. 6, 2017)')],
  },
  {
    essayType: 'rhetorical-analysis',
    title: 'Sonia Sotomayor, "A Latina Judge\'s Voice" (2022)',
    year: 2022,
    tags: ['rhetorical-analysis', 'source-required'],
    promptBody: RHET_TASK(
      'The following passage is from Sonia Sotomayor\'s 2001 speech "A Latina Judge\'s Voice," delivered at the UC Berkeley School of Law.',
      'Sotomayor makes to convey her message about her identity.'
    ),
    sourcePassages: [slot('Passage', 'Sonia Sotomayor (2001)')],
  },
  {
    essayType: 'rhetorical-analysis',
    title: 'Margaret Thatcher, Eulogy for Ronald Reagan (2016)',
    year: 2016,
    tags: ['rhetorical-analysis', 'source-required'],
    promptBody: RHET_TASK(
      'The following passage is from Margaret Thatcher\'s June 11, 2004 eulogy for Ronald Reagan.',
      'Thatcher makes to convey her message.'
    ),
    sourcePassages: [slot('Passage', 'Margaret Thatcher (June 11, 2004)')],
  },
  {
    essayType: 'rhetorical-analysis',
    title: 'Florence Kelley, Child Labor Speech (2011)',
    year: 2011,
    tags: ['rhetorical-analysis', 'source-required'],
    promptBody: RHET_TASK(
      'The following passage is from a speech delivered by Florence Kelley to the National American Woman Suffrage Association in 1905, on the subject of child labor.',
      'Kelley makes to convey her message about child labor.'
    ),
    sourcePassages: [slot('Passage', 'Florence Kelley (1905, NAWSA)')],
  },

  // ───────────── Argument (Q3) — complete, no passage ─────────────
  {
    essayType: 'argument',
    title: 'Naomi Osaka on Being Present (2025, Set 1)',
    year: 2025,
    tags: ['argument', 'mindfulness'],
    promptBody:
      'In a 2022 interview with People magazine, tennis champion Naomi Osaka encouraged people to "be present in each moment" and to embrace the journey rather than fixating on outcomes.\n\nWrite an essay that argues your position on the extent to which Osaka\'s claim about being present is valid.\n\nIn your response you should do the following:\n• Respond to the prompt with a thesis that presents a defensible position.\n• Provide evidence to support your line of reasoning.\n• Explain how the evidence supports your line of reasoning.\n• Use appropriate grammar and punctuation in communicating your argument.',
  },
  {
    essayType: 'argument',
    title: 'Octavia Butler on Persistence (2024, Set 1)',
    year: 2024,
    tags: ['argument', 'persistence'],
    promptBody:
      'The writer Octavia Butler emphasized the value of being undeterred — of persisting toward a goal despite obstacles and discouragement.\n\nWrite an essay that argues your position on the extent to which Butler\'s claim about persistence is valid.\n\nIn your response you should do the following:\n• Respond to the prompt with a thesis that presents a defensible position.\n• Provide evidence to support your line of reasoning.\n• Explain how the evidence supports your line of reasoning.\n• Use appropriate grammar and punctuation in communicating your argument.',
  },
  {
    essayType: 'argument',
    title: 'Maxine Hong Kingston on a Community of Voices (2023, Set 1)',
    year: 2023,
    tags: ['argument', 'community'],
    promptBody:
      'In a 2016 interview with the Los Angeles Review of Books, the writer Maxine Hong Kingston suggested that "a community of voices" is stronger and more valuable than individual voices alone.\n\nWrite an essay that argues your position on the extent to which Kingston\'s claim is valid.\n\nIn your response you should do the following:\n• Respond to the prompt with a thesis that presents a defensible position.\n• Provide evidence to support your line of reasoning.\n• Explain how the evidence supports your line of reasoning.\n• Use appropriate grammar and punctuation in communicating your argument.',
  },
  {
    essayType: 'argument',
    title: 'Colin Powell on Timely Decisions (2022)',
    year: 2022,
    tags: ['argument', 'decision-making'],
    promptBody:
      'In his 1995 autobiography My American Journey, Colin Powell argued for making timely decisions rather than waiting to collect every possible piece of information.\n\nWrite an essay that argues your position on the extent to which Powell\'s claim about timely decision-making is valid.\n\nIn your response you should do the following:\n• Respond to the prompt with a thesis that presents a defensible position.\n• Provide evidence to support your line of reasoning.\n• Explain how the evidence supports your line of reasoning.\n• Use appropriate grammar and punctuation in communicating your argument.',
  },
  {
    essayType: 'argument',
    title: 'Anne Morrow Lindbergh on the Unknown (2018)',
    year: 2018,
    tags: ['argument', 'exploration'],
    promptBody:
      'In Gift from the Sea, Anne Morrow Lindbergh suggests that exploring "the unknown" enriches our lives.\n\nWrite an essay that argues your position on the value of exploring the unknown.\n\nIn your response you should do the following:\n• Respond to the prompt with a thesis that presents a defensible position.\n• Provide evidence to support your line of reasoning.\n• Explain how the evidence supports your line of reasoning.\n• Use appropriate grammar and punctuation in communicating your argument.',
  },
  {
    essayType: 'argument',
    title: 'Oscar Wilde on Disobedience (2016)',
    year: 2016,
    tags: ['argument', 'individuality'],
    promptBody:
      'In "The Soul of Man Under Socialism" (1891), Oscar Wilde wrote: "Disobedience, in the eyes of anyone who has read history, is man\'s original virtue. It is through disobedience that progress has been made, through disobedience and through rebellion."\n\nWrite an essay that argues your position on the extent to which Wilde\'s claim is valid.\n\nIn your response you should do the following:\n• Respond to the prompt with a thesis that presents a defensible position.\n• Provide evidence to support your line of reasoning.\n• Explain how the evidence supports your line of reasoning.\n• Use appropriate grammar and punctuation in communicating your argument.',
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
  console.log('AP Lang prompt seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
