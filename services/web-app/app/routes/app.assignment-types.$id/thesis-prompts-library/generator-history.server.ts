// Saved history for the Thesis-Driven Essay prompt generator.
//
// A teacher works with the generator in short bursts — describe an essay, page
// through three drafts, come back tomorrow and want the good one again. Until
// now the chat lived only in component state and was wiped on every open, so
// there was nowhere to see what you had already made. This module persists each
// exchange against the teacher's membership and reads it back for the history
// list in the generator sheet.
//
// Two rules shape everything here:
//
//   1. History is additive. A write failing, or the flag being off, must never
//      break the generator itself — every function degrades to "no history"
//      rather than throwing into the request path.
//   2. Reads are always scoped by membership. A teacher must never be able to
//      load another teacher's conversation by guessing an id.

import { prisma } from '~/utils/db.server';
import {
  GeneratedPromptSchema,
  type GeneratedPrompt,
  type GeneratorMessage,
} from './prompt-generator';

/** How many past conversations the history list shows. */
export const MAX_HISTORY_CONVERSATIONS = 20;

/** Longest derived conversation title, in characters. */
export const MAX_CONVERSATION_TITLE_LENGTH = 80;

const FALLBACK_TITLE = 'Untitled';

/**
 * Saved history rolls out behind a flag, per AGENTS.md: the generator works
 * exactly as before while this is off, and turns on only where we've enabled it.
 * The FeatureFlag table was dropped, so this follows the env-var convention
 * getLLMCompletion already uses for its provider fallback.
 */
export function isGeneratorHistoryEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.THESIS_PROMPT_GENERATOR_HISTORY_ENABLED === 'true';
}

/**
 * Name a conversation after the teacher's opening ask, which is what they'll
 * recognize in a list ("a prompt about ambition for 10th graders…"). Pure so
 * the trimming rules are unit-tested.
 */
export function deriveConversationTitle(firstTeacherMessage: string): string {
  const collapsed = firstTeacherMessage.replace(/\s+/g, ' ').trim();
  if (collapsed.length === 0) return FALLBACK_TITLE;
  if (collapsed.length <= MAX_CONVERSATION_TITLE_LENGTH) return collapsed;

  const cutoff = collapsed.slice(0, MAX_CONVERSATION_TITLE_LENGTH);
  const lastSpace = cutoff.lastIndexOf(' ');
  // Prefer a word boundary so the title doesn't end mid-word.
  const trimmed = lastSpace > 40 ? cutoff.slice(0, lastSpace) : cutoff;
  return `${trimmed.trimEnd()}…`;
}

type ConversationListRow = {
  id: string;
  title: string;
  updatedAt: Date;
  _count: { turns: number };
};

type StoredTurnRow = { role: string; content: string; options: unknown };

type ConversationDetailRow = {
  id: string;
  title: string;
  updatedAt: Date;
  turns: StoredTurnRow[];
};

/**
 * The slice of the Prisma client this module needs. Declaring it explicitly
 * gives each function an injection seam, so the tests below pass a double
 * instead of reaching for `mock.module` — Bun's module mocks are a global
 * registry keyed by file path, so a mock registered by a route test would
 * otherwise replace this module for every other test in the run.
 */
export type GeneratorHistoryClient = {
  thesisPromptGeneratorConversation: {
    findMany(args: unknown): Promise<ConversationListRow[]>;
    findFirst(args: unknown): Promise<{ id: string } | ConversationDetailRow | null>;
    create(args: unknown): Promise<{ id: string }>;
    update(args: unknown): Promise<unknown>;
  };
  thesisPromptGeneratorTurn: {
    createMany(args: unknown): Promise<unknown>;
  };
};

const defaultClient = prisma as unknown as GeneratorHistoryClient;

export type SavedGeneratorTurn = GeneratorMessage & {
  options: GeneratedPrompt[];
};

export type SavedConversationSummary = {
  id: string;
  title: string;
  /** ISO timestamp, safe to hand to the client. */
  updatedAt: string;
  turnCount: number;
};

