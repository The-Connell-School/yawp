/**
 * "From your conversation" (stack page redesign, Add a piece): what the
 * planner suggested in this lesson's chat that is not in the stack yet.
 *
 * Read from the conversation itself rather than stored beside it, so it is
 * always exactly what the chat offered and never out of step with it.
 */
import { fileableMaterial } from './fileable-material';
import { DECK_SLOT } from './lesson-material';
import { pieceKeysInReply } from './reply-pieces';
import { shortTitle } from './short-title';
import { isWritingStep, stepTypeFor, type StepType } from './step-types';

export type SuggestedPiece = {
  /** "<messageId>:<key>", the same token the chat cards use. */
  token: string;
  messageId: string;
  key: string;
  title: string;
  type: StepType;
  minutes: number | null;
  isWriting: boolean;
  /** One line on what it is. */
  line: string;
};

const MINUTES_IN_TITLE = /\s*\(\s*\d+[^)]*min[^)]*\)\s*$/i;

function firstSentence(text: string): string {
  const plain = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/[*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const sentence = /^.*?[.!?](?=\s|$)/.exec(plain)?.[0] ?? plain;
  return sentence.length > 140 ? `${shortTitle(sentence, 120)}…` : sentence;
}

export function suggestedPieces({
  messages,
  inStack,
  stackSlots,
}: {
  /** The lesson's assistant replies, oldest first. */
  messages: Array<{ id: string; content: string }>;
  /** "<messageId>:<key>" for every piece already filed. */
  inStack: ReadonlySet<string>;
  /** Slots already filed: a revision of one of them is not a new piece. */
  stackSlots: ReadonlySet<string>;
}): SuggestedPiece[] {
  const pieces: SuggestedPiece[] = [];
  for (const message of [...messages].reverse()) {
    for (const key of pieceKeysInReply(message.content)) {
      if (key === DECK_SLOT) continue;
      const token = `${message.id}:${key}`;
      if (inStack.has(token)) continue;
      const material = fileableMaterial(message.content, key);
      if (!material || stackSlots.has(material.slot)) continue;
      const type = stepTypeFor({ kind: material.kind, title: material.title, stored: material.stepType });
      pieces.push({
        token,
        messageId: message.id,
        key,
        title: material.title.replace(MINUTES_IN_TITLE, '').trim(),
        type,
        minutes: material.minutes ?? null,
        isWriting: isWritingStep({ kind: material.kind, stepType: type }),
        line: firstSentence(material.content),
      });
    }
  }
  return pieces;
}
