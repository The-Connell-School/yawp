import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { readFile } from 'node:fs/promises';
import { EDITOR_SELECTOR } from '../test-helpers';

const TEACHER_PASSWORD = 'teacher-e2e-password';
const STUDENT_PASSWORD = 'johndoe';
const SELECT_ALL_SHORTCUT =
  process.platform === 'darwin' ? 'Meta+A' : 'Control+A';

/** Org flag removed: planner is teacher-only and always on. */
async function setLessonPlannerEnabled(
  _organizationId: string,
  _enabled: boolean
) {}

async function setWritingPracticeEnabled(
  organizationId: string,
  enabled: boolean
) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.organization.update({
      where: { id: organizationId },
      data: { writingPracticeEnabled: enabled },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * A lesson that teaches a writing fundamental and ends on practice students do
 * in Yawp. The second block names a lesson Yawp does not have, which must never
 * reach the assignment.
 */
async function seedPlannedPractice(e2eContext: {
  teacherMembershipId: string;
  organizationId: string;
}) {
  const prisma = createE2EPrismaClient();
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: 'Comma splices',
        messages: {
          create: [
            {
              role: 'user',
              content: 'My class keeps writing comma splices.',
              createdAt: new Date('2026-08-05T10:00:00.000Z'),
            },
            {
              role: 'assistant',
              content:
                '## Practice (10 min)\n\nThey fix six on their own before repairing their drafts.\n\n' +
                '```yawp-practice\n' +
                'lessons: fixing-comma-splices, lesson-yawp-does-not-have\n' +
                'problems: 6\n' +
                'title: Comma splice repair\n' +
                '---\n' +
                'Fix each sentence two different ways.\n' +
                '```',
              createdAt: new Date('2026-08-05T10:00:01.000Z'),
            },
          ],
        },
      },
      select: { id: true },
    });
    return { conversationId: conversation.id };
  } finally {
    await prisma.$disconnect();
  }
}

async function clearWritingPractice(membershipId: string) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.writingPracticeAssignment.deleteMany({
      where: { createdByMembershipId: membershipId },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Write a ready class summary straight to the DB so the hand-off test does not
 * depend on the insight generation path (covered by its own spec).
 */
async function seedClassInsight(classAssignmentId: string) {
  const prisma = createE2EPrismaClient();
  try {
    const summaryJson = {
      overview: 'The class argues well but lands its essays softly.',
      categories: [
        {
          key: 'organization_and_structure',
          label: 'Organization/Structure',
          status: 'gap',
          summary: 'Conclusions restate the introduction.',
        },
      ],
      nextSteps: [
        {
          title: 'Teach conclusions that answer "so what?"',
          detail: 'Model two conclusions side by side, then revise their own.',
          rubricCategory: 'organization_and_structure',
        },
      ],
    };
    await prisma.classAssignmentInsight.upsert({
      where: { classAssignmentId },
      create: {
        classAssignmentId,
        status: 'ready',
        submissionCount: 12,
        generatedAt: new Date(),
        summaryJson,
      },
      update: {
        status: 'ready',
        submissionCount: 12,
        generatedAt: new Date(),
        summaryJson,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function clearClassInsight(classAssignmentId: string) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.classAssignmentInsight.deleteMany({
      where: { classAssignmentId },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Write a planning conversation with two assistant replies straight to the DB,
 * so the packet tests exercise the packet rather than the model.
 */
async function seedLessonPlan(
  e2eContext: { teacherMembershipId: string; organizationId: string },
  {
    keepFirst = false,
    keepLongHandout = false,
  }: { keepFirst?: boolean; keepLongHandout?: boolean } = {}
) {
  const prisma = createE2EPrismaClient();
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: 'Conclusions lesson',
        messages: {
          create: [
            {
              role: 'user',
              content: 'Plan a lesson on conclusions.',
              createdAt: new Date('2026-08-04T10:00:00.000Z'),
            },
            {
              role: 'assistant',
              content:
                '## Warm-up (5 min)\n\nDaily Pages prompt FW-001.\n\n### Teacher moves\n\nCircle the room.',
              createdAt: new Date('2026-08-04T10:00:01.000Z'),
              ...(keepFirst
                ? {
                    keptAt: new Date('2026-08-04T10:05:00.000Z'),
                    keptAudience: 'teacher',
                  }
                : {}),
            },
            {
              role: 'assistant',
              // Paragraphs, not a numbered list: Markdown turns "1." into a
              // list marker, so the number never appears in the DOM text.
              content: keepLongHandout
                ? `## Conclusion practice handout\n\n${Array.from(
                    { length: 40 },
                    (_unused, index) =>
                      `Practice item ${index + 1}: rewrite this conclusion so it answers "so what?".`
                  ).join('\n\n')}`
                : '## Conclusion practice handout\n\nRewrite each conclusion so it answers "so what?".',
              createdAt: new Date('2026-08-04T10:00:02.000Z'),
              ...(keepLongHandout
                ? {
                    keptAt: new Date('2026-08-04T10:05:01.000Z'),
                    keptAudience: 'student',
                  }
                : {}),
            },
          ],
        },
      },
      select: { id: true },
    });
    return { conversationId: conversation.id };
  } finally {
    await prisma.$disconnect();
  }
}

async function clearLessonPlans(membershipId: string) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.lessonPlanConversation.deleteMany({ where: { membershipId } });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * A conversation whose kept reply carries a real structured deck, so the
 * presenter can be exercised without calling a model.
 */
async function seedSlideDeck(e2eContext: {
  teacherMembershipId: string;
  organizationId: string;
}) {
  const prisma = createE2EPrismaClient();
  const deck = {
    title: 'Evidence that earns its place',
    subtitle: 'English 10 · Period 3',
    slides: [
      {
        layout: 'title',
        title: 'Evidence that earns its place',
        subtitle: 'Why some quotes land',
        speakerNotes: 'Set the stakes before naming the skill.',
        minutes: 1,
      },
      {
        layout: 'compare',
        title: 'Which one makes you cringe?',
        left: { label: 'Version A', text: 'The author says the door slammed.' },
        right: {
          label: 'Version B',
          text: 'When the door slams, she is done talking.',
        },
        speakerNotes: 'Three silent minutes of writing before anyone speaks.',
        minutes: 5,
      },
      {
        layout: 'closing',
        title: 'Exit ticket',
        body: 'Rewrite one sentence from your draft.',
        speakerNotes: 'Collect on the way out.',
        minutes: 3,
      },
    ],
  };
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: 'Deck lesson',
        messages: {
          create: [
            {
              role: 'assistant',
              content: `Here is your deck.\n\n\`\`\`yawp-slides\n${JSON.stringify(
                deck
              )}\n\`\`\``,
              createdAt: new Date('2026-08-04T10:00:01.000Z'),
              keptAt: new Date('2026-08-04T10:05:00.000Z'),
              keptAudience: 'teacher',
            },
          ],
        },
      },
      select: { id: true, messages: { select: { id: true } } },
    });
    return {
      conversationId: conversation.id,
      messageId: conversation.messages[0]!.id,
    };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * A kept reply whose deck the schema rejects — the state a teacher lands in
 * when even the repair pass could not save it. What must never happen is the
 * JSON showing up on screen.
 */
async function seedUnreadableDeck(e2eContext: {
  teacherMembershipId: string;
  organizationId: string;
}) {
  const prisma = createE2EPrismaClient();
  const broken = {
    title: 'Conclusions that land',
    // No speakerNotes, and a bullets slide with no bullets.
    slides: [{ layout: 'bullets', title: 'What a conclusion does' }],
  };
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: 'Broken deck lesson',
        messages: {
          create: [
            {
              role: 'assistant',
              content: `## Conclusions that land\n\nHere is the deck.\n\n\`\`\`yawp-slides\n${JSON.stringify(
                broken
              )}\n\`\`\``,
              createdAt: new Date('2026-08-04T10:00:01.000Z'),
              keptAt: new Date('2026-08-04T10:05:00.000Z'),
              keptAudience: 'teacher',
            },
          ],
        },
      },
      select: { id: true, messages: { select: { id: true } } },
    });
    return {
      conversationId: conversation.id,
      messageId: conversation.messages[0]!.id,
    };
  } finally {
    await prisma.$disconnect();
  }
}

/** A reply carrying a handout and a sample, neither of them kept yet. */
async function seedUnitPlan(
  e2eContext: {
    teacherMembershipId: string;
    organizationId: string;
  },
  { buildDay }: { buildDay?: number } = {}
) {
  const prisma = createE2EPrismaClient();
  const unit_ = {
    title: 'Writing the literary analysis paragraph',
    subtitle: 'English 10 · 3 periods',
    endsWith: 'One analysis paragraph on a passage they choose',
    days: [
      {
        day: 1,
        title: 'What a claim is',
        objective: 'Tell a claim apart from a summary',
        students: 'Sort ten sentences into claim or summary',
        check: 'Exit ticket: one claim about the passage',
        minutes: 50,
      },
      {
        day: 2,
        title: 'Evidence that earns its place',
        objective: 'Choose the quote that proves the claim',
        students: 'Match claims to the strongest of three quotes',
        minutes: 50,
      },
    ],
  };
  const content = [
    'Here is the arc, three periods start to finish.',
    '',
    '```yawp-unit',
    JSON.stringify(unit_, null, 2),
    '```',
  ].join('\n');
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: 'Analysis paragraph unit',
        messages: {
          create: [
            {
              role: 'user',
              content: 'Build me a unit plan on the analysis paragraph.',
              createdAt: new Date('2026-08-04T10:00:00.000Z'),
            },
            {
              role: 'assistant',
              content,
              createdAt: new Date('2026-08-04T10:00:01.000Z'),
            },
          ],
        },
      },
      select: { id: true },
    });

    // A unit is a container: the map is one conversation, and each built day
    // is its own lesson hanging off the same unit.
    const unit = await prisma.lessonPlanUnit.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: unit_.title,
      },
      select: { id: true },
    });
    await prisma.lessonPlanConversation.update({
      where: { id: conversation.id },
      data: { unitId: unit.id, unitDay: null },
    });

    let dayConversationId: string | null = null;
    if (buildDay) {
      const day = unit_.days.find((entry) => entry.day === buildDay)!;
      const built = await prisma.lessonPlanConversation.create({
        data: {
          membershipId: e2eContext.teacherMembershipId,
          organizationId: e2eContext.organizationId,
          title: `Day ${day.day} — ${day.title}`,
          unitId: unit.id,
          unitDay: day.day,
          messages: {
            create: [
              {
                role: 'user',
                content: `Build day ${day.day} in full.`,
                createdAt: new Date('2026-08-04T11:00:00.000Z'),
              },
              {
                role: 'assistant',
                content: `## ${day.title}\n\nHere is the lesson for day ${day.day}.`,
                createdAt: new Date('2026-08-04T11:00:01.000Z'),
              },
            ],
          },
        },
        select: { id: true },
      });
      dayConversationId = built.id;
    }

    return {
      conversationId: conversation.id,
      unitId: unit.id,
      dayConversationId,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function seedLessonWithMaterials(e2eContext: {
  teacherMembershipId: string;
  organizationId: string;
}) {
  const prisma = createE2EPrismaClient();
  const content = [
    '## Objective',
    '',
    'Explain what a piece of evidence proves, not just what it says.',
    '',
    '## Lesson Sequence',
    '',
    'Project the two drafts below, then hand out the practice set.',
    '',
    '```yawp-material',
    'kind: sample',
    'title: Two conclusions, side by side',
    '---',
    '**Draft A.** In conclusion, this essay has shown many things.',
    '',
    '**Draft B.** The door slams because she is finished asking.',
    '```',
    '',
    '```yawp-material',
    'kind: handout',
    'title: Diagnose & Repair',
    '---',
    'Read each excerpt. Underline the sentence that explains the quote.',
    '```',
  ].join('\n');
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: 'Evidence lesson',
        messages: {
          create: [
            {
              role: 'user',
              content: 'Plan a lesson on explaining evidence.',
              createdAt: new Date('2026-08-05T10:00:00.000Z'),
            },
            {
              role: 'assistant',
              content,
              createdAt: new Date('2026-08-05T10:00:01.000Z'),
            },
          ],
        },
      },
      select: { id: true },
    });
    return { conversationId: conversation.id };
  } finally {
    await prisma.$disconnect();
  }
}

