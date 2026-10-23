/**
 * The stack chat (Kevin's note on Brian's run 3, item 7): one line in, the
 * stack changed, one line out with Undo. Both lines are kept in the lesson's
 * conversation, marked as asked on the stack page, so the planner chat shows
 * them as one compact line and the planner knows what changed.
 */
import { prisma } from '~/utils/db.server';
import { applyStackOps, type StackSnapshot } from './stack-actions.server';
import {
  checkOps,
  commandUserMessage,
  fencePiece,
  quickCommand,
  readCommandResult,
  STACK_COMMAND_SYSTEM,
  type CommandStep,
} from './stack-command';
import { plannerComplete, type PlannerAccess } from './planner-completion.server';

export const STACK_SURFACE = 'stack';

export type StackCommandOutcome = {
  reply: string;
  /** True when the stack changed; the page re-reads it. */
  applied: boolean;
  toPlanner: boolean;
  /** The reply's id, whose pieces the page can offer as cards. */
  messageId: string | null;
  undo: StackSnapshot | null;
};

export async function runStackCommand({
  request,
  access,
  conversationId,
  line,
  steps,
  contentById,
  periodMinutes,
  insertAfter = null,
}: {
  request: Request;
  access: PlannerAccess;
  conversationId: string;
  line: string;
  steps: CommandStep[];
  contentById: Record<string, string>;
  periodMinutes: number | null;
  insertAfter?: string | null;
}): Promise<StackCommandOutcome> {
  let result = quickCommand(line, steps);
  if (!result) {
    try {
      result = readCommandResult(
        await plannerComplete({
          request,
          access,
          system: STACK_COMMAND_SYSTEM,
          user: commandUserMessage({ line, steps, periodMinutes, contentById, insertAfter }),
          feature: 'lesson-planner-stack-command',
          route: 'routes/api.domain.lesson-planner.stack',
          maxTokens: 2_000,
        })
      );
    } catch {
      result = null;
    }
  }
  if (!result) {
    return {
      reply: 'I couldn’t make that change here. Try it in the planner.',
      applied: false,
      toPlanner: true,
      messageId: null,
      undo: null,
    };
  }

  const ops = result.toPlanner ? [] : checkOps(result.ops, steps, line);
  const pieces = result.toPlanner ? [] : result.pieces;
  // Everything asked for would have cut writing time: say so, change nothing.
  if (result.ops.length && !ops.length && !pieces.length && !result.toPlanner) {
    result = {
      ...result,
      reply: 'That would cut writing time, so I left it. Name the writing step to change it.',
    };
  }
  const now = Date.now();
  const [, reply] = await prisma.$transaction([
    prisma.lessonPlanMessage.create({
      data: { conversationId, role: 'user', content: line, surface: STACK_SURFACE, createdAt: new Date(now) },
      select: { id: true },
    }),
    prisma.lessonPlanMessage.create({
      data: {
        conversationId,
        role: 'assistant',
        surface: STACK_SURFACE,
        createdAt: new Date(now + 1),
        content: [result.reply, ...pieces.map(fencePiece)].join('\n\n'),
      },
      select: { id: true },
    }),
    prisma.lessonPlanConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }),
  ]);
  const undo = ops.length ? await applyStackOps(conversationId, ops) : null;
  return {
    reply: result.reply,
    applied: ops.length > 0,
    toPlanner: Boolean(result.toPlanner),
    messageId: reply.id,
    undo,
  };
}
