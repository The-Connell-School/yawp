import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import type { Prisma } from '@app/prisma';
import { requireMutableRequest } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import {
  AiRateLimitError,
  reserveAiRequest,
} from '~/utils/ai-admission.server';
import { requireSeedGeneratorAccess } from '~/utils/admin-seed-generator/seed-generator-access.server';
import { loadSeedGeneratorOrganizationContext } from '~/domain/admin-seed-generator/seed-generator-context.server';
import {
  boundedSeedHistory,
  deriveSeedConversationTitle,
  validateNewGraphReferences,
} from '~/domain/admin-seed-generator/seed-generator-conversation.server';
import {
  collectCascadeLocalIds,
  seedGraphToCommitProposal,
  type PersistedSeedGeneratorNode,
} from '~/domain/admin-seed-generator/seed-generator-graph';
import {
  proposeSeedGraph,
  type SeedGeneratorError,
} from '~/domain/admin-seed-generator/seed-generator-propose.server';
import {
  fillSeedSubmissionContent,
  type SeedContentFillInput,
} from '~/domain/admin-seed-generator/seed-generator-content.server';
import { writeApprovedSeedData } from '~/domain/admin-seed-generator/seed-generator-write.server';
import {
  seedContentFillSchema,
  seedStructuralNodeSchema,
} from '~/domain/admin-seed-generator/seed-generator-schema';

const MAX_MESSAGE_CHARS = 4_000;
const MAX_PATCH_CHARS = 24_000;
const FILL_CONCURRENCY = 3;
const SEED_ADMISSION_POLICY = {
  membershipLimit: 50,
  membershipWindowMs: 60_000,
  organizationLimit: 400,
  organizationWindowMs: 60 * 60_000,
};
const ACTOR_ADMISSION_POLICY = {
  membershipLimit: SEED_ADMISSION_POLICY.membershipLimit,
  membershipWindowMs: SEED_ADMISSION_POLICY.membershipWindowMs,
  organizationLimit: Number.MAX_SAFE_INTEGER,
  organizationWindowMs: SEED_ADMISSION_POLICY.organizationWindowMs,
};
const ORGANIZATION_ADMISSION_POLICY = {
  membershipLimit: Number.MAX_SAFE_INTEGER,
  membershipWindowMs: SEED_ADMISSION_POLICY.membershipWindowMs,
  organizationLimit: SEED_ADMISSION_POLICY.organizationLimit,
  organizationWindowMs: SEED_ADMISSION_POLICY.organizationWindowMs,
};

const POST = z
  .object({
    intent: z.enum([
      'message',
      'edit-node',
      'delete-node',
      'fill-node',
      'commit-node',
    ]),
    organizationId: z.string().min(1),
    conversationId: z.string().optional(),
    message: z.string().trim().min(1).max(MAX_MESSAGE_CHARS).optional(),
    localId: z.string().min(1).max(100).optional(),
    status: z.enum(['proposed', 'approved', 'rejected']).optional(),
    dataPatch: z.string().max(MAX_PATCH_CHARS).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.intent === 'message' && !value.message) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['message'],
        message: 'Message is required.',
      });
    }
    if (value.intent !== 'message' && !value.conversationId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['conversationId'],
        message: 'Conversation is required.',
      });
    }
    if (
      (value.intent === 'edit-node' ||
        value.intent === 'delete-node' ||
        value.intent === 'fill-node') &&
      !value.localId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['localId'],
        message: 'Node is required.',
      });
    }
  });

type DbNode = {
  id?: string;
  localId: string;
  kind: string;
  parentLocalId: string | null;
  status: string;
  data: unknown;
  committedEntityId: string | null;
};

class SeedGraphConflictError extends Error {}

function graphConflictResponse() {
  return dataResponse(
    {
      error: {
        type: 'transient' as const,
        message:
          'This seed plan changed in another request. Reload the plan, then retry.',
      },
    },
    { status: 409 }
  );
}

async function claimConversation(
  transaction: Prisma.TransactionClient,
  conversation: {
    id: string;
    updatedAt: Date;
    membershipId: string;
    organizationId: string;
  }
) {
  const claimedAt = new Date(
    Math.max(Date.now(), conversation.updatedAt.getTime() + 1)
  );
  const claimed = await transaction.seedGeneratorConversation.updateMany({
    where: {
      id: conversation.id,
      membershipId: conversation.membershipId,
      organizationId: conversation.organizationId,
      updatedAt: conversation.updatedAt,
      deletedAt: null,
    },
    data: { updatedAt: claimedAt },
  });
  if (claimed.count !== 1) throw new SeedGraphConflictError();
  return claimedAt;
}

