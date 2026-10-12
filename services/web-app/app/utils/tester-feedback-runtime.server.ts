import type { Prisma } from '@app/prisma';
import { prisma } from './db.server';
import { getUserId } from './auth.server';
import { authenticateInternalManagementRequest } from './internal-platform-auth.server';
import type {
  FeedbackDependencies,
  FeedbackInput,
} from './tester-feedback.server';

export const testerFeedbackEnabled = () =>
  process.env.TESTER_FEEDBACK_ENABLED === 'true';

export const testerFeedbackDependencies: FeedbackDependencies = {
  enabled: testerFeedbackEnabled,
  environment: () =>
    (
      process.env.PREVIEW_SLUG ||
      process.env.YAWP_ENVIRONMENT ||
      process.env.NODE_ENV ||
      'development'
    ).slice(0, 100),
  getUser: async (request) => {
    const id = await getUserId(request);
    return id
      ? prisma.user.findUnique({
          where: { id },
          select: { id: true, isTester: true, isAdmin: true },
        })
      : null;
  },
  authenticateInternal: (request) =>
    authenticateInternalManagementRequest(request),
  save: saveTesterFeedback,
  list: (input) =>
    prisma.testerFeedback.findMany({
      where: {
        ...(input.environment ? { environment: input.environment } : {}),
        ...(input.userId ? { userId: input.userId } : {}),
        ...(input.severity ? { severity: input.severity } : {}),
        ...(input.since || input.until
          ? {
              createdAt: {
                ...(input.since ? { gte: new Date(input.since) } : {}),
                ...(input.until ? { lte: new Date(input.until) } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      take: input.limit,
    }),
};

export type FeedbackWriteTransaction = Pick<
  Prisma.TransactionClient,
  '$executeRaw' | 'testerFeedback'
>;
type FeedbackWriteRunner = (
  operation: (tx: FeedbackWriteTransaction) => Promise<boolean>
) => Promise<boolean>;

export function saveTesterFeedback(
  input: FeedbackInput,
  run: FeedbackWriteRunner = (operation) => prisma.$transaction(operation)
) {
  return run(async (tx) => {
    // Serialize per-user writes across app instances; five submissions per ten minutes.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('tester_feedback:' || ${input.userId}))`;
    const count = await tx.testerFeedback.count({
      where: {
        userId: input.userId,
        createdAt: { gte: new Date(Date.now() - 600_000) },
      },
    });
    if (count >= 5) return false;
    await tx.testerFeedback.create({ data: input });
    return true;
  });
}
