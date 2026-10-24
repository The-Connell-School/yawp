import { describe, expect, test } from 'bun:test';
import { inflateRawSync } from 'node:zlib';
import { renderHandoutDocx } from './handout-docx.server';

/** The text of word/document.xml, tags dropped. */
function documentText(bytes: Uint8Array): string {
  const buffer = Buffer.from(bytes);
  const end = buffer.lastIndexOf('PK\x05\x06', buffer.length, 'latin1');
  const count = buffer.readUInt16LE(end + 10);
  let cursor = buffer.readUInt32LE(end + 16);
  for (let index = 0; index < count; index += 1) {
    const method = buffer.readUInt16LE(cursor + 10);
    const size = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const local = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    if (name === 'word/document.xml') {
      const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
      const raw = buffer.subarray(start, start + size);
      return (method === 8 ? inflateRawSync(raw) : raw).toString('utf8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return '';
}

describe("student handouts as Word (Oct 24 handoff, task 4)", () => {
  test('each step for students, numbered, with a name line', async () => {
    const docx = await renderHandoutDocx({
      title: 'Day One',
      className: 'English 11 · Period 5',
      parts: [
        { id: 'a', title: 'Class starter', content: 'Write about **one thing** you carry.', lines: 4 },
        { id: 'b', title: 'Exit ticket', content: '- Name one object\n- Say why it matters', lines: 2 },
      ],
    });
    const value = documentText(docx);
    expect(value).toContain('Day One');
    expect(value).toContain('Name: ');
    expect(value).toContain('1. Class starter');
    expect(value).toContain('one thing');
    expect(value).not.toContain('**');
    expect(value).toContain('2. Exit ticket');
    expect(value).toContain('Say why it matters');
  });
});