export type SavedConversation = {
  id: string;
  title: string;
  updatedAt: string;
  turns: SavedGeneratorTurn[];
};

/** Options come back as loose JSON, so validate before trusting them. */
function parseStoredOptions(value: unknown): GeneratedPrompt[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const parsed = GeneratedPromptSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

function parseStoredRole(value: string): 'user' | 'assistant' | null {
  return value === 'user' || value === 'assistant' ? value : null;
}

/** The teacher's recent conversations, newest first. */
export async function listConversations(
  membershipId: string,
  client: GeneratorHistoryClient = defaultClient
): Promise<SavedConversationSummary[]> {
  if (!isGeneratorHistoryEnabled()) return [];

  try {
    const rows = await client.thesisPromptGeneratorConversation.findMany({
      where: { membershipId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: MAX_HISTORY_CONVERSATIONS,
      select: {
        id: true,
        title: true,
        updatedAt: true,
        _count: { select: { turns: true } },
      },
    });

    return rows.map((row: ConversationListRow) => ({
      id: row.id,
      title: row.title,
      updatedAt: row.updatedAt.toISOString(),
      turnCount: row._count.turns,
    }));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to list prompt generator conversations:', err);
    return [];
  }
}

/**
 * Load one conversation for replay in the sheet. Scoped by membership, so
 * another teacher's id simply reads as missing.
 */
export async function loadConversation(
  conversationId: string,
  membershipId: string,
  client: GeneratorHistoryClient = defaultClient
): Promise<SavedConversation | null> {
  if (!isGeneratorHistoryEnabled()) return null;

  try {
    const row = (await client.thesisPromptGeneratorConversation.findFirst({
      where: { id: conversationId, membershipId, deletedAt: null },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        turns: {
          orderBy: { createdAt: 'asc' },
          select: { role: true, content: true, options: true },
        },
      },
    })) as ConversationDetailRow | null;
    if (!row) return null;

    return {
      id: row.id,
      title: row.title,
      updatedAt: row.updatedAt.toISOString(),
      turns: row.turns.flatMap((turn: StoredTurnRow) => {
        const role = parseStoredRole(turn.role);
        if (!role) return [];
        return [
          { role, content: turn.content, options: parseStoredOptions(turn.options) },
        ];
      }),
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to load prompt generator conversation:', err);
    return null;
  }
}

/**
 * Persist one teacher message and the generator's answer, creating the
 * conversation on the first exchange. Returns the conversation id so the client
 * can keep appending to the same thread, or null when history is unavailable —
 * callers treat that as "not saved", never as an error.
 */
export async function recordExchange({
  conversationId,
  membershipId,
  teacherMessage,
  reply,
  options,
  client = defaultClient,
}: {
  conversationId?: string | null;
  membershipId: string;
  teacherMessage: string;
  reply: string;
  options: GeneratedPrompt[];
  client?: GeneratorHistoryClient;
}): Promise<string | null> {
  if (!isGeneratorHistoryEnabled()) return null;

  try {
    // An unknown or someone else's id starts a fresh conversation rather than
    // failing the turn or writing into a thread the teacher doesn't own.
    const existing = conversationId
      ? await client.thesisPromptGeneratorConversation.findFirst({
          where: { id: conversationId, membershipId, deletedAt: null },
          select: { id: true },
        })
      : null;

    const conversation =
      existing ??
      (await client.thesisPromptGeneratorConversation.create({
        data: {
          membershipId,
          title: deriveConversationTitle(teacherMessage),
        },
        select: { id: true },
      }));

    await client.thesisPromptGeneratorTurn.createMany({
      data: [
        {
          conversationId: conversation.id,
          role: 'user',
          content: teacherMessage,
        },
        {
          conversationId: conversation.id,
          role: 'assistant',
          content: reply,
          options: options.length > 0 ? options : undefined,
        },
      ],
    });

    await client.thesisPromptGeneratorConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    return conversation.id;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to save prompt generator conversation:', err);
    return null;
  }
}
