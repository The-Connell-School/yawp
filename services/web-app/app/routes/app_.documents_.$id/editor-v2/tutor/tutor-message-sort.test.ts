import { describe, it, expect } from 'bun:test';
import { compareTutorMessagesByTimeThenId } from './tutor-message-sort';

describe('compareTutorMessagesByTimeThenId', () => {
  it('orders same createdAt by id (user before assistant from debug session ids)', () => {
    const t = '2026-04-14T06:03:53.263Z';
    const user = { id: 'cmny7uhbt001lfp2gecx9fmql', createdAt: t };
    const assistant = { id: 'cmny7uhbt001mfp2gbu8csf1r', createdAt: t };
    const out = [assistant, user].sort(compareTutorMessagesByTimeThenId);
    expect(out[0].id).toBe(user.id);
    expect(out[1].id).toBe(assistant.id);
  });
});
