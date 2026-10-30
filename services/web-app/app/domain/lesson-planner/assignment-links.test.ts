import { describe, expect, test } from 'bun:test';
import { blockRef, createdFor, linksByToken, materialRef, readPieceRef } from './assignment-links';

describe("one record per assignment (Oct 24 handoff, task 1)", () => {
  test('a Create link names its block from the chat, or its piece from the stack', () => {
    expect(blockRef('msg1', 'exit-ticket')).toBe('b:msg1:exit-ticket');
    expect(materialRef('mat1')).toBe('m:mat1');
    expect(readPieceRef('b:msg1:exit-ticket')).toEqual({ kind: 'block', messageId: 'msg1', blockKey: 'exit-ticket' });
    // A block key can hold a colon of its own.
    expect(readPieceRef('b:msg1:piece:ab12')).toEqual({ kind: 'block', messageId: 'msg1', blockKey: 'piece:ab12' });
    expect(readPieceRef('m:mat1')).toEqual({ kind: 'material', materialId: 'mat1' });
    expect(readPieceRef('x:1')).toBeNull();
    expect(readPieceRef(null)).toBeNull();
    expect(readPieceRef('b:onlymessage')).toBeNull();
  });

  test('made in the chat before it was filed: the filed piece reads it', () => {
    const links = linksByToken([
      { sourceMessageId: 'msg1', blockKey: 'exit-ticket', yawpHref: '/app/assignment-types/t1', createdFrom: 'chat' },
    ]);
    expect(createdFor(links, { sourceMessageId: 'msg1', blockKey: 'exit-ticket', yawpHref: null, yawpCreatedAt: null })).toEqual({
      href: '/app/assignment-types/t1',
      from: 'chat',
    });
    expect(createdFor(links, { sourceMessageId: 'msg1', blockKey: 'other', yawpHref: null, yawpCreatedAt: null })).toBeNull();
  });

  test('a piece created before the record existed still counts', () => {
    expect(
      createdFor(new Map(), {
        sourceMessageId: 'msg1',
        blockKey: 'b',
        yawpHref: '/app/assignment-types/t2',
        yawpCreatedAt: new Date(),
      })
    ).toEqual({ href: '/app/assignment-types/t2', from: null });
  });
});