function objectData(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function persistedNode(node: DbNode): PersistedSeedGeneratorNode {
  return {
    localId: node.localId,
    kind: node.kind as PersistedSeedGeneratorNode['kind'],
    parentLocalId: node.parentLocalId,
    status: node.status as PersistedSeedGeneratorNode['status'],
    committedEntityId: node.committedEntityId,
    data: objectData(node.data),
  };
}

function publicNode(node: DbNode) {
  return { ...persistedNode(node), ...(node.id ? { id: node.id } : {}) };
}

function typedErrorResponse(error: SeedGeneratorError) {
  return dataResponse(
    { error },
    { status: error.type === 'transient' ? 503 : 422 }
  );
}

function rateLimitResponse(error: AiRateLimitError) {
  return dataResponse(
    {
      error: {
        type: 'transient' as const,
        message: 'Too many seed-generator requests. Wait a moment, then retry.',
      },
    },
    {
      status: 429,
      headers: { 'Retry-After': String(error.retryAfterSeconds) },
    }
  );
}

async function reserveSeedAi(params: {
  actorMembershipId: string;
  actorOrganizationId: string;
  targetMembershipId: string;
  targetOrganizationId: string;
  units?: number;
}) {
  const units = params.units ?? 1;
  await reserveAiRequest({
    membershipId: params.actorMembershipId,
    organizationId: params.actorOrganizationId,
    feature: 'admin-seed-generator-actor',
    policy: ACTOR_ADMISSION_POLICY,
    units,
  });
  await reserveAiRequest({
    membershipId: params.targetMembershipId,
    organizationId: params.targetOrganizationId,
    feature: 'admin-seed-generator-organization',
    policy: ORGANIZATION_ADMISSION_POLICY,
    units,
  });
}

async function scopedConversation(params: {
  conversationId: string;
  membershipId: string;
  organizationId: string;
}) {
  return prisma.seedGeneratorConversation.findFirst({
    where: {
      id: params.conversationId,
      membershipId: params.membershipId,
      organizationId: params.organizationId,
      deletedAt: null,
    },
    include: {
      messages: {
        orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
        take: 20,
      },
      nodes: {
        orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
      },
    },
  });
}

function contentInputFor(
  nodes: PersistedSeedGeneratorNode[],
  submission: PersistedSeedGeneratorNode,
  organizationId: string,
  organizationName: string
): SeedContentFillInput | null {
  const byId = new Map(nodes.map((node) => [node.localId, node]));
  const document = submission.parentLocalId
    ? byId.get(submission.parentLocalId)
    : null;
  const assignment = document?.parentLocalId
    ? byId.get(document.parentLocalId)
    : null;
  const studentLocalId =
    document?.kind === 'document' &&
    typeof document.data.studentLocalId === 'string'
      ? document.data.studentLocalId
      : null;
  const student = studentLocalId ? byId.get(studentLocalId) : null;
  const workflowStatus = submission.data.status;
  const writingProfile = student?.data.writingProfile;
  if (
    document?.kind !== 'document' ||
    assignment?.kind !== 'assignment' ||
    student?.kind !== 'student' ||
    typeof assignment.data.title !== 'string' ||
    typeof assignment.data.prompt !== 'string' ||
    typeof student.data.name !== 'string' ||
    (writingProfile !== 'struggling' &&
      writingProfile !== 'on_track' &&
      writingProfile !== 'advanced') ||
    (workflowStatus !== 'draft' &&
      workflowStatus !== 'submitted' &&
      workflowStatus !== 'graded')
  ) {
    return null;
  }
  return {
    organizationId,
    organizationName,
    assignment: {
      title: assignment.data.title,
      prompt: assignment.data.prompt,
    },
    student: { name: student.data.name, writingProfile },
    submission: { localId: submission.localId, status: workflowStatus },
  };
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const runners = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await worker(items[index]!, index);
      }
    }
  );
  await Promise.all(runners);
  return results;
}

