import { describe, expect, it } from 'bun:test';
import { demoCredentials } from './sign-in';

describe('demoCredentials', () => {
  it('defaults to the preset local-dev logins', () => {
    expect(demoCredentials('student', {})).toEqual({
      email: 'dev.student@yawp.local',
      password: 'yawp-dev',
    });
    expect(demoCredentials('teacher', {}).email).toBe('dev.teacher@yawp.local');
    expect(demoCredentials('admin', {}).email).toBe('dev.admin@yawp.local');
  });

  it('lets a single env var re-point one role', () => {
    const creds = demoCredentials('teacher', {
      DEMO_TEACHER_EMAIL: 'seeded.teacher@example.test',
    });
    expect(creds.email).toBe('seeded.teacher@example.test');
    expect(creds.password).toBe('yawp-dev');
  });

  it('applies a shared password override to every role', () => {
    const env = { DEMO_PASSWORD: 'johndoe' };
    expect(demoCredentials('student', env).password).toBe('johndoe');
    expect(demoCredentials('teacher', env).password).toBe('johndoe');
  });

  it('prefers a role-specific password over the shared one', () => {
    const creds = demoCredentials('student', {
      DEMO_PASSWORD: 'shared',
      DEMO_STUDENT_PASSWORD: 'specific',
    });
    expect(creds.password).toBe('specific');
  });

  it('does not leak one role’s override onto another', () => {
    const env = { DEMO_STUDENT_EMAIL: 'someone@example.test' };
    expect(demoCredentials('teacher', env).email).toBe(
      'dev.teacher@yawp.local'
    );
  });
});
