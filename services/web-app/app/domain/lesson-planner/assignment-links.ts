/**
 * One record per assignment made from a lesson piece (Oct 24 handoff, task
 * 1). An exit ticket created in the planner chat before it was in the stack
 * used to leave nothing behind, so the stack said "Not in Yawp! yet". The
 * record is keyed by the reply and block the piece came from, which exist
 * before and after filing, and the chat and the stack both read it.
 */
export type AssignmentLinkRow = {
  sourceMessageId: string;
  blockKey: string;
  yawpHref: string;
  createdFrom: string;
};

export type CreatedFrom = 'chat' | 'stack';
export type PieceCreated = { href: string; from: CreatedFrom | null };

export type PieceRef =
  | { kind: 'block'; messageId: string; blockKey: string }
  | { kind: 'material'; materialId: string };

/** A chat card's piece: its reply and block, filed or not. */
export function blockRef(messageId: string, blockKey: string): string {
  return `b:${messageId}:${blockKey}`;
}

/** A stack step's piece. */
export function materialRef(materialId: string): string {
  return `m:${materialId}`;
}

export function readPieceRef(ref: string | null | undefined): PieceRef | null {
  if (!ref) return null;
  if (ref.startsWith('m:') && ref.length > 2) return { kind: 'material', materialId: ref.slice(2) };
  if (ref.startsWith('b:')) {
    const rest = ref.slice(2);
    const split = rest.indexOf(':');
    if (split <= 0 || split === rest.length - 1) return null;
    return { kind: 'block', messageId: rest.slice(0, split), blockKey: rest.slice(split + 1) };
  }
  return null;
}

export function linksByToken(rows: AssignmentLinkRow[]): Map<string, PieceCreated> {
  return new Map(
    rows.map((row) => [
      `${row.sourceMessageId}:${row.blockKey}`,
      { href: row.yawpHref, from: row.createdFrom === 'chat' || row.createdFrom === 'stack' ? row.createdFrom : null },
    ])
  );
}

/** Whether a piece has its assignment: the record, or a piece marked before the record existed. */
export function createdFor(
  links: Map<string, PieceCreated>,
  piece: { sourceMessageId: string; blockKey: string; yawpHref: string | null; yawpCreatedAt: Date | string | null }
): PieceCreated | null {
  const linked = links.get(`${piece.sourceMessageId}:${piece.blockKey}`);
  if (linked) return linked;
  return piece.yawpCreatedAt && piece.yawpHref ? { href: piece.yawpHref, from: null } : null;
}

/** "in the planner chat" / "on the stack", under ✓ Assignment created. */
export function createdWhere(from: CreatedFrom | null): string | null {
  if (from === 'chat') return 'in the planner chat';
  if (from === 'stack') return 'on the stack';
  return null;
}