function parsePatch(raw: string | undefined) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function validEditedData(
  node: PersistedSeedGeneratorNode,
  data: Record<string, unknown>
) {
  if (node.kind === 'submission') {
    if (
      Object.keys(data).some(
        (key) => key !== 'status' && key !== 'essayText' && key !== 'grade'
      )
    ) {
      return false;
    }
    const status = data.status;
    if (status !== 'draft' && status !== 'submitted' && status !== 'graded') {
      return false;
    }
    if (data.essayText == null && data.grade == null) return true;
    if (
      typeof data.essayText === 'string' &&
      data.essayText.trim().length > 0 &&
      data.grade == null
    ) {
      return true;
    }
    return seedContentFillSchema.safeParse(data).success;
  }
  return seedStructuralNodeSchema.safeParse({
    localId: node.localId,
    kind: node.kind,
    parentLocalId: node.parentLocalId,
    data,
  }).success;
}

function submissionNeedsFill(node: PersistedSeedGeneratorNode) {
  if (node.kind !== 'submission') return false;
  const essayMissing =
    typeof node.data.essayText !== 'string' ||
    node.data.essayText.trim().length === 0;
  return essayMissing || (node.data.status === 'graded' && !node.data.grade);
}

async function latestNodes(conversationId: string) {
  const nodes = await prisma.seedGeneratorNode.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return nodes.map(publicNode);
}

