import crypto from 'node:crypto';
import type { Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server';
import { getLLMCompletion } from '~/utils/getLLMCompletion/getLLMCompletion';
import { parseFirstJsonValue } from '~/utils/llm-json.server';
import {
  AiFreeTierBudgetExceededError,
  AiRateLimitError,
  aiFreeTierBudgetExceededMessage,
  reserveAiRequest,
} from '~/utils/ai-admission.server';
import { resolveClassInsightMockMode } from '~/domain/assignment-insights/class-insight-mock-mode';
import {
  isExitTicketAssignmentType,
  parseStoredExitTicketConfig,
} from './exit-ticket';
import { loadExitTicketResponses } from './exit-ticket-class-read.server';
import type { ExitTicketResponseInput } from './exit-ticket-class-read';
import {
  EXIT_TICKET_SUMMARY_MIN_RESPONSES,
  buildExitTicketSummaryPrompt,
  exitTicketResponsesFingerprint,
  exitTicketSummaryFixture,
  exitTicketSummaryTexts,
  readExitTicketClassSummary,
  type ExitTicketClassSummary,
  type StoredExitTicketSummary,
} from './exit-ticket-class-summary';

export type { StoredExitTicketSummary };

/** The same ceilings as the class insight: a click, not a loop. */
const SUMMARY_ADMISSION_POLICY = {
  membershipLimit: 6,
  membershipWindowMs: 60_000,
  organizationLimit: 60,
  organizationWindowMs: 60 * 60_000,
};
const SUMMARY_MAX_TOKENS = 900;
const SUMMARY_TEMPERATURE = 0.3;
const SUMMARY_DEADLINE_MS = 30_000;

type SummaryRow = {
  summaryJson: unknown;
  responseCount: number;
  inputFingerprint: string;
  generatedAt: Date;
};

export function storedExitTicketSummary(
  row: SummaryRow | null,
  currentFingerprint: string
): StoredExitTicketSummary | null {
  if (!row) return null;
  const summary = readExitTicketClassSummary(row.summaryJson);
  if (!summary) return null;
  return {
    summary,
    responseCount: row.responseCount,
    generatedAt: row.generatedAt.toISOString(),
    current: row.inputFingerprint === currentFingerprint,
  };
}

type TicketRow = {
  id: string;
  classId: string;
  assignment: {
    title: string | null;
    prompt: string;
    exitTicketConfigJson: unknown;
    assignmentType: { kind: string | null };
  };
};

/** Everything the generator touches outside itself, so tests pass fakes. */
export type ExitTicketSummaryDependencies = {
  findTicket: (classAssignmentId: string) => Promise<TicketRow | null>;
  loadResponses: (
    classAssignmentId: string
  ) => Promise<ExitTicketResponseInput[]>;
  findSummary: (classAssignmentId: string) => Promise<SummaryRow | null>;
  saveSummary: (row: {
    classAssignmentId: string;
    model: string;
    responseCount: number;
    inputFingerprint: string;
    summary: ExitTicketClassSummary;
    generatedByMembershipId: string;
    generatedAt: Date;
  }) => Promise<void>;
  reserve: (input: {
    membershipId: string;
    organizationId: string;
  }) => Promise<void>;
  complete: (input: {
    system: string;
    user: string;
    organizationId: string;
    membershipId: string;
    classId: string;
    responseCount: number;
  }) => Promise<string>;
  usesFixture: () => boolean;
  isRateLimit?: (error: unknown) => boolean;
  isBudget?: (error: unknown) => boolean;
};

const MODEL = () => process.env.AI_MODEL ?? 'claude-sonnet-4-6';

export const productionExitTicketSummaryDependencies: ExitTicketSummaryDependencies =
  {
    findTicket: (classAssignmentId) =>
      prisma.classAssignment.findUnique({
        where: { id: classAssignmentId },
        select: {
          id: true,
          classId: true,
          assignment: {
            select: {
              title: true,
              prompt: true,
              exitTicketConfigJson: true,
              assignmentType: { select: { kind: true } },
            },
          },
        },
      }),
    loadResponses: loadExitTicketResponses,
    findSummary: (classAssignmentId) =>
      prisma.exitTicketClassSummary.findUnique({
        where: { classAssignmentId },
        select: {
          summaryJson: true,
          responseCount: true,
          inputFingerprint: true,
          generatedAt: true,
        },
      }),
    saveSummary: async (row) => {
      const data = {
        model: row.model,
        responseCount: row.responseCount,
        inputFingerprint: row.inputFingerprint,
        summaryJson: row.summary as unknown as Prisma.InputJsonValue,
        generatedByMembershipId: row.generatedByMembershipId,
        generatedAt: row.generatedAt,
      };
      await prisma.exitTicketClassSummary.upsert({
        where: { classAssignmentId: row.classAssignmentId },
        create: { classAssignmentId: row.classAssignmentId, ...data },
        update: data,
      });
    },
    reserve: ({ membershipId, organizationId }) =>
      reserveAiRequest({
        membershipId,
        organizationId,
        feature: 'exit-ticket-summary',
        policy: SUMMARY_ADMISSION_POLICY,
      }),
    complete: ({
      system,
      user,
      organizationId,
      membershipId,
      classId,
      responseCount,
    }) =>
      getLLMCompletion({
        model: MODEL(),
        system,
        messages: [{ role: 'user', content: user }],
        maxTokens: SUMMARY_MAX_TOKENS,
        temperature: SUMMARY_TEMPERATURE,
        allowFallbackProvider: false,
        // Student writing goes in; only metadata is logged.
        logPayload: 'metadata-only',
        signal: AbortSignal.timeout(SUMMARY_DEADLINE_MS),
        metadata: { feature: 'exit-ticket-summary', responseCount },
        attribution: {
          organizationId,
          membershipId,
          classId,
          route: 'domain/assignment-types/exit-ticket-class-summary.server',
          requestId: crypto.randomUUID(),
        },
      }),
    usesFixture: () => resolveClassInsightMockMode().usesFixture,
    isRateLimit: (error) => error instanceof AiRateLimitError,
    isBudget: (error) => error instanceof AiFreeTierBudgetExceededError,
  };

/** The stored summary for the page, current or not; null when there is none. */
export async function loadExitTicketClassSummary(
  classAssignmentId: string,
  responses: { text: string | null }[]
): Promise<StoredExitTicketSummary | null> {
  return storedExitTicketSummary(
    await productionExitTicketSummaryDependencies.findSummary(
      classAssignmentId
    ),
    exitTicketResponsesFingerprint(responses)
  );
}

export type GenerateExitTicketSummaryResult =
  | { success: true; summary: StoredExitTicketSummary }
  | {
      success: false;
      status: number;
      message: string;
      retryAfterSeconds?: number;
    };

/**
 * Summarize a class's exit tickets, or hand back the stored summary when no
 * response has arrived or changed since it was written — so a second click
 * costs nothing. The caller has already checked the teacher owns the class.
 */
export async function generateExitTicketClassSummary(
  input: {
    classAssignmentId: string;
    organizationId: string;
    membershipId: string;
  },
  deps: ExitTicketSummaryDependencies = productionExitTicketSummaryDependencies
): Promise<GenerateExitTicketSummaryResult> {
  const ticket = await deps.findTicket(input.classAssignmentId);
  if (
    !ticket ||
    !isExitTicketAssignmentType(ticket.assignment.assignmentType)
  ) {
    return { success: false, status: 404, message: 'Exit ticket not found.' };
  }

  const responses = await deps.loadResponses(ticket.id);
  const texts = exitTicketSummaryTexts(responses);
  if (texts.length < EXIT_TICKET_SUMMARY_MIN_RESPONSES) {
    return {
      success: false,
      status: 400,
      message: `A summary needs at least ${EXIT_TICKET_SUMMARY_MIN_RESPONSES} responses.`,
    };
  }
  const fingerprint = exitTicketResponsesFingerprint(responses);
  const stored = storedExitTicketSummary(
    await deps.findSummary(ticket.id),
    fingerprint
  );
  if (stored?.current) return { success: true, summary: stored };

  try {
    await deps.reserve({
      membershipId: input.membershipId,
      organizationId: input.organizationId,
    });
  } catch (error) {
    if (deps.isBudget?.(error)) {
      return {
        success: false,
        status: 402,
        message: aiFreeTierBudgetExceededMessage(),
      };
    }
    if (deps.isRateLimit?.(error)) {
      return {
        success: false,
        status: 429,
        message:
          'Too many summary requests. Please wait a minute and try again.',
        retryAfterSeconds: (error as { retryAfterSeconds?: number })
          .retryAfterSeconds,
      };
    }
    return {
      success: false,
      status: 503,
      message: 'Summaries are unavailable right now. Please try again.',
    };
  }

  let summary: ExitTicketClassSummary | null;
  let model: string;
  if (deps.usesFixture()) {
    summary = exitTicketSummaryFixture(texts);
    model = 'exit-ticket-summary-fixture';
  } else {
    const { system, user } = buildExitTicketSummaryPrompt({
      assignmentTitle: ticket.assignment.title,
      studentPrompt: ticket.assignment.prompt,
      config: parseStoredExitTicketConfig(
        ticket.assignment.exitTicketConfigJson
      ),
      texts,
      responseCount: responses.length,
    });
    try {
      const raw = await deps.complete({
        system,
        user,
        organizationId: input.organizationId,
        membershipId: input.membershipId,
        classId: ticket.classId,
        responseCount: responses.length,
      });
      summary = readExitTicketClassSummary(safeParse(raw));
    } catch {
      return {
        success: false,
        status: 503,
        message:
          'The summary could not be written right now. Please try again.',
      };
    }
    model = MODEL();
  }
  if (!summary) {
    return {
      success: false,
      status: 502,
      message: 'The summary came back unreadable. Please try again.',
    };
  }

  const generatedAt = new Date();
  await deps.saveSummary({
    classAssignmentId: ticket.id,
    model,
    responseCount: responses.length,
    inputFingerprint: fingerprint,
    summary,
    generatedByMembershipId: input.membershipId,
    generatedAt,
  });
  return {
    success: true,
    summary: {
      summary,
      responseCount: responses.length,
      generatedAt: generatedAt.toISOString(),
      current: true,
    },
  };
}

function safeParse(raw: string): unknown {
  try {
    return parseFirstJsonValue(raw);
  } catch {
    return null;
  }
}
