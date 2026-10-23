/**
 * The stack as a list of rows (Brian's run 2, A1, A7): what the stack page's
 * list and the panel beside the chat both show.
 */
import type { LessonPacket, PacketSectionKind } from './lesson-packet';
import { stackEntryKey } from './stack-order';

export type StackItem = {
  /** "m:<materialId>" or "r:<messageId>", as the reorder intent takes it. */
  key: string;
  id: string;
  origin: 'reply' | 'material';
  title: string;
  kind: PacketSectionKind;
  /** What the badge says, e.g. "Class Starter"; falls back to the kind. */
  label?: string;
  minutes: number | null;
  /** "<messageId>:<blockKey>", the chat card this piece came from; null for a kept reply. */
  token?: string | null;
};

export function stackItemsFor({
  packet,
  stackDetails = {},
  materialTokens = {},
}: {
  packet: Pick<LessonPacket, 'sections' | 'outline'>;
  stackDetails?: Record<string, { label: string }>;
  materialTokens?: Record<string, string>;
}): StackItem[] {
  const minutesByAnchor = new Map(packet.outline.map((entry) => [entry.anchor, entry.minutes]));
  return packet.sections.map((section) => ({
    key: stackEntryKey(section),
    id: section.id,
    origin: section.origin,
    title: section.title,
    kind: section.kind,
    label: stackDetails[section.id]?.label,
    minutes: minutesByAnchor.get(section.anchor) ?? null,
    token: section.origin === 'material' ? (materialTokens[section.id] ?? null) : null,
  }));
}