/** The same handout twice: the original, then a rewrite claiming its slot. */
async function seedRevisedHandout(e2eContext: {
  teacherMembershipId: string;
  organizationId: string;
}) {
  const prisma = createE2EPrismaClient();
  const block = (slot: string, body: string) =>
    [
      '```yawp-material',
      'kind: handout',
      `slot: ${slot}`,
      'title: Diagnose & Repair',
      '---',
      body,
      '```',
    ].join('\n');
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: 'Revision lesson',
        messages: {
          create: [
            {
              role: 'assistant',
              content: `## Lesson\n\nHere it is.\n\n${block(
                'handout:diagnose-repair',
                'The long version.'
              )}`,
              createdAt: new Date('2026-08-05T10:00:00.000Z'),
            },
            {
              role: 'assistant',
              content: `## Shorter\n\nTightened it.\n\n${block(
                'handout:diagnose-repair',
                'The shorter version.'
              )}`,
              createdAt: new Date('2026-08-05T10:01:00.000Z'),
            },
          ],
        },
      },
      select: { id: true },
    });
    return { conversationId: conversation.id };
  } finally {
    await prisma.$disconnect();
  }
}

/** An intake turn that asks with controls rather than in prose. */
async function seedAskTurn(
  e2eContext: { teacherMembershipId: string; organizationId: string },
  block: string,
  /** Options the reply offers alongside the controls, one per line. */
  suggestions?: string
) {
  const prisma = createE2EPrismaClient();
  const offered = suggestions
    ? `\n\n\`\`\`suggestions\n${suggestions}\n\`\`\``
    : '';
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: 'Intake lesson',
        // The controls arrive on a later turn on purpose: the app suppresses
        // the length question while the planner is still asking what the
        // lesson is about, so an opening reply would draw no slider at all.
        messages: {
          create: [
            {
              role: 'user',
              content: 'Plan a lesson on explaining evidence.',
              createdAt: new Date('2026-08-05T09:59:00.000Z'),
            },
            {
              role: 'assistant',
              content: 'Which class is this for?',
              createdAt: new Date('2026-08-05T09:59:01.000Z'),
            },
            {
              role: 'user',
              content: 'English 10 · Period 3.',
              createdAt: new Date('2026-08-05T10:00:00.000Z'),
            },
            {
              role: 'assistant',
              content: `Before I plan, two quick things.\n\n\`\`\`yawp-ask\n${block}\n\`\`\`${offered}`,
              createdAt: new Date('2026-08-05T10:00:01.000Z'),
            },
          ],
        },
      },
      select: { id: true },
    });
    return { conversationId: conversation.id };
  } finally {
    await prisma.$disconnect();
  }
}

/** A reply whose warm-up prompt the planner wrote itself. */
async function seedWrittenWarmUp(e2eContext: {
  teacherMembershipId: string;
  organizationId: string;
}) {
  const prisma = createE2EPrismaClient();
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: 'Warm-up lesson',
        messages: {
          create: [
            {
              role: 'user',
              content: 'Plan a lesson on explaining evidence.',
              createdAt: new Date('2026-08-05T10:00:00.000Z'),
            },
            {
              role: 'assistant',
              content:
                '## Warm-up (7 min)\n\nPost this and give them four minutes to write.\n\n' +
                '```yawp-daily-pages\n' +
                'Think of the last time you tried to convince someone of something.\n' +
                '```\n\n' +
                '## Mini-lesson\n\nWhat evidence actually does.',
              createdAt: new Date('2026-08-05T10:00:01.000Z'),
            },
          ],
        },
      },
      select: { id: true },
    });
    return { conversationId: conversation.id };
  } finally {
    await prisma.$disconnect();
  }
}

/** A reply whose closing check the planner handed over as an exit ticket. */
async function seedPlannedExitTicket(e2eContext: {
  teacherMembershipId: string;
  organizationId: string;
}) {
  const prisma = createE2EPrismaClient();
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: 'Weathering lesson',
        messages: {
          create: [
            {
              role: 'user',
              content: 'Plan a lesson on weathering and erosion.',
              createdAt: new Date('2026-08-05T10:00:00.000Z'),
            },
            {
              role: 'assistant',
              content:
                '## Closing (4 min)\n\nGive them the last four minutes for this.\n\n' +
                '```yawp-exit-ticket\n' +
                'mode: specific\n' +
                'focus: explain-concept\n' +
                'topic: the difference between weathering and erosion\n' +
                'answer: objective\n' +
                'mainPoints: Weathering breaks rock down in place; erosion carries the pieces away.\n' +
                'mustMention: Whether the material moves.\n' +
                '```',
              createdAt: new Date('2026-08-05T10:00:01.000Z'),
            },
          ],
        },
      },
      select: { id: true },
    });
    return { conversationId: conversation.id };
  } finally {
    await prisma.$disconnect();
  }
}

/** The same hand-off in the quick builder's terms: a graded reflection. */
async function seedPlannedGradedReflection(e2eContext: {
  teacherMembershipId: string;
  organizationId: string;
}) {
  const prisma = createE2EPrismaClient();
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: 'Reflection lesson',
        messages: {
          create: [
            {
              role: 'user',
              content: 'Plan a lesson on the water cycle, graded exit ticket.',
              createdAt: new Date('2026-08-05T11:00:00.000Z'),
            },
            {
              role: 'assistant',
              content:
                '## Closing (4 min)\n\n' +
                '```yawp-exit-ticket\n' +
                'kind: reflection\n' +
                'prompt: wondering\n' +
                'graded: yes\n' +
                'points: 3\n' +
                'basis: completion\n' +
                '```',
              createdAt: new Date('2026-08-05T11:00:01.000Z'),
            },
          ],
        },
      },
      select: { id: true },
    });
    return { conversationId: conversation.id };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * The default shape of a warm-up offer: three prompts, one block each.
 *
 * Which prompt a room will actually write about at 8am is the teacher's call,
 * so the planner offers rather than decides. Each block has to arrive as its
 * own card with its own assign button — three prompts stacked into one card,
 * or a single button that picks for them, would put the choice back where it
 * does not belong.
 */
async function seedThreeWarmUpOptions(e2eContext: {
  teacherMembershipId: string;
  organizationId: string;
}) {
  const prisma = createE2EPrismaClient();
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: 'Warm-up options lesson',
        messages: {
          create: [
            {
              role: 'user',
              content: 'Plan a lesson on choosing evidence.',
              createdAt: new Date('2026-08-05T10:00:00.000Z'),
            },
            {
              role: 'assistant',
              content:
                '## Warm-up (5 min)\n\nFour minutes to write, then two share aloud. Pick one:\n\n' +
                '```yawp-daily-pages\n' +
                'id: FW-001\n' +
                'Think of the last time you tried to convince someone of something.\n' +
                '```\n\n' +
                '```yawp-daily-pages\n' +
                'Write about a rule you think is wrong, and what you would say to the person who made it.\n' +
                '```\n\n' +
                '```yawp-daily-pages\n' +
                'Describe something you believed last year and no longer believe.\n' +
                '```\n\n' +
                '## Mini-lesson\n\nWhat makes a quote prove a claim.',
              createdAt: new Date('2026-08-05T10:00:01.000Z'),
            },
          ],
        },
      },
      select: { id: true },
    });
    return { conversationId: conversation.id };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * A lesson that opens with a class starter and puts Daily Pages in the middle.
 *
 * The two are different exercises with different rubrics, and the planner used
 * to call both of them "the warm-up". A class starter has to reach the Class
 * Starter sheet, and a reflection sitting after the reading has to survive the
 * trip without being turned back into a bell-ringer.
 */
async function seedClassStarterAndReflection(e2eContext: {
  teacherMembershipId: string;
  organizationId: string;
}) {
  const prisma = createE2EPrismaClient();
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: 'Macbeth, Act 3',
        messages: {
          create: [
            {
              role: 'user',
              content: 'Plan 50 minutes on Macbeth Act 3.',
              createdAt: new Date('2026-08-05T10:00:00.000Z'),
            },
            {
              role: 'assistant',
              content:
                '## Class starter (4 min)\n\nOn the board as they come in.\n\n' +
                '```yawp-daily-pages\n' +
                'kind: class-starter\n' +
                'Name something you wanted badly and then got. Was it what you expected?\n' +
                '```\n\n' +
                '## Read Act 3, scene 2 (15 min)\n\nRead it aloud, two volunteers.\n\n' +
                '## Daily Pages (12 min)\n\n' +
                'They have the scene now, so they have something to reflect on.\n\n' +
                '```yawp-daily-pages\n' +
                'kind: daily-pages\n' +
                'Macbeth has the crown by Act 3 and is miserable. What did it cost him?\n' +
                '```\n\n' +
                '## Closing (4 min)\n\nTwo entries read aloud.',
              createdAt: new Date('2026-08-05T10:00:01.000Z'),
            },
          ],
        },
      },
      select: { id: true },
    });
    return { conversationId: conversation.id };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * A plain lesson plan carrying no artifacts, so the follow-on offers are both
 * still on the table. A reply that already built a handout suppresses that
 * offer on purpose, which is a different case.
 */
