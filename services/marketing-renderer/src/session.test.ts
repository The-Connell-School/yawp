import { describe, expect, test } from 'bun:test';
import { parseSessionCookies, personaEmail } from './session';

describe('personaEmail', () => {
  test('maps persona keys onto the seeded dev accounts', () => {
    expect(personaEmail('teacher')).toBe('dev.teacher@yawp.local');
    expect(personaEmail('student-graded')).toBe(
      'dev.student.graded@yawp.local'
    );
    expect(personaEmail('teacher-multi')).toBe('dev.teacher.multi@yawp.local');
  });
});

describe('parseSessionCookies', () => {
  test('keeps name and value and scopes the cookie to the render target', () => {
    const cookies = parseSessionCookies(
      [
        'en_session=abc123; Path=/; HttpOnly; SameSite=Lax',
        'membership_id=m1; Path=/; Secure',
      ],
      'https://demo.yawp.test'
    );

    expect(cookies).toEqual([
      { name: 'en_session', value: 'abc123', url: 'https://demo.yawp.test' },
      { name: 'membership_id', value: 'm1', url: 'https://demo.yawp.test' },
    ]);
  });

  test('ignores malformed headers instead of producing empty cookies', () => {
    expect(
      parseSessionCookies(
        ['', 'nonsense', '=novalue'],
        'https://demo.yawp.test'
      )
    ).toEqual([]);
  });

  test('keeps a value containing an equals sign intact', () => {
    expect(
      parseSessionCookies(
        ['session=a=b=c; Path=/'],
        'https://demo.yawp.test'
      )[0].value
    ).toBe('a=b=c');
  });
});