export async function action({ request }: ActionFunctionArgs) {
  await requireMutableRequest(request);
  const formData = await request.formData();
  const parsed = POST.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return dataResponse(
      {
        error: {
          type: 'unparseable',
          message: 'Invalid seed-generator request.',
        },
      },
      { status: 400 }
    );
  }
  const data = parsed.data;
  const access = await requireSeedGeneratorAccess(request);
  const membershipId = access.membership.id;
  const ctx = await loadSeedGeneratorOrganizationContext(data.organizationId);

  if (data.intent === 'message') {
    const conversation = data.conversationId
      ? await scopedConversation({
          conversationId: data.conversationId,
          membershipId,
          organizationId: data.organizationId,
        })
      : null;
    if (data.conversationId && !conversation) {
      return dataResponse(
        { error: { type: 'unparseable', message: 'Conversation not found.' } },
        { status: 404 }
      );
    }
    try {
      await reserveSeedAi({
        actorMembershipId: membershipId,
        actorOrganizationId: access.membership.organization.id,
        targetMembershipId: ctx.admissionMembershipId,
        targetOrganizationId: data.organizationId,
      });
    } catch (error) {
      if (error instanceof AiRateLimitError) return rateLimitResponse(error);
      return typedErrorResponse({
        type: 'transient',
        message:
          'The seed generator is temporarily unavailable. Retry this request.',
      });
    }
    const currentNodes = (conversation?.nodes ?? []).map(persistedNode);
    const result = await proposeSeedGraph({
      ctx,
      instructions: data.message!,
      history: boundedSeedHistory(
        [...(conversation?.messages ?? [])].reverse()
      ).map((message) => ({
        role: message.role as 'user' | 'assistant',
        content: message.content,
      })),
      currentNodes,
    });
    if ('type' in result) return typedErrorResponse(result);
    const references = validateNewGraphReferences(
      result.graph,
      currentNodes,
      new Set(ctx.existingClasses.map((klass) => klass.id))
    );
    if (!references.valid) {
      return typedErrorResponse({
        type: 'unparseable',
        message: `The proposed graph had invalid relationships. Rephrase the request with clearer class, assignment, and student relationships.`,
      });
    }

    const askedAt = new Date();
    const answeredAt = new Date(askedAt.getTime() + 1);
    let persisted;
    try {
      persisted = await prisma.$transaction(async (transaction) => {
        const claimedAt = conversation
          ? await claimConversation(transaction, conversation)
          : answeredAt;
        const thread =
          conversation ??
          (await transaction.seedGeneratorConversation.create({
            data: {
              membershipId,
              organizationId: data.organizationId,
              title: deriveSeedConversationTitle(data.message!),
            },
          }));
        await transaction.seedGeneratorMessage.createMany({
          data: [
            {
              conversationId: thread.id,
              role: 'user',
              content: data.message!,
              createdAt: askedAt,
            },
            {
              conversationId: thread.id,
              role: 'assistant',
              content: result.reply,
              toolCalls: {
                name: 'propose_seed_graph',
                nodeLocalIds: result.graph.nodes.map((node) => node.localId),
              },
              createdAt: answeredAt,
            },
          ],
        });
        const createdNodes = [];
        for (const node of result.graph.nodes) {
          createdNodes.push(
            await transaction.seedGeneratorNode.create({
              data: {
                conversationId: thread.id,
                localId: node.localId,
                kind: node.kind,
                parentLocalId: node.parentLocalId,
                status: 'proposed',
                data: node.data as Prisma.InputJsonValue,
              },
            })
          );
        }
        await transaction.seedGeneratorConversation.update({
          where: { id: thread.id },
          data: {
            updatedAt: new Date(
              Math.max(answeredAt.getTime(), claimedAt.getTime())
            ),
          },
        });
        return { thread, createdNodes };
      });
    } catch (error) {
      if (error instanceof SeedGraphConflictError)
        return graphConflictResponse();
      throw error;
    }
    return dataResponse({
      conversationId: persisted.thread.id,
      reply: result.reply,
      nodes: persisted.createdNodes.map(publicNode),
      isNewConversation: !conversation,
    });
  }

  const conversation = await scopedConversation({
    conversationId: data.conversationId!,
    membershipId,
    organizationId: data.organizationId,
  });
  if (!conversation) {
    return dataResponse(
      { error: { type: 'unparseable', message: 'Conversation not found.' } },
      { status: 404 }
    );
  }
  const nodes = conversation.nodes.map(persistedNode);
  const node = data.localId
    ? nodes.find((candidate) => candidate.localId === data.localId)
    : null;

  if (data.intent === 'delete-node') {
    if (!node) {
      return dataResponse(
        { error: { type: 'unparseable', message: 'Node not found.' } },
        { status: 404 }
      );
    }
    if (node.status === 'committed') {
      return dataResponse(
        {
          error: {
            type: 'unparseable',
            message: 'Committed nodes cannot be rejected.',
          },
        },
        { status: 409 }
      );
    }
    const localIds = [...collectCascadeLocalIds(nodes, node.localId)];
    try {
      await prisma.$transaction(async (transaction) => {
        await claimConversation(transaction, conversation);
        await transaction.seedGeneratorNode.updateMany({
          where: {
            conversationId: conversation.id,
            localId: { in: localIds },
            status: { not: 'committed' },
          },
          data: { status: 'rejected' },
        });
      });
    } catch (error) {
      if (error instanceof SeedGraphConflictError)
        return graphConflictResponse();
      throw error;
    }
    return dataResponse({
      nodes: await latestNodes(conversation.id),
      cascadedLocalIds: localIds,
    });
  }

  if (data.intent === 'edit-node') {
    if (!node) {
      return dataResponse(
        { error: { type: 'unparseable', message: 'Node not found.' } },
        { status: 404 }
      );
    }
    if (node.status === 'committed') {
      return dataResponse(
        {
          error: {
            type: 'unparseable',
            message: 'Committed nodes cannot be edited.',
          },
        },
        { status: 409 }
      );
    }
    const patch = parsePatch(data.dataPatch);
    if (patch == null) {
      return dataResponse(
        {
          error: {
            type: 'unparseable',
            message: 'The node edit was malformed.',
          },
        },
        { status: 400 }
      );
    }
    const merged = { ...node.data, ...patch };
    if (
      node.kind === 'submission' &&
      typeof patch.status === 'string' &&
      patch.status !== 'graded'
    ) {
      delete merged.grade;
    }
    if (!validEditedData(node, merged)) {
      return dataResponse(
        {
          error: { type: 'unparseable', message: 'The node edit is invalid.' },
        },
        { status: 400 }
      );
    }
    try {
      await prisma.$transaction(async (transaction) => {
        await claimConversation(transaction, conversation);
        if (data.status === 'rejected') {
          const localIds = [...collectCascadeLocalIds(nodes, node.localId)];
          await transaction.seedGeneratorNode.updateMany({
            where: {
              conversationId: conversation.id,
              localId: { in: localIds },
              status: { not: 'committed' },
            },
            data: { status: 'rejected' },
          });
          await transaction.seedGeneratorNode.update({
            where: {
              conversationId_localId: {
                conversationId: conversation.id,
                localId: node.localId,
              },
            },
            data: { data: merged as Prisma.InputJsonValue },
          });
        } else {
          await transaction.seedGeneratorNode.update({
            where: {
              conversationId_localId: {
                conversationId: conversation.id,
                localId: node.localId,
              },
            },
            data: {
              data: merged as Prisma.InputJsonValue,
              ...(data.status ? { status: data.status } : {}),
            },
          });
        }
      });
    } catch (error) {
      if (error instanceof SeedGraphConflictError)
        return graphConflictResponse();
      throw error;
    }
    return dataResponse({ nodes: await latestNodes(conversation.id) });
  }

  if (data.intent === 'fill-node') {
    if (!node || node.kind !== 'submission') {
      return dataResponse(
        {
          error: { type: 'unparseable', message: 'Submission node not found.' },
        },
        { status: 404 }
      );
    }
    if (!submissionNeedsFill(node)) {
      return dataResponse({ nodes: conversation.nodes.map(publicNode) });
    }
    const fillInput = contentInputFor(
      nodes,
      node,
      data.organizationId,
      ctx.organizationName
    );
    if (!fillInput) {
      return typedErrorResponse({
        type: 'unparseable',
        message:
          'This submission has incomplete graph relationships. Rephrase the request.',
      });
    }
    try {
      await reserveSeedAi({
        actorMembershipId: membershipId,
        actorOrganizationId: access.membership.organization.id,
        targetMembershipId: ctx.admissionMembershipId,
        targetOrganizationId: data.organizationId,
      });
    } catch (error) {
      if (error instanceof AiRateLimitError) return rateLimitResponse(error);
      return typedErrorResponse({
        type: 'transient',
        message:
          'Content generation is temporarily unavailable. Retry in a moment.',
      });
    }
    const fill = await fillSeedSubmissionContent(fillInput);
    if ('type' in fill) return typedErrorResponse(fill);
    try {
      await prisma.$transaction(async (transaction) => {
        await claimConversation(transaction, conversation);
        await transaction.seedGeneratorNode.update({
          where: {
            conversationId_localId: {
              conversationId: conversation.id,
              localId: node.localId,
            },
          },
          data: {
            data: { ...node.data, ...fill.content } as Prisma.InputJsonValue,
          },
        });
      });
    } catch (error) {
      if (error instanceof SeedGraphConflictError)
        return graphConflictResponse();
      throw error;
    }
    return dataResponse({ nodes: await latestNodes(conversation.id) });
  }

  const approvedSubmissions = nodes.filter((candidate) => {
    if (candidate.kind !== 'submission' || candidate.status !== 'approved')
      return false;
    const document = nodes.find(
      (item) => item.localId === candidate.parentLocalId
    );
    const assignment = nodes.find(
      (item) => item.localId === document?.parentLocalId
    );
    const student = nodes.find(
      (item) =>
        item.localId ===
        (document?.kind === 'document' ? document.data.studentLocalId : null)
    );
    return [document, assignment, student].every(
      (item) =>
        item && (item.status === 'approved' || item.status === 'committed')
    );
  });
  const missingContent = approvedSubmissions.filter(submissionNeedsFill);
  if (missingContent.length > 0) {
    try {
      await reserveSeedAi({
        actorMembershipId: membershipId,
        actorOrganizationId: access.membership.organization.id,
        targetMembershipId: ctx.admissionMembershipId,
        targetOrganizationId: data.organizationId,
        units: missingContent.length,
      });
    } catch (error) {
      if (error instanceof AiRateLimitError) return rateLimitResponse(error);
      return typedErrorResponse({
        type: 'transient',
        message:
          'Content generation is temporarily unavailable. Retry in a moment.',
      });
    }
  }
  const fills = await mapWithConcurrency(
    missingContent,
    FILL_CONCURRENCY,
    async (submission) => {
      const fillInput = contentInputFor(
        nodes,
        submission,
        data.organizationId,
        ctx.organizationName
      );
      return fillInput
        ? fillSeedSubmissionContent(fillInput)
        : ({
            type: 'unparseable',
            message:
              'A submission has incomplete graph relationships. Rephrase the request.',
          } satisfies SeedGeneratorError);
    }
  );
  const failedFill = fills.find((fill) => 'type' in fill);
  if (failedFill && 'type' in failedFill) return typedErrorResponse(failedFill);
  const fillByLocalId = new Map(
    missingContent.map((submission, index) => [
      submission.localId,
      (fills[index] as { content: Record<string, unknown> }).content,
    ])
  );
  const filledNodes = nodes.map((candidate) => ({
    ...candidate,
    data: {
      ...candidate.data,
      ...(fillByLocalId.get(candidate.localId) ?? {}),
    },
  }));

  const committedClassIds = filledNodes
    .filter((item) => item.kind === 'class' && item.committedEntityId)
    .map((item) => item.committedEntityId!);
  const committedAssignmentIds = filledNodes
    .filter((item) => item.kind === 'assignment' && item.committedEntityId)
    .map((item) => item.committedEntityId!);
  const committedStudentIds = filledNodes
    .filter((item) => item.kind === 'student' && item.committedEntityId)
    .map((item) => item.committedEntityId!);
  const [validClasses, validAssignments, validStudents] = await Promise.all([
    committedClassIds.length
      ? prisma.class.findMany({
          where: {
            id: { in: committedClassIds },
            school: { organizationId: data.organizationId },
          },
          select: { id: true },
        })
      : [],
    committedAssignmentIds.length
      ? prisma.assignment.findMany({
          where: {
            id: { in: committedAssignmentIds },
            classAssignments: {
              some: {
                class: { school: { organizationId: data.organizationId } },
              },
            },
          },
          select: { id: true },
        })
      : [],
    committedStudentIds.length
      ? prisma.orgMembership.findMany({
          where: {
            id: { in: committedStudentIds },
            organizationId: data.organizationId,
            role: 'STUDENT',
          },
          select: { id: true },
        })
      : [],
  ]);
  let proposal;
  try {
    proposal = seedGraphToCommitProposal(filledNodes);
  } catch {
    return typedErrorResponse({
      type: 'unparseable',
      message:
        'The approved graph is incomplete. Rephrase the request or edit the affected nodes.',
    });
  }
  const writeContext = {
    organizationId: data.organizationId,
    organizationName: ctx.organizationName,
    existingClassIds: new Set([
      ...ctx.existingClasses.map((klass) => klass.id),
      ...validClasses.map((item) => item.id),
    ]),
    existingAssignmentIds: new Set(validAssignments.map((item) => item.id)),
    existingStudentMembershipIds: new Set(validStudents.map((item) => item.id)),
    assignmentTypeIdByTitle: new Map(
      ctx.existingAssignmentTypes.map((type) => [type.title, type.id])
    ),
  };

  try {
    const summary = await prisma.$transaction(
      async (transaction) => {
        await claimConversation(transaction, conversation);
        for (const [localId, content] of fillByLocalId) {
          const filled = filledNodes.find((item) => item.localId === localId)!;
          await transaction.seedGeneratorNode.update({
            where: {
              conversationId_localId: {
                conversationId: conversation.id,
                localId,
              },
            },
            data: {
              data: { ...filled.data, ...content } as Prisma.InputJsonValue,
            },
          });
        }
        const result = await writeApprovedSeedData(
          transaction,
          proposal,
          writeContext
        );
        for (const committed of result.committedNodes) {
          await transaction.seedGeneratorNode.update({
            where: {
              conversationId_localId: {
                conversationId: conversation.id,
                localId: committed.localId,
              },
            },
            data: {
              status: 'committed',
              committedEntityId: committed.entityId,
            },
          });
        }
        const committedDocumentIds = new Set(
          result.committedNodes
            .filter((item) => item.kind === 'document')
            .map((item) => item.localId)
        );
        for (const submission of filledNodes.filter(
          (item) =>
            item.kind === 'submission' &&
            item.status === 'approved' &&
            item.data.status === 'draft' &&
            item.parentLocalId &&
            committedDocumentIds.has(item.parentLocalId)
        )) {
          await transaction.seedGeneratorNode.update({
            where: {
              conversationId_localId: {
                conversationId: conversation.id,
                localId: submission.localId,
              },
            },
            data: { status: 'committed' },
          });
        }
        return result;
      },
      { maxWait: 10_000, timeout: 120_000 }
    );
    return dataResponse({ summary, nodes: await latestNodes(conversation.id) });
  } catch (error) {
    if (error instanceof SeedGraphConflictError) return graphConflictResponse();
    return dataResponse(
      {
        error: {
          type: 'transient',
          message:
            'The approved seed graph could not be committed. Retry in a moment.',
        },
      },
      { status: 500 }
    );
  }
}
