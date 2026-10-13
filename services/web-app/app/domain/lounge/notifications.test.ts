import { describe, expect, test } from 'bun:test';
import { buildLoungeEmail, staffNotifyEmails } from './notifications';

const origin = 'https://yawp.school';

describe('buildLoungeEmail', () => {
  test('a staff reply tells the asker Brian answered, with a link to the thread', () => {
    const email = buildLoungeEmail(
      {
        kind: 'reply',
        toUserId: 'u1',
        postId: 'p1',
        postTitle: 'Pacing Daily Pages',
        actorName: 'Brian Connell',
        actorIsStaff: true,
        excerpt: 'Twelve minutes.',
      },
      origin
    );
    expect(email.subject).toBe('Brian Connell answered "Pacing Daily Pages"');
    expect(email.text).toContain('https://yawp.school/app/lounge/p1');
    expect(email.text).toContain('Twelve minutes.');
  });

  test('a teacher reply and a mention read differently', () => {
    const base = { toUserId: 'u1', postId: 'p1', postTitle: 'Checklist', actorName: 'Devin', actorIsStaff: false, excerpt: 'Nice' };
    expect(buildLoungeEmail({ kind: 'reply', ...base }, origin).subject).toBe('Devin replied to "Checklist"');
    expect(buildLoungeEmail({ kind: 'mention', ...base }, origin).subject).toBe('Devin mentioned you in "Checklist"');
  });

  test('a staff request points the team at the inbox and says when it is private', () => {
    const email = buildLoungeEmail(
      { kind: 'staff-request', postId: 'p9', postTitle: 'Rubric', actorName: 'Maria S.', excerpt: 'Help', isPrivate: true },
      origin
    );
    expect(email.subject).toBe('Private question for the Yawp team: "Rubric"');
    expect(email.text).toContain('https://yawp.school/app/admin/lounge?post=p9');
  });

  test('escapes HTML in titles and bodies', () => {
    const email = buildLoungeEmail(
      { kind: 'mention', toUserId: 'u1', postId: 'p1', postTitle: '<b>x</b>', actorName: 'A & B', actorIsStaff: false, excerpt: '<script>' },
      origin
    );
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).toContain('A &amp; B');
  });
});

describe('staffNotifyEmails', () => {
  test('reads a comma-separated list and drops blanks', () => {
    expect(staffNotifyEmails(' brian@yawp.school, ,kevin@yawp.school ')).toEqual([
      'brian@yawp.school',
      'kevin@yawp.school',
    ]);
    expect(staffNotifyEmails(undefined)).toEqual([]);
  });
});
