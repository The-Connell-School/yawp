import { describe, expect, mock, test } from 'bun:test';

test('org teacher invite failures log redacted delivery diagnostics', async () => {
  const errorLog = mock((..._args: unknown[]) => {});
  const originalError = console.error;
  console.error = errorLog as typeof console.error;
  try {
    const { emailDeliveryDiagnostic } = await import(
      '~/utils/email-delivery-error.server'
    );
    const diagnostic = emailDeliveryDiagnostic(
      Object.assign(new Error('Provider rejected https://yawp.school/inv?code=OTP123'), {
        name: 'validation_error',
        statusCode: 422,
      }),
      'teacher@school.edu',
    );
    console.error('org_teacher_invite_delivery_failed', diagnostic);
    const serialized = JSON.stringify(errorLog.mock.calls);
    expect(serialized).toContain('org_teacher_invite_delivery_failed');
    expect(serialized).not.toContain('teacher@school.edu');
    expect(serialized).not.toContain('OTP123');
    expect(serialized).toContain('t***@s***');
  } finally {
    console.error = originalError;
  }
});