async function seedBareLessonPlan(e2eContext: {
  teacherMembershipId: string;
  organizationId: string;
}) {
  const prisma = createE2EPrismaClient();
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: 'Bare plan',
        messages: {
          create: [
            {
              role: 'user',
              content: 'Plan a lesson on explaining evidence.',
              createdAt: new Date('2026-08-05T10:00:00.000Z'),
            },
            {
              role: 'assistant',
              content:
                '## Objective\n\nExplain what a quote proves.\n\n## Lesson Sequence\n\nWarm-up, mini-lesson, practice.',
              createdAt: new Date('2026-08-05T10:00:01.000Z'),
            },
          ],
        },
      },
      select: { id: true },
    });
    return { conversationId: conversation.id };
  } finally {
    await prisma.$disconnect();
  }
}

test.describe('YAWP! Lesson Planner', () => {
  test.afterEach(async ({ e2eContext }) => {
    // Seeded lessons would otherwise pile up across tests and retries, and the
    // library legitimately shows every one of them.
    await clearLessonPlans(e2eContext.teacherMembershipId);
  });

  test('is teacher-only: students get a 404', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.userEmail, STUDENT_PASSWORD);

    await expect(
      page.getByRole('link', { name: 'Lesson Planner' })
    ).toHaveCount(0);

    await page.goto('/app/lesson-planner');
    await expect(page).toHaveURL(/\/app(?!\/lesson-planner)/);
  });

  test('lets an enabled teacher open the planner and start a lesson', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    // The planner appears in the sidebar and opens.
    await page.getByRole('link', { name: 'Lesson Planner' }).click();
    await expect(page).toHaveURL(/\/app\/lesson-planner/);
    await page.waitForLoadState('networkidle');

    // Empty state with the recommended starter prompts.
    await expect(
      page.getByRole('heading', { name: /what are we teaching/i })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /same topic, two very different/i })
    ).toBeVisible();

    // Picking a starter prompt optimistically posts the teacher's message.
    await page
      .getByRole('button', { name: /same topic, two very different/i })
      .click();
    await expect(page.locator('[data-role="user"]').first()).toBeVisible();
    // The turn reports what it is doing now, rather than sitting behind a
    // spinner that said "Planning the lesson…" for up to two minutes.
    await expect(page.getByTestId('planning-progress')).toBeVisible();
  });

  test('supports typing a lesson request', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lesson-planner');

    const composer = page.getByLabel('Message the Lesson Planner');
    await composer.fill('Help me teach conclusion paragraphs.');
    await page.getByRole('button', { name: 'Send message' }).click();

    await expect(
      page.getByText('Help me teach conclusion paragraphs.')
    ).toBeVisible();
    // Composer clears after sending.
    await expect(composer).toHaveValue('');
  });

  test('opens from a Class Summary next step with the ask pre-filled', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    await seedClassInsight(e2eContext.classAssignmentId);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    await page.goto(
      `/app/my-classes/${e2eContext.classId}/assignments/${e2eContext.assignmentId}`
    );
    await expect(page.getByText(/suggested next steps/i)).toBeVisible();

    await page.getByRole('link', { name: /plan this lesson/i }).click();

    // Ids in the URL, not prompt text.
    await expect(page).toHaveURL(
      new RegExp(
        `/app/lesson-planner\\?from=${e2eContext.classAssignmentId}&step=0`
      )
    );

    // The planner explains where the lesson came from and pre-fills the ask,
    // without sending it — the teacher can add their own context first.
    await expect(page.getByTestId('lesson-planner-seed')).toContainText(
      /so what/i
    );
    await expect(page.getByLabel('Message the Lesson Planner')).toHaveValue(
      /Teach conclusions that answer "so what\?"/
    );
    await expect(page.locator('[data-role="user"]')).toHaveCount(0);

    await clearClassInsight(e2eContext.classAssignmentId);
  });

  test('opens the how-it-works guide from the planner header', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lesson-planner');

    await page.getByRole('link', { name: 'See how it works' }).click();
    await expect(page).toHaveURL(/\/app\/lesson-planner\/how-it-works$/);

    await expect(
      page.getByRole('heading', { level: 1, name: /tomorrow’s lesson/i })
    ).toBeVisible();
    // The section a school approving the planner reads first.
    const wont = page.getByTestId('guide-wont');
    await expect(wont).toContainText(/assign anything to students/i);
    await expect(wont).toContainText(/read students’ essays/i);
    // The clips are served from the app, not an outside site.
    const clip = page.locator('video source').first();
    await expect(clip).toHaveAttribute(
      'src',
      /^\/img\/lesson-planner-guide\/.+\.mp4$/
    );

    await page.getByRole('link', { name: /back to the planner/i }).click();
    await expect(page).toHaveURL(/\/app\/lesson-planner$/);
  });

  test('keeps the how-it-works guide behind the planner flag', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, false);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    await page.goto('/app/lesson-planner/how-it-works');
    await expect(page).toHaveURL(/\/app(?!\/lesson-planner)/);
  });

  test('keeps the how-it-works guide in bounds on a phone', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto('/app/lesson-planner');
    // Icon only at this width, still named for anyone using a screen reader.
    await expect(
      page.getByRole('link', { name: 'See how it works' })
    ).toBeVisible();

    await page.goto('/app/lesson-planner/how-it-works');
    await expect(page.getByTestId('guide-wont')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('keeps planner controls in bounds at desktop and mobile breakpoints', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/app/lesson-planner');

      const composer = page.getByLabel('Message the Lesson Planner');
      const send = page.getByRole('button', { name: 'Send message' });
      await expect(composer).toBeVisible();
      await expect(send).toBeVisible();
      if (viewport.width === 390) {
        await expect(page.getByLabel('Switch lesson')).toBeVisible();
        await expect(
          page.getByRole('button', { name: 'New lesson' })
        ).toBeVisible();
      }

      for (const control of [composer, send]) {
        const box = await control.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
      }

      const overflow = await page.evaluate(() => ({
        body: document.body.scrollWidth - window.innerWidth,
        document: document.documentElement.scrollWidth - window.innerWidth,
      }));
      expect(overflow.body).toBeLessThanOrEqual(0);
      expect(overflow.document).toBeLessThanOrEqual(0);
    }

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  /**
   * A lesson takes up to two minutes to write. Behind one spinner that reads
   * as a hung page, so the turn reports what it is doing and the bar is drawn
   * from those milestones. Served here as canned events — the point under test
   * is the reading of them, not the model.
   */
  test('shows what it is doing while the lesson is being written', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    // The turn is held open and never answered, which is exactly the state a
    // teacher used to spend ninety seconds in. `route.fulfill` cannot help
    // here: it delivers the whole body and closes, and a stream that ends
    // without its final line is a dropped connection, which the composer is
    // right to treat as a failure.
    await page.route('**/api/domain/lesson-planner', () => {
      // Deliberately never fulfilled.
    });

    await page.goto('/app/lesson-planner');
    // Wait for hydration before typing: a fill that lands first sets the DOM
    // value and is then wiped by React's first render, leaving the composer
    // empty and Send disabled.
    await page.waitForLoadState('networkidle');
    await page
      .getByLabel('Message the Lesson Planner')
      .fill('Plan a lesson on conclusions');
    await expect(
      page.getByRole('button', { name: 'Send message' })
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Send message' }).click();

    const bar = page.getByTestId('planning-progress');
    await expect(bar).toBeVisible();
    // Named in the teacher's words, never a tool's. (Which line goes with
    // which tool is asserted in the route's own tests, where a real stream can
    // be read a chunk at a time.)
    await expect(bar).toContainText('Thinking about your lesson');
    await expect(bar).not.toContainText('_');
    // The spinner it replaced is gone.
    await expect(page.getByText('Planning the lesson…')).toHaveCount(0);
    // And it is a real progress bar to anything reading the page aloud.
    const meter = bar.getByRole('progressbar');
    await expect(meter).toHaveAttribute('aria-valuenow', /\d+/);
  });

  test('lands the lesson once the stream finishes', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    await page.route('**/api/domain/lesson-planner', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/x-ndjson; charset=utf-8' },
        body:
          [
            JSON.stringify({
              type: 'progress',
              label: 'Looking at your classes',
              fraction: 0.2,
            }),
            JSON.stringify({
              type: 'done',
              status: 200,
              payload: {
                conversationId: 'streamed-1',
                messageId: 'streamed-msg-1',
                reply: '## Conclusions that land\n\nFour minutes of writing.',
                isNewConversation: true,
              },
            }),
          ].join('\n') + '\n',
      });
    });

    await page.goto('/app/lesson-planner');
    // Wait for hydration before typing: a fill that lands first sets the DOM
    // value and is then wiped by React's first render, leaving the composer
    // empty and Send disabled.
    await page.waitForLoadState('networkidle');
    await page
      .getByLabel('Message the Lesson Planner')
      .fill('Plan a lesson on conclusions');
    await expect(
      page.getByRole('button', { name: 'Send message' })
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Send message' }).click();

    await expect(page.getByText('Four minutes of writing.')).toBeVisible();
    // The bar goes when the lesson arrives.
    await expect(page.getByTestId('planning-progress')).toHaveCount(0);
  });

  /**
   * Brian's note: the planner read as a chat client, and the loudest reason was
   * a permanent list of every conversation sitting beside the workspace. It
   * collapses now, and the history it shows is split the way a teacher's
   * lessons are.
   */
  test('keeps the lesson history out of the way until it is asked for', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const draft = await seedLessonPlan(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lesson-planner');
    await page.waitForLoadState('networkidle');

    const rail = page.getByTestId('lesson-rail');
    await expect(rail).toHaveAttribute('data-expanded', 'false');
    // Collapsed, but never trapped: starting a new lesson stays one click away.
    await expect(
      rail.getByRole('button', { name: 'New lesson' })
    ).toBeVisible();
    await expect(page.getByTestId('lesson-rail-tab-drafts')).toHaveCount(0);

    await page.getByTestId('lesson-rail-toggle').click();
    await expect(rail).toHaveAttribute('data-expanded', 'true');
    await expect(page.getByTestId('lesson-rail-tab-drafts')).toBeVisible();
    await expect(page.getByTestId('lesson-rail-tab-library')).toBeVisible();

    // The draft is in the drafts tab, and opening it works from here.
    await expect(rail).toContainText('Conclusions lesson');
    await rail.getByRole('button', { name: /conclusions lesson/i }).click();
    await expect(page).toHaveURL(new RegExp(`c=${draft.conversationId}`));

    // And the choice is remembered, so a teacher who wants it open keeps it.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('lesson-rail')).toHaveAttribute(
      'data-expanded',
      'true'
    );
  });

  test('splits the rail into drafts and a published library', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const toPublish = await seedLessonPlan(e2eContext, { keepFirst: true });
    await seedLessonPlan(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    // Publish one of them from its stack.
    await page.goto(`/app/lesson-planner/${toPublish.conversationId}/packet`);
    const saved = page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/lesson-planner/packet') &&
        response.request().method() === 'POST'
    );
    await page.getByTestId('packet-publish').click();
    await saved;

    await page.goto(`/app/lesson-planner?c=${toPublish.conversationId}`);
    await page.waitForLoadState('networkidle');
    await page.getByTestId('lesson-rail-toggle').click();

    // The open lesson is published, so the rail opens on the list holding it
    // rather than on the tab that does not.
    await expect(page.getByTestId('lesson-rail-tab-library')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    const rail = page.getByTestId('lesson-rail');
    await expect(rail).toContainText('Conclusions lesson');

    // The unpublished one is a draft, and lives in the other tab.
    await page.getByTestId('lesson-rail-tab-drafts').click();
    await expect(page.getByTestId('lesson-rail-tab-drafts')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  test('keeps replies and turns them into a printable lesson packet', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonPlan(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    // Nothing is in the packet until the teacher keeps something.
    await expect(page.getByTestId('lesson-packet-bar')).toHaveCount(0);

    const replies = page.locator('[data-role="assistant"]');
    // The bar counts optimistically, off local state, so it says "1 piece" the
    // moment the button is clicked — before the write has landed. Waiting on
    // the write itself is what makes opening the stack next safe.
    const kept = (run: Promise<unknown>) =>
      Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes('/api/domain/lesson-planner/packet') &&
            response.request().method() === 'POST'
        ),
        run,
      ]);

    await kept(
      replies
        .nth(0)
        .getByRole('button', { name: /add all of this/i })
        .click()
    );

    const bar = page.getByTestId('lesson-packet-bar');
    await expect(bar).toContainText(/1 piece/i);

    // The second reply is a handout, so it is kept for students.
    await kept(
      replies
        .nth(1)
        .getByRole('button', { name: /add all as a handout/i })
        .click()
    );
    await expect(bar).toContainText(/2 pieces/i);

    await bar.getByRole('link', { name: /open the stack/i }).click();
    await expect(page).toHaveURL(
      new RegExp(`/app/lesson-planner/${conversationId}/packet`)
    );

    // The document names itself and carries both kept sections, in order.
    await expect(
      page.getByRole('heading', { name: /warm-up/i, level: 2 })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /conclusion practice/i, level: 2 })
    ).toBeVisible();
    await expect(page.getByText(/5 min/i).first()).toBeVisible();

    // The handout is marked as student-facing and gets a name/date line.
    const handout = page
      .locator('[data-testid="packet-section"][data-audience="student"]')
      .first();
    await expect(handout).toBeVisible();
    await expect(handout).toContainText(/name/i);

    // The outline view collapses the packet to what fits beside a laptop.
    await page.getByRole('button', { name: /outline/i }).click();
    await expect(page.getByTestId('packet-outline')).toContainText('Warm-up');
    await expect(page.getByTestId('packet-outline')).not.toContainText(
      'Daily Pages prompt FW-001'
    );
  });

  test('names the packet and keeps the name', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonPlan(e2eContext, {
      keepFirst: true,
    });
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    await page.goto(`/app/lesson-planner/${conversationId}/packet`);

    const nameField = page.getByLabel('Lesson name');
    await nameField.fill('Conclusions, period 3');
    // The name saves on blur; reloading before that request lands would race it.
    const saved = page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/lesson-planner/packet') &&
        response.request().method() === 'POST'
    );
    await nameField.blur();
    await saved;

    await page.reload();
    await expect(page.getByLabel('Lesson name')).toHaveValue(
      'Conclusions, period 3'
    );
  });

  test('shows every lesson in one history, drafts included', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const kept = await seedLessonPlan(e2eContext, { keepFirst: true });
    const draft = await seedLessonPlan(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    await page.goto('/app/lesson-planner');
    await page.getByRole('link', { name: /all your lessons/i }).click();
    await expect(page).toHaveURL(/\/app\/lesson-planner\/library/);

    // The old library hid anything with nothing kept, so a lesson a teacher
    // had started looked lost. Both belong in a history.
    const keptRow = page.locator(
      `a[href="/app/lesson-planner?c=${kept.conversationId}"]`
    );
    const draftRow = page.locator(
      `a[href="/app/lesson-planner?c=${draft.conversationId}"]`
    );
    await expect(keptRow).toHaveCount(1);
    await expect(draftRow).toHaveCount(1);
    // A lesson with nothing kept says so rather than pretending to be one —
    // "Empty" describes the stack, not the draft/published status the row
    // already sits under.
    await expect(
      page.getByRole('listitem').filter({ has: draftRow })
    ).toContainText(/empty/i);
    await expect(
      page.getByRole('listitem').filter({ has: keptRow })
    ).toContainText(/1 piece/i);
  });

  test('publishes a lesson into the library and back out again', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const older = await seedLessonPlan(e2eContext, { keepFirst: true });
    // Seeded second, so while both are drafts it sorts above the first.
    await seedLessonPlan(e2eContext, { keepFirst: true });
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lesson-planner/library');

    const olderRow = page.getByRole('listitem').filter({
      has: page.locator(
        `a[href="/app/lesson-planner?c=${older.conversationId}"]`
      ),
    });
    const publishedWrite = page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/lesson-planner/packet') &&
        response.request().method() === 'POST'
    );
    await olderRow.getByTestId('history-publish').click();
    await publishedWrite;

    // Published lessons get their own group, above the drafts.
    await expect(
      page.getByText('My lesson library', { exact: true })
    ).toBeVisible();
    await page.reload();
    const rows = page.getByTestId('history-lesson');
    await expect(rows.first()).toContainText('Conclusions lesson');
    await expect(rows.first().getByTestId('history-publish')).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    // And it is reversible — the old library had no way out.
    const unpublished = page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/lesson-planner/packet') &&
        response.request().method() === 'POST'
    );
    await rows.first().getByTestId('history-publish').click();
    await unpublished;
    await page.reload();
    await expect(
      page.getByText('My lesson library', { exact: true })
    ).toHaveCount(0);
  });

  test('deletes a lesson out of the history', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const doomed = await seedLessonPlan(e2eContext, { keepFirst: true });
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lesson-planner/library');

    const row = page.getByRole('listitem').filter({
      has: page.locator(
        `a[href="/app/lesson-planner?c=${doomed.conversationId}"]`
      ),
    });
    await expect(row).toHaveCount(1);
    const removed = page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/lesson-planner/packet') &&
        response.request().method() === 'POST'
    );
    await row.getByTestId('history-delete').click();
    await removed;
    await page.reload();
    await expect(
      page.locator(`a[href="/app/lesson-planner?c=${doomed.conversationId}"]`)
    ).toHaveCount(0);
  });

  test('publishes a lesson from its stack', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonPlan(e2eContext, {
      keepFirst: true,
    });
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);

    const publish = page.getByTestId('packet-publish');
    await expect(publish).toContainText(/publish to my library/i);

    // The button answers optimistically, so wait for the write itself before
    // reloading — otherwise the assertion passes against the local guess.
    const saved = page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/lesson-planner/packet') &&
        response.request().method() === 'POST'
    );
    await publish.click();
    await expect(publish).toContainText(/in your library/i);
    await saved;

    // It survives the round trip, and the history agrees.
    await page.reload();
    await expect(page.getByTestId('packet-publish')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await page.goto('/app/lesson-planner/library');
    await expect(
      page.getByText('My lesson library', { exact: true })
    ).toBeVisible();
  });

  test('scrolls the whole packet when a handout runs past the viewport', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonPlan(e2eContext, {
      keepFirst: true,
      keepLongHandout: true,
    });
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    // A handout prints with open leading, so it runs long on screen too. The
    // app shell is a fixed-height frame, so the packet has to own its scroll —
    // without it the end of the document is simply unreachable.
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);

    // The packet must be the scroll container itself. `overflow: hidden` is
    // still scrollable programmatically, so scrollIntoView would pass even
    // when the bug is present — this checks what a teacher can actually do.
    const scroller = page.getByTestId('packet-scroll');
    const overflows = await scroller.evaluate(
      (node) => node.scrollHeight > node.clientHeight
    );
    expect(overflows).toBe(true);

    const lastLine = page.getByText('Practice item 40:');
    await expect(lastLine).toHaveCount(1);
    await expect(lastLine).not.toBeInViewport();

    // A real wheel gesture, which a clipped container would not answer.
    await page.mouse.move(640, 400);
    await expect(async () => {
      await page.mouse.wheel(0, 4000);
      await expect(lastLine).toBeInViewport({ timeout: 1000 });
    }).toPass({ timeout: 10_000 });
  });

  test('browses saved resources from the lesson index', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonPlan(e2eContext, {
      keepFirst: true,
      keepLongHandout: true,
    });
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    await page.setViewportSize({ width: 1440, height: 700 });
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);

    // Every saved resource is listed, so nothing has to be scrolled for.
    const index = page.getByTestId('resource-index');
    await expect(index).toContainText('Warm-up');
    await expect(index).toContainText('Conclusion practice handout');

    // Jumping goes to the resource rather than the top of the document.
    await index.getByRole('button', { name: /conclusion practice/i }).click();
    await expect(
      page
        .locator('[data-testid="packet-section"][data-audience="student"]')
        .first()
    ).toBeInViewport();

    // Filtering narrows the document to one kind of material.
    await index.getByRole('button', { name: 'Handout', exact: true }).click();
    await expect(
      page.locator('[data-testid="packet-section"][data-audience="student"]')
    ).toHaveCount(1);
    await expect(
      page.locator('[data-testid="packet-section"][data-audience="teacher"]')
    ).toHaveCount(0);
  });

  test('renames a saved resource and keeps the name', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonPlan(e2eContext, {
      keepFirst: true,
    });
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);

    const nameField = page.getByLabel('Name for Warm-up (5 min)');
    await nameField.fill('Bell-ringer');
    const saved = page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/lesson-planner/packet') &&
        response.request().method() === 'POST'
    );
    await nameField.blur();
    await saved;

    await page.reload();
    // The index and the document both use the teacher's name for it.
    await expect(page.getByTestId('resource-index')).toContainText(
      'Bell-ringer'
    );
    // The timing still comes from the lesson, not from the new label.
    await expect(page.getByTestId('resource-index')).toContainText('5m');
  });

  test('names the lesson once, everywhere', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonPlan(e2eContext, {
      keepFirst: true,
    });
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);

    const nameField = page.getByLabel('Lesson name');
    await nameField.fill('Conclusions, period 3');
    const saved = page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/lesson-planner/packet') &&
        response.request().method() === 'POST'
    );
    await nameField.blur();
    await saved;

    // The planner rail and the library both follow the packet's name. The rail
    // starts collapsed, so open it before looking for the lesson in it.
    await page.goto(`/app/lesson-planner?c=${conversationId}`);
    await page.waitForLoadState('networkidle');
    await page.getByTestId('lesson-rail-toggle').click();
    await expect(
      page.getByRole('button', { name: 'Conclusions, period 3' })
    ).toBeVisible();

    await page.goto('/app/lesson-planner/library');
    await expect(
      page.getByRole('link', { name: 'Conclusions, period 3' })
    ).toBeVisible();
  });

  test('shows a deck as a deck, never as raw JSON', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedSlideDeck(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    await page.goto(`/app/lesson-planner/${conversationId}/packet`);

    const card = page.getByTestId('slide-deck-card');
    await expect(card).toContainText('Evidence that earns its place');
    await expect(card).toContainText('3 slides');
    await expect(card).toContainText('9 min');
    // The machinery must never surface to a teacher.
    await expect(page.locator('body')).not.toContainText('speakerNotes');
    await expect(page.locator('body')).not.toContainText('yawp-slides');
  });

  test('presents the deck with keyboard control and speaker notes', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId, messageId } = await seedSlideDeck(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    await page.goto(`/present/${conversationId}/${messageId}`);

    const stage = page.getByTestId('slide-stage');
    const counter = page.getByTestId('slide-counter');
    await expect(stage).toContainText('Evidence that earns its place');
    await expect(counter).toHaveText('1 / 3');

    // Arrow keys and space are what a presenter remote sends.
    await page.keyboard.press('ArrowRight');
    await expect(counter).toHaveText('2 / 3');
    await expect(stage).toContainText('Which one makes you cringe?');
    // The compare layout puts the two versions side by side, not in a list.
    await expect(stage).toContainText('Version A');
    await expect(stage).toContainText('Version B');

    await page.keyboard.press('ArrowLeft');
    await expect(counter).toHaveText('1 / 3');
    await page.keyboard.press('End');
    await expect(counter).toHaveText('3 / 3');

    // Notes are for the teacher's screen and never on the slide itself.
    await expect(page.getByTestId('speaker-notes')).toHaveCount(0);
    await page.keyboard.press('n');
    const notes = page.getByTestId('speaker-notes');
    await expect(notes).toContainText('Collect on the way out.');
    await expect(stage).not.toContainText('Collect on the way out.');
  });

  test('shows the lesson and a way forward when a deck will not build', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId, messageId } = await seedUnreadableDeck(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    await page.goto(`/app/lesson-planner/${conversationId}/packet`);

    // The lesson itself still arrives.
    await expect(page.locator('main')).toContainText('Conclusions that land');
    await expect(page.locator('main')).toContainText('Here is the deck.');
    // The machinery does not.
    await expect(page.locator('body')).not.toContainText('speakerNotes');
    await expect(page.locator('body')).not.toContainText('yawp-slides');
    await expect(page.locator('body')).not.toContainText('"layout"');
    // And the teacher is told what to do instead of being left guessing.
    await expect(page.locator('main')).toContainText('rebuild it, shorter');
    // Nothing pretends to be presentable.
    await expect(page.getByTestId('slide-deck-card')).toHaveCount(0);

    const response = await page.goto(`/present/${conversationId}/${messageId}`);
    expect(response?.status()).toBe(404);
  });

  test('hands over a handout as a thing, not as text to copy out', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonWithMaterials(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    const cards = page.getByTestId('material-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toContainText('Two conclusions, side by side');
    await expect(cards.nth(1)).toContainText('Diagnose & Repair');
    // The plan around them still reads as a plan.
    await expect(page.locator('main')).toContainText('Lesson Sequence');
    // The machinery never surfaces.
    await expect(page.locator('main')).not.toContainText('yawp-material');
    await expect(page.locator('main')).not.toContainText('kind: handout');

    // The material itself is one click away, not pasted into the plan.
    await expect(page.locator('main')).not.toContainText('Underline the');
    await cards.nth(1).getByText('Diagnose & Repair').click();
    await expect(cards.nth(1)).toContainText('Underline the sentence');
  });

  test('opens the packet from a material alone, with no reply kept', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonWithMaterials(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    await expect(page.getByTestId('lesson-packet-bar')).toHaveCount(0);

    const save = page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/lesson-planner/packet') &&
        response.request().method() === 'POST'
    );
    await page
      .getByTestId('material-card')
      .first()
      .getByTestId('material-toggle')
      .click();
    await save;

    // Filing a handout puts something in the packet, so there has to be a way
    // to get to it — without keeping the whole lesson plan first.
    const bar = page.getByTestId('lesson-packet-bar');
    await expect(bar).toContainText(/1 piece/i);
    await bar.getByRole('link', { name: /open the stack/i }).click();
    await expect(page).toHaveURL(
      new RegExp(`/app/lesson-planner/${conversationId}/packet`)
    );
  });

  test('prints material inside a kept reply as material, not as a code block', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonWithMaterials(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    const keep = page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/lesson-planner/packet') &&
        response.request().method() === 'POST'
    );
    await page
      .locator('[data-role="assistant"]')
      .first()
      .getByRole('button', { name: /add all of this/i })
      .click();
    await keep;

    await page.goto(`/app/lesson-planner/${conversationId}/packet`);

    // The header and fence must never reach the page.
    await expect(page.locator('main')).not.toContainText('kind: sample');
    await expect(page.locator('main')).not.toContainText('yawp-material');
    // The material still prints, as material.
    await expect(page.locator('main')).toContainText(
      'Two conclusions, side by side'
    );
    await expect(page.locator('main')).toContainText('The door slams');
    // And its headings are not mistaken for stages of the lesson.
    await page.getByRole('button', { name: /outline/i }).click();
    await expect(page.locator('main')).not.toContainText('Draft A');
  });

  test('puts one material in the packet without keeping the whole plan', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonWithMaterials(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    const handout = page.getByTestId('material-card').nth(1);
    const save = page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/lesson-planner/packet') &&
        response.request().method() === 'POST'
    );
    await handout.getByTestId('material-toggle').click();
    await save;
    await expect(handout.getByTestId('material-toggle')).toContainText(
      'In the stack'
    );

    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    // The handout is there, printable, with a name-and-date line…
    await expect(page.locator('main')).toContainText('Diagnose & Repair');
    await expect(page.locator('main')).toContainText('Underline the sentence');
    await expect(page.locator('main')).toContainText('Name ___');
    // …and the lesson plan the teacher did not keep is not.
    await expect(page.locator('main')).not.toContainText('Lesson Sequence');
  });

  test('remembers which materials are already in the packet', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonWithMaterials(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    const toggle = page
      .getByTestId('material-card')
      .first()
      .getByTestId('material-toggle');
    const save = page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/lesson-planner/packet') &&
        response.request().method() === 'POST'
    );
    await toggle.click();
    await save;

    await page.reload();
    await expect(
      page.getByTestId('material-card').first().getByTestId('material-toggle')
    ).toContainText('In the stack');
    // The one beside it is untouched.
    await expect(
      page.getByTestId('material-card').nth(1).getByTestId('material-toggle')
    ).toContainText('Add to stack');
  });

  test('combines the student pieces into one handout to lead a class through', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonWithMaterials(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    // File both pieces, then go and combine them.
    for (const index of [0, 1]) {
      const save = page.waitForResponse(
        (response) =>
          response.url().includes('/api/domain/lesson-planner/packet') &&
          response.request().method() === 'POST'
      );
      await page
        .getByTestId('material-card')
        .nth(index)
        .getByTestId('material-toggle')
        .click();
      await save;
    }

    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    await page.getByRole('button', { name: /student handout/i }).click();

    const parts = page.getByTestId('handout-part');
    await expect(parts).toHaveCount(2);
    await expect(parts.first()).toContainText('Part 1.');
    await expect(parts.first()).toContainText('Two conclusions, side by side');
    await expect(parts.nth(1)).toContainText('Part 2.');
    await expect(parts.nth(1)).toContainText('Diagnose & Repair');
    // One heading line for the packet, not one per piece — and it carries the
    // section, because a teacher with five periods sorts by section first.
    await expect(page.getByText(/^Name _+$/)).toHaveCount(1);
    await expect(page.getByText(/^Section _+$/)).toHaveCount(1);
    await expect(page.getByText(/^Date _+$/)).toHaveCount(1);

    // The teacher can leave a piece out, and the numbering follows.
    await page
      .getByRole('checkbox', { name: 'Two conclusions, side by side' })
      .uncheck();
    await expect(parts).toHaveCount(1);
    await expect(parts.first()).toContainText('Part 1.');
    await expect(parts.first()).toContainText('Diagnose & Repair');
  });

  test('downloads one handout piece alone instead of the combined handout', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    // A teacher wants their handouts kept separate far more often than they
    // want them merged into one long document — this is that path, reachable
    // from the same checklist the combined handout uses.
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonWithMaterials(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    for (const index of [0, 1]) {
      const save = page.waitForResponse(
        (response) =>
          response.url().includes('/api/domain/lesson-planner/packet') &&
          response.request().method() === 'POST'
      );
      await page
        .getByTestId('material-card')
        .nth(index)
        .getByTestId('material-toggle')
        .click();
      await save;
    }

    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    await page.getByRole('button', { name: /student handout/i }).click();

    const download = page.waitForEvent('download');
    await page
      .getByRole('link', {
        name: 'Download Diagnose & Repair as its own PDF',
      })
      .click();
    const file = await download;

    expect(file.suggestedFilename()).toContain('Diagnose & Repair');
    const bytes = await readFile(await file.path());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('renders a unit map as a board with a way into every day', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    // The map is worth having because it is the way into the lessons, not
    // because it summarises them — so the JSON must become a board with a
    // button per day, never a wall of braces.
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedUnitPlan(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    const card = page.getByTestId('unit-plan-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Writing the literary analysis paragraph');
    await expect(card).toContainText('3 periods');
    await expect(card.getByTestId('unit-plan-day')).toHaveCount(2);
    await expect(card).toContainText('What a claim is');
    await expect(card).toContainText('Ends with:');

    // The machinery never reaches the teacher.
    await expect(page.locator('main')).not.toContainText('"days"');
    await expect(page.locator('main')).not.toContainText('yawp-unit');
  });

  test('sends the day’s own words when a teacher builds one out', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedUnitPlan(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    await page.getByTestId('unit-build-day').nth(1).click();

    // It goes out as the teacher, carrying the day the teacher pointed at
    // rather than the planner's recollection of it.
    const sent = page.locator('[data-role="user"]').last();
    await expect(sent).toContainText('day 2');
    await expect(sent).toContainText('Evidence that earns its place');
    await expect(sent).toContainText('Choose the quote that proves the claim');
  });

  test('a built day is its own lesson, with a way in and a way back', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    // A day is a whole lesson — plan, packet, deck, handouts — so it lives in
    // its own conversation rather than stacked onto the map's thread. The map
    // is where a teacher comes back to reach it.
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId, dayConversationId } = await seedUnitPlan(
      e2eContext,
      { buildDay: 2 }
    );
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    // Day 2 is built, so it offers a way in rather than a second build.
    const days = page.getByTestId('unit-plan-day');
    await expect(days.nth(1).getByTestId('unit-open-day')).toBeVisible();
    await expect(days.nth(1).getByTestId('unit-build-day')).toHaveCount(0);
    // Day 1 was never built, so it still offers to build.
    await expect(days.first().getByTestId('unit-build-day')).toBeVisible();
    await expect(days.first().getByTestId('unit-open-day')).toHaveCount(0);

    // Opening day 2 lands in its own lesson, not the map.
    await days.nth(1).getByTestId('unit-open-day').click();
    await expect(page).toHaveURL(new RegExp(`c=${dayConversationId}`));
    await expect(page.getByTestId('unit-day-breadcrumb')).toContainText(
      'Day 2'
    );
    await expect(page.locator('main')).toContainText(
      'Here is the lesson for day 2'
    );
    // The map's own transcript is not dragged along with it.
    await expect(page.locator('main')).not.toContainText('Here is the arc');

    // And there is a way home from inside the day.
    await page.getByTestId('back-to-unit-map').click();
    await expect(page).toHaveURL(new RegExp(`c=${conversationId}`));
    await expect(page.getByTestId('unit-plan-card')).toBeVisible();
  });

  test('prints the unit map as a table rather than a code fence', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedUnitPlan(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    // Wait for the keep to land: navigating first aborts the fetcher POST and
    // the packet arrives empty.
    const save = page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/lesson-planner/packet') &&
        response.request().method() === 'POST'
    );
    await page
      .locator('[data-role="assistant"]')
      .first()
      .getByRole('button', { name: /add all of this/i })
      .click();
    await save;

    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    const main = page.locator('main');
    // On paper there is nothing to click, so the board becomes the table.
    await expect(main).toContainText('What a claim is');
    await expect(main).toContainText('Students do');
    await expect(main).not.toContainText('"objective"');
  });

  test('prints the student handout without the teacher’s plan', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonWithMaterials(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    const save = page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/lesson-planner/packet') &&
        response.request().method() === 'POST'
    );
    await page
      .getByTestId('material-card')
      .nth(1)
      .getByTestId('material-toggle')
      .click();
    await save;

    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    await page.getByRole('button', { name: /student handout/i }).click();

    // What actually reaches paper, rather than what the screen shows.
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByTestId('handout-part')).toBeVisible();
    await expect(page.locator('main')).toContainText('Underline the sentence');
    // The controls and the include/exclude list are not part of the handout.
    await expect(page.getByTestId('packet-save-pdf')).toBeHidden();
    await expect(page.getByText('What goes in this handout')).toBeHidden();
    await page.emulateMedia({ media: 'screen' });
  });

  test('saves one resource on its own when asked to', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonPlan(e2eContext, {
      keepFirst: true,
      keepLongHandout: true,
    });
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);

    const sections = page.locator('[data-testid="packet-section"]');
    await expect(sections).toHaveCount(2);

    const download = page.waitForEvent('download');
    await sections.nth(1).getByTestId('section-save-pdf').click();
    const file = await download;

    // Named after the resource, so it is not just another copy of the lesson.
    expect(file.suggestedFilename()).toContain('handout');
    const bytes = await readFile(await file.path());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('downloads the lesson as a real PDF in one click', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonPlan(e2eContext, {
      keepFirst: true,
      keepLongHandout: true,
    });
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);

    const lessonName = (
      await page.locator('article h1').first().textContent()
    )?.trim();
    expect(lessonName).toBeTruthy();

    // One click, one file — no print dialog to steer.
    const download = page.waitForEvent('download');
    await page.getByTestId('packet-save-pdf').click();
    const file = await download;

    expect(file.suggestedFilename()).toBe(`${lessonName}.pdf`);
    const path = await file.path();
    const bytes = await readFile(path);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.toString('latin1')).toContain('%%EOF');
    // A whole lesson, not an empty shell.
    expect(bytes.length).toBeGreaterThan(2000);
  });

  /**
   * The deck has to be able to leave Yawp: the classroom desktop nobody is
   * logged into, the substitute who needs Tuesday's slides, the colleague who
   * wants to borrow the lesson.
   */
  test('downloads a deck as a real PowerPoint file from the packet', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedSlideDeck(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);

    const download = page.waitForEvent('download');
    await page
      .getByTestId('slide-deck-card')
      .last()
      .getByTestId('deck-download-pptx')
      .click();
    const file = await download;

    expect(file.suggestedFilename()).toBe('Evidence that earns its place.pptx');
    const bytes = await readFile(await file.path());
    // Every Office Open XML file is a zip, and every zip starts "PK".
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    expect(bytes.length).toBeGreaterThan(5000);
  });

  /**
   * And before it is filed, too. A teacher who wants the deck on the classroom
   * machine should not have to add it to a packet first.
   */
  test('downloads a deck straight from the conversation', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedSlideDeck(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    const download = page.waitForEvent('download');
    await page.getByTestId('deck-download-pptx').first().click();
    const file = await download;

    expect(file.suggestedFilename()).toBe('Evidence that earns its place.pptx');
    expect((await readFile(await file.path())).subarray(0, 2).toString()).toBe(
      'PK'
    );
  });

  // A lesson plan is not a deck, so its section must not offer the button.
  test('offers PowerPoint only where there is a deck', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonPlan(e2eContext, {
      keepFirst: true,
    });
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);

    await expect(page.getByTestId('section-save-pdf').first()).toBeVisible();
    await expect(page.getByTestId('deck-download-pptx')).toHaveCount(0);
  });

  test('downloads the student handout when that is what is on screen', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonPlan(e2eContext, {
      keepFirst: true,
      keepLongHandout: true,
    });
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    await page.getByRole('button', { name: /student handout/i }).click();

    const download = page.waitForEvent('download');
    await page.getByTestId('packet-save-pdf').click();
    const file = await download;

    // The file says which one it is, so the two do not collide in Downloads.
    expect(file.suggestedFilename()).toContain('Student handout');
    expect(file.suggestedFilename().endsWith('.pdf')).toBe(true);
    const bytes = await readFile(await file.path());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('offers the deck and the handout the moment a plan lands', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedBareLessonPlan(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    // The seeded reply is a plan that built nothing, so both follow-ons are
    // pinned by the app rather than left to whatever the model suggested.
    await expect(
      page.getByRole('button', {
        name: /build the slide deck for this lesson/i,
      })
    ).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: /build the student handout for this lesson/i,
      })
    ).toBeVisible();
  });

  test('a revised handout takes the place of the one in the packet', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedRevisedHandout(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    const cards = page.getByTestId('material-card');
    await expect(cards).toHaveCount(2);

    // File the first version, then the rewrite that claims the same slot.
    for (const index of [0, 1]) {
      const save = page.waitForResponse(
        (response) =>
          response.url().includes('/api/domain/lesson-planner/packet') &&
          response.request().method() === 'POST'
      );
      await cards.nth(index).getByTestId('material-toggle').click();
      await save;
    }

    // The original stops claiming to be filed — there is one handout, not two.
    await expect(cards.nth(0).getByTestId('material-toggle')).toContainText(
      'Add to stack'
    );
    await expect(cards.nth(1).getByTestId('material-toggle')).toContainText(
      'In the stack'
    );

    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    await expect(page.locator('main')).toContainText('The shorter version.');
    await expect(page.locator('main')).not.toContainText('The long version.');
  });

  test('edits a filed handout in place, in the stack', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonWithMaterials(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    const save = page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/lesson-planner/packet') &&
        response.request().method() === 'POST'
    );
    await page
      .getByTestId('material-card')
      .nth(1)
      .getByTestId('material-toggle')
      .click();
    await save;

    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    await page.getByTestId('material-edit-start').click();
    const surface = page
      .getByTestId('material-editor-surface')
      .locator(EDITOR_SELECTOR);
    await expect(surface).toBeVisible();
    // A real editing surface, not a text field: select everything and type
    // over it, the way a teacher would in any document editor.
    await surface.click();
    await page.keyboard.press(SELECT_ALL_SHORTCUT);
    await page.keyboard.insertText(
      'Read each excerpt, revised by hand for this class.'
    );

    const saveEdit = page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/lesson-planner/packet') &&
        response.request().method() === 'POST'
    );
    await page.getByTestId('material-editor-save').click();
    await saveEdit;

    await expect(page.getByTestId('material-editor')).toHaveCount(0);
    await expect(page.locator('main')).toContainText(
      'revised by hand for this class'
    );
    await expect(page.getByTestId('material-edited-badge')).toBeVisible();

    // Reload: the edit is saved, not just held in the page's own state.
    await page.reload();
    await expect(page.locator('main')).toContainText(
      'revised by hand for this class'
    );
    await expect(page.getByTestId('material-edited-badge')).toBeVisible();
  });

  test('asks before a chat revision replaces a hand-edited handout', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedRevisedHandout(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    // File the first version, then hand-edit it in the stack.
    const cards = page.getByTestId('material-card');
    const fileFirst = page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/lesson-planner/packet') &&
        response.request().method() === 'POST'
    );
    await cards.nth(0).getByTestId('material-toggle').click();
    await fileFirst;

    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    await page.getByTestId('material-edit-start').click();
    const surface = page
      .getByTestId('material-editor-surface')
      .locator(EDITOR_SELECTOR);
    await surface.click();
    await page.keyboard.press(SELECT_ALL_SHORTCUT);
    await page.keyboard.insertText('My own rewrite of the long version.');
    const saveEdit = page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/lesson-planner/packet') &&
        response.request().method() === 'POST'
    );
    await page.getByTestId('material-editor-save').click();
    await saveEdit;

    // Back in chat, filing the second version over the same slot has to ask
    // rather than quietly erase the edit just made.
    await page.goto(`/app/lesson-planner?c=${conversationId}`);
    page.once('dialog', (dialog) => dialog.dismiss());
    const conflict = page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/lesson-planner/packet') &&
        response.status() === 409
    );
    await cards.nth(1).getByTestId('material-toggle').click();
    await conflict;

    // Dismissed: the hand-edited version is still what is filed.
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    await expect(page.locator('main')).toContainText(
      'My own rewrite of the long version.'
    );

    // Back in chat, try again and accept this time.
    await page.goto(`/app/lesson-planner?c=${conversationId}`);
    page.once('dialog', (dialog) => dialog.accept());
    const replaced = page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/lesson-planner/packet') &&
        response.status() !== 409
    );
    await cards.nth(1).getByTestId('material-toggle').click();
    await replaced;

    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    await expect(page.locator('main')).toContainText('The shorter version.');
    await expect(page.locator('main')).not.toContainText(
      'My own rewrite of the long version.'
    );
    // The fork is over: the "Edited" mark does not survive a confirmed
    // replace, because the content on file came from the model again.
    await expect(page.getByTestId('material-edited-badge')).toHaveCount(0);
  });

  test('files a deck on its own and presents it from the packet', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedSlideDeck(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    const save = page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/lesson-planner/packet') &&
        response.request().method() === 'POST'
    );
    await page.getByTestId('deck-toggle').click();
    await save;
    await expect(page.getByTestId('deck-toggle')).toContainText('In the stack');

    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    // The seeded reply is kept too, so the filed deck is the later card.
    const card = page.getByTestId('slide-deck-card').last();
    await expect(card).toContainText('Evidence that earns its place');
    await card.getByRole('link', { name: /present/i }).click();
    await expect(page.getByTestId('slide-counter')).toHaveText('1 / 3');
  });

  test('asks for the lesson length on a spectrum instead of in prose', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedAskTurn(e2eContext, 'minutes: 50');
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    // The request itself is machinery and never reaches the teacher as text.
    await expect(page.locator('main')).not.toContainText('yawp-ask');
    await expect(page.locator('main')).toContainText('Before I plan');

    const card = page.getByTestId('lesson-ask-card');
    await expect(card).toBeVisible();
    // It opens on the planner's own guess, so agreeing costs one tap.
    await expect(page.getByTestId('lesson-minutes-value')).toHaveText('50 min');

    const slider = page.getByRole('slider', {
      name: /lesson length in minutes/i,
    });
    await slider.fill('90');
    await expect(page.getByTestId('lesson-minutes-value')).toHaveText(
      '1 hr 30 min'
    );
    await slider.fill('5');
    await expect(page.getByTestId('lesson-minutes-value')).toHaveText('5 min');
  });

  test('does not ask how long before it knows what the lesson is', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    // The planner drew the slider on its opening turn, so tapping "Look at my
    // classes and tell me what they need work on" sent "…what they need work
    // on. 50 minutes." — a period length on a request to read the gradebook.
    const prisma = createE2EPrismaClient();
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: 'Opening turn',
        messages: {
          create: [
            {
              role: 'user',
              content: 'Help me plan something.',
              createdAt: new Date('2026-08-05T10:00:00.000Z'),
            },
            {
              role: 'assistant',
              content:
                'What should this lesson be about?\n\n```yawp-ask\nminutes: 50\nactivities\n```',
              createdAt: new Date('2026-08-05T10:00:01.000Z'),
            },
          ],
        },
      },
      select: { id: true },
    });
    await prisma.$disconnect();

    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversation.id}`);

    // No slider on a turn that has not settled the subject...
    await expect(
      page.getByRole('slider', { name: /lesson length in minutes/i })
    ).toHaveCount(0);

    // ...but the activities question still makes sense, so it survives — one
    // step along, because the app pins its own opening option as step one.
    await page.getByTestId('lesson-ask-next').click();
    await expect(
      page.getByRole('checkbox', { name: /you pick the ones that fit/i })
    ).toBeVisible();
    // Still no slider once the whole card is open.
    await expect(
      page.getByRole('slider', { name: /lesson length in minutes/i })
    ).toHaveCount(0);
  });

  test('sends the activities a teacher checks as their own message', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedAskTurn(
      e2eContext,
      'minutes: 45\nactivities'
    );
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    // The card asks one thing at a time; the activities are the last step.
    await page.getByTestId('lesson-ask-next').click();
    await page.getByRole('checkbox', { name: 'Jigsaw' }).check();
    await page.getByRole('checkbox', { name: 'Gallery walk' }).check();

    const sent = page.waitForRequest(
      (request) =>
        request.url().includes('/api/domain/lesson-planner') &&
        request.method() === 'POST'
    );
    await page.getByTestId('lesson-ask-send').click();
    const request = await sent;

    // It leaves as a sentence the teacher could have typed themselves.
    expect(request.postData()).toContain('45+minutes.');
    expect(request.postData()).toContain('Jigsaw');
    expect(request.postData()).toContain('Gallery+walk');
  });

  test('always offers to let the planner pick the activities', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedAskTurn(e2eContext, 'activities');
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    // No length was asked for, so no slider is drawn.
    await expect(
      page.getByRole('slider', { name: /lesson length in minutes/i })
    ).toHaveCount(0);

    const handBack = page.getByRole('checkbox', {
      name: /you pick the ones that fit/i,
    });
    await expect(handBack).toBeVisible();
    await page.getByRole('checkbox', { name: 'Jigsaw' }).check();
    await handBack.check();
    // Handing the choice back clears what was picked — the two contradict.
    await expect(
      page.getByRole('checkbox', { name: 'Jigsaw' })
    ).not.toBeChecked();

    const sent = page.waitForRequest(
      (request) =>
        request.url().includes('/api/domain/lesson-planner') &&
        request.method() === 'POST'
    );
    await page.getByTestId('lesson-ask-send').click();
    const request = await sent;
    expect(request.postData()).toContain('You+pick+the+activities');
  });

  test('carries the chosen option and the length in one message', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedAskTurn(
      e2eContext,
      'minutes: 50',
      'Build it around Evidence/Support\nFocus on integrating quotes'
    );
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    const card = page.getByTestId('lesson-ask-card');
    const option = page.getByRole('button', {
      name: 'Build it around Evidence/Support',
    });
    // Exactly one of them, and it is inside the card — two independent senders
    // on one turn meant whichever the teacher touched first threw the other
    // answer away.
    await expect(option).toHaveCount(1);
    await expect(
      card.getByRole('button', { name: /evidence\/support/i })
    ).toBeVisible();

    await option.click();
    await page
      .getByRole('slider', { name: /lesson length in minutes/i })
      .fill('45');

    const sent = page.waitForRequest(
      (request) =>
        request.url().includes('/api/domain/lesson-planner') &&
        request.method() === 'POST'
    );
    await page.getByTestId('lesson-ask-send').click();
    const request = await sent;

    // One message, carrying the subject and then its length.
    expect(request.postData()).toContain('Build+it+around+Evidence%2FSupport.');
    expect(request.postData()).toContain('45+minutes.');
  });

  test('turns a warm-up it wrote into a Class Starter', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedWrittenWarmUp(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    // The prompt is shown as students would read it, never as a fence.
    await expect(page.locator('main')).not.toContainText('yawp-daily-pages');
    const card = page.getByTestId('daily-pages-card');
    await expect(card).toContainText(
      'Think of the last time you tried to convince someone'
    );

    // And it is one click from being a real assignment, prompt already in it.
    // Four minutes at the top of the period is a Class Starter, and the block
    // not saying so must not turn it into Daily Pages, which is graded on
    // depth the prompt never asked for.
    await expect(card).toHaveAttribute('data-exercise-kind', 'class-starter');
    await card.getByTestId('daily-pages-create').click();
    await expect(page).toHaveURL(
      new RegExp(
        `/app/assignment-types/${e2eContext.classStarterAssignmentTypeId}`
      )
    );
    await expect(page.locator('#assignment-create-prompt')).toHaveValue(
      /Think of the last time you tried to convince someone/
    );

    // Embedding a creator in a plan means the button is a door out of the
    // planner; the way back has to still be there after the sheet is done,
    // not only in the moment it opens.
    await page.keyboard.press('Escape');
    const back = page.getByTestId('back-to-lesson');
    await expect(back).toBeVisible();
    await back.click();
    await expect(page).toHaveURL(
      new RegExp(`/app/lesson-planner\\?c=${conversationId}`)
    );
    // And the lesson is the one they left, not a blank planner.
    await expect(page.getByTestId('daily-pages-card')).toBeVisible();
  });

  test('offers three warm-ups, each assignable on its own', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedThreeWarmUpOptions(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    // Three cards, in the order the reply wrote them, never one card holding
    // three prompts — the teacher chooses by tapping, not by copying.
    const cards = page.getByTestId('daily-pages-card');
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(0)).toContainText(
      'Think of the last time you tried to convince someone'
    );
    await expect(cards.nth(1)).toContainText('a rule you think is wrong');
    await expect(cards.nth(2)).toContainText(
      'something you believed last year'
    );

    // Every option carries its own button, and the step above them names none
    // of the three, so the lesson reads the same whichever one goes up.
    await expect(page.getByTestId('daily-pages-create')).toHaveCount(3);
    await expect(page.locator('main')).toContainText('Pick one:');
    await expect(page.locator('main')).not.toContainText('yawp-daily-pages');

    // All three are bell-ringers. The first is a freewrite library prompt, and
    // its id alone files it as a Class Starter even with no kind line.
    for (const index of [0, 1, 2]) {
      await expect(cards.nth(index)).toHaveAttribute(
        'data-exercise-kind',
        'class-starter'
      );
    }

    // The one they pick is the one that reaches the assignment sheet.
    await cards.nth(2).getByTestId('daily-pages-create').click();
    await expect(page).toHaveURL(
      new RegExp(
        `/app/assignment-types/${e2eContext.classStarterAssignmentTypeId}`
      )
    );
    await expect(page.locator('#assignment-create-prompt')).toHaveValue(
      /something you believed last year/
    );
  });

  test('sends a class starter to the Class Starter sheet, not to Daily Pages', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedClassStarterAndReflection(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    const cards = page.getByTestId('daily-pages-card');
    await expect(cards).toHaveCount(2);
    await expect(page.locator('main')).not.toContainText('yawp-daily-pages');
    // Neither card leaks its own header lines into the prompt students read.
    await expect(page.locator('main')).not.toContainText('kind:');

    // The card says which exercise this is, because the two are graded
    // differently and the teacher is the one who has to know.
    const starter = cards.nth(0);
    await expect(starter).toHaveAttribute(
      'data-exercise-kind',
      'class-starter'
    );
    await expect(starter).toContainText('Class Starter');
    await expect(starter).toContainText('Name something you wanted badly');

    const reflection = cards.nth(1);
    await expect(reflection).toHaveAttribute(
      'data-exercise-kind',
      'daily-pages'
    );
    await expect(reflection).toContainText('Daily Pages');
    // A reflection after the reading is not a warm-up, and the card must not
    // call it one: that is the very line the two exercises are split along.
    await expect(reflection).not.toContainText(/warm-up/i);
    await expect(reflection).toContainText('graded reflection');
    await expect(reflection).toContainText('What did it cost him?');

    // And the starter reaches its own sheet. Filing it as Daily Pages would
    // mark a four-minute entry for depth of reflection nobody asked for.
    await starter.getByTestId('daily-pages-create').click();
    await expect(page).toHaveURL(
      new RegExp(
        `/app/assignment-types/${e2eContext.classStarterAssignmentTypeId}`
      )
    );
    await expect(page.locator('#assignment-create-prompt')).toHaveValue(
      /Name something you wanted badly/
    );

    // The reflection still goes where it always did.
    await page.goto(`/app/lesson-planner?c=${conversationId}`);
    await cards.nth(1).getByTestId('daily-pages-create').click();
    await expect(page).toHaveURL(
      new RegExp(
        `/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}`
      )
    );
  });

  /**
   * A fundamentals lesson ends on practice, and practice in Yawp is an
   * assignment students work, not a worksheet to retype. The card assigns it
   * from inside the lesson, with the planner's choices already in the sheet.
   */
  test('assigns the writing practice it planned, without leaving the lesson', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    await setWritingPracticeEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedPlannedPractice(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('main')).not.toContainText('yawp-practice');
    const card = page.getByTestId('practice-card');
    await expect(card).toBeVisible();
    // Named by the lesson's real title, and only the lesson Yawp has.
    await expect(card).toContainText('Fixing Comma Splices');
    await expect(card).not.toContainText('lesson-yawp-does-not-have');
    await expect(card).toContainText('6 problems');

    await card.getByTestId('practice-assign').click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByLabel('Assignment title')).toHaveValue(
      'Comma splice repair'
    );
    await expect(sheet.getByLabel('Number of problems')).toHaveValue('6');
    await expect(sheet.getByLabel(/instructions/i)).toHaveValue(
      'Fix each sentence two different ways.'
    );

    await sheet
      .getByTestId(`writing-practice-class-${e2eContext.classId}`)
      .click();
    await sheet.getByLabel('Due date').fill('2026-12-01');
    await sheet.getByRole('button', { name: 'Assign practice' }).click();
    await expect(
      sheet.getByTestId('writing-practice-assign-result')
    ).toContainText('Practice assigned');

    // What was created is what the planner asked for, minus the lesson Yawp
    // does not have.
    const prisma = createE2EPrismaClient();
    try {
      const assigned = await prisma.writingPracticeAssignment.findFirst({
        where: { createdByMembershipId: e2eContext.teacherMembershipId },
        orderBy: { createdAt: 'desc' },
      });
      expect(assigned?.lessonSlugs).toEqual(['fixing-comma-splices']);
      expect(assigned?.problemCount).toBe(6);
      expect(assigned?.title).toBe('Comma splice repair');
    } finally {
      await prisma.$disconnect();
    }

    await clearWritingPractice(e2eContext.teacherMembershipId);
    await setWritingPracticeEnabled(e2eContext.organizationId, false);
  });

  test('offers the practice button even where the retired Writing Practice flag is off', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    await setWritingPracticeEnabled(e2eContext.organizationId, false);
    const { conversationId } = await seedPlannedPractice(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);
    await page.waitForLoadState('networkidle');

    // Writing Practice is on for every school now, so the flag no longer
    // decides whether the lesson can be assigned.
    await expect(page.locator('main')).not.toContainText('yawp-practice');
    await expect(page.getByTestId('practice-card')).toContainText('6 problems');
    await expect(page.getByTestId('practice-assign')).toHaveCount(1);
  });

  test('turns the check it planned into a real exit ticket', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedPlannedExitTicket(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    // The ticket arrives as the words students read, never as a fence.
    await expect(page.locator('main')).not.toContainText('yawp-exit-ticket');
    const card = page.getByTestId('exit-ticket-card');
    await expect(card).toContainText(
      'the difference between weathering and erosion'
    );
    // What the responses will be read against, shown because it is about to
    // be filled in on the teacher's behalf.
    await expect(card).toContainText('Whether the material moves');

    // One click from being an assignment, with the form already answered —
    // including the notes the teacher would otherwise retype at 3pm.
    await card.getByTestId('exit-ticket-create').click();
    await expect(page).toHaveURL(
      new RegExp(
        `/app/assignment-types/${e2eContext.exitTicketAssignmentTypeId}`
      )
    );
    await expect(
      page.locator('#assignment-create-exit-ticket-topic')
    ).toHaveValue('the difference between weathering and erosion');
    await expect(
      page.locator('#assignment-create-exit-ticket-lesson-mustMention')
    ).toHaveValue('Whether the material moves.');
    // And the teacher reads the composed prompt before anything is created.
    await expect(
      page.locator('#assignment-create-exit-ticket-preview')
    ).toContainText('the difference between weathering and erosion');

    // The way back to the half-finished lesson is still there afterwards.
    await page.keyboard.press('Escape');
    const back = page.getByTestId('back-to-lesson');
    await expect(back).toBeVisible();
    await back.click();
    await expect(page).toHaveURL(
      new RegExp(`/app/lesson-planner\\?c=${conversationId}`)
    );
  });

  test('hands over a graded reflection with its question and points', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedPlannedGradedReflection(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    const card = page.getByTestId('exit-ticket-card');
    await expect(card).toContainText('Still wondering');
    await expect(card).toContainText('What is one question you still have');
    await expect(card.getByTestId('exit-ticket-grading')).toHaveText(
      'Graded · 3 points · completion'
    );

    await card.getByTestId('exit-ticket-create').click();
    await expect(
      page.getByRole('radio', { name: /^Reflection/ })
    ).toBeChecked();
    await expect(
      page.getByRole('radio', { name: 'Still wondering' })
    ).toBeChecked();
    await expect(page.getByLabel('Grade this ticket')).toBeChecked();
    await expect(page.getByLabel('How many points?')).toHaveValue('3');
    await expect(
      page.getByRole('radio', { name: /^Completion/ })
    ).toBeChecked();
  });

  test('refuses to present a reply that has no deck in it', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const { conversationId } = await seedLessonPlan(e2eContext, {
      keepFirst: true,
    });
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    const response = await page.goto(
      `/present/${conversationId}/not-a-deck-message`
    );
    expect(response?.status()).toBe(404);
  });

  test('always offers the data-driven option on the opening reply', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const prisma = createE2EPrismaClient();
    let conversationId: string;
    try {
      const conversation = await prisma.lessonPlanConversation.create({
        data: {
          membershipId: e2eContext.teacherMembershipId,
          organizationId: e2eContext.organizationId,
          title: 'Opening turn',
          messages: {
            create: [
              {
                role: 'user',
                content: 'Help me plan a lesson.',
                createdAt: new Date('2026-08-04T10:00:00.000Z'),
              },
              {
                // The model offered only room-personality options, and none of
                // them hands the choice back to the data.
                role: 'assistant',
                content:
                  'Which class, and what is the room like?\n\n```suggestions\n10th grade, 50 min, talkative\n11th grade, 45 min, quiet\n```',
                createdAt: new Date('2026-08-04T10:00:01.000Z'),
              },
            ],
          },
        },
        select: { id: true },
      });
      conversationId = conversation.id;
    } finally {
      await prisma.$disconnect();
    }

    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    // Pinned by the app, first, whatever the model happened to suggest.
    const chips = page.getByRole('button', { name: /^↳?\s*(10th|11th|Look)/ });
    await expect(
      page.getByRole('button', {
        name: /look at my classes and tell me what they need work on/i,
      })
    ).toBeVisible();
    await expect(chips.first()).toContainText(/look at my classes/i);

    // The teacher never said a word about the room, so the app does not offer
    // "talkative" and "quiet" versions of the same question.
    await expect(
      page.getByRole('button', { name: /10th grade, 50 min$/ })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /11th grade, 45 min$/ })
    ).toBeVisible();
    await expect(page.locator('main')).not.toContainText('talkative');
  });

  test('keeps the room in the options once the teacher raises it', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerEnabled(e2eContext.organizationId, true);
    const prisma = createE2EPrismaClient();
    let conversationId: string;
    try {
      const conversation = await prisma.lessonPlanConversation.create({
        data: {
          membershipId: e2eContext.teacherMembershipId,
          organizationId: e2eContext.organizationId,
          title: 'Room raised',
          messages: {
            create: [
              {
                role: 'user',
                content:
                  'My second period is really talkative but third is like pulling teeth.',
                createdAt: new Date('2026-08-04T10:00:00.000Z'),
              },
              {
                role: 'assistant',
                content:
                  'Got it.\n\n```suggestions\n10th grade, 50 min, talkative\n11th grade, 45 min, quiet\n```',
                createdAt: new Date('2026-08-04T10:00:01.000Z'),
              },
            ],
          },
        },
        select: { id: true },
      });
      conversationId = conversation.id;
    } finally {
      await prisma.$disconnect();
    }

    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    await expect(
      page.getByRole('button', { name: /10th grade, 50 min, talkative/ })
    ).toBeVisible();
  });
});
