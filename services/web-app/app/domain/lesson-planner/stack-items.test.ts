import { describe, expect, test } from 'bun:test';
import { buildLessonPacket } from './lesson-packet';
import { stackItemsFor } from './stack-items';

describe("stackItemsFor (Brian's run 2, A7)", () => {
  test('one row per piece, with its key, label, minutes and the chat card it came from', () => {
    const packet = buildLessonPacket({
      title: 'Day 1',
      className: null,
      sections: [
        { id: 'r1', content: '## Read aloud (20 min)\n\nRead.', keptAudience: 'teacher' },
        { id: 'm1', content: 'Write.', keptTitle: 'Class Starter: Carry', origin: 'material', kind: 'handout', keptAudience: 'student' },
      ],
    });
    const items = stackItemsFor({
      packet,
      stackDetails: { m1: { label: 'Class Starter' } },
      materialTokens: { m1: 'msg-1:dp' },
    });
    expect(items).toEqual([
      expect.objectContaining({ key: 'r:r1', origin: 'reply', minutes: 20, token: null }),
      expect.objectContaining({ key: 'm:m1', label: 'Class Starter', token: 'msg-1:dp' }),
    ]);
  });
});
