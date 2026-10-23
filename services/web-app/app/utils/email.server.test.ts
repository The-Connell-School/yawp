import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const sesSend = mock();
const sesClientConfigs: Array<{ region?: string; maxAttempts?: number }> = [];

class MockSESv2Client {
	constructor(config: { region?: string }) {
		sesClientConfigs.push(config);
	}

	send(command: unknown) {
		return sesSend(command);
	}
}

class MockSendEmailCommand {
	input: unknown;

	constructor(input: unknown) {
		this.input = input;
	}
}

mock.module('@aws-sdk/client-sesv2', () => ({
	SESv2Client: MockSESv2Client,
	SendEmailCommand: MockSendEmailCommand,
}));

const { sendEmail } = await import('./email.server');

const originalFetch = globalThis.fetch;
const envKeys = [
	'AWS_REGION',
	'AWS_SES_REGION',
	'DATABASE_URL',
	'EMAIL_LOG_BODY',
	'EMAIL_PROVIDER',
	'MOCKS',
	'NODE_ENV',
	'RESEND_API_KEY',
	'RESEND_FROM_EMAIL',
	'SES_FROM_EMAIL',
	'YAWP_ENVIRONMENT',
] as const;
const originalEnv = Object.fromEntries(
	envKeys.map((key) => [key, process.env[key]]),
);

describe('sendEmail', () => {
	let fetchMock: ReturnType<typeof mock>;

	beforeEach(() => {
		sesSend.mockReset();
		sesClientConfigs.length = 0;
		fetchMock = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify({ id: 'resend-message-id' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				}),
			),
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		for (const key of envKeys) {
			delete process.env[key];
		}
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		for (const key of envKeys) {
			const value = originalEnv[key];
			if (value === undefined) {
				delete process.env[key];
			} else {
				(process.env as Record<string, string | undefined>)[key] = value;
			}
		}
	});

  test('create and resend owner templates render through the same Resend transport without a real send', async () => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 're_fixture_only';
    process.env.RESEND_FROM_EMAIL = 'fixture@example.test';
    const { issueOwnerInvitation } = await import('~/domain/organizations/owner-invitations.server');
    const db = {
      invitation: { create: async ({ data }: any) => ({ id: 'fixture-invitation', ...data }) },
    } as unknown as Parameters<typeof issueOwnerInvitation>[0];
    for (const options of [{ expiresInDays: 14, note: 'Fixture note' }, { expiresInDays: 7 }]) {
      const result = await issueOwnerInvitation(db, {
        organization: { id: 'fixture-org', name: 'Fixture organization' },
        email: 'owner@example.test', origin: 'https://example.test', ...options,
      });
      expect(result.id).toBe('fixture-invitation');
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      expect(call[0]).toBe('https://api.resend.com/emails');
      const payload = JSON.parse(call[1].body);
      expect(payload.from).toBe('fixture@example.test');
      expect(payload.to).toBe('owner@example.test');
      expect(payload.html).toContain('Accept invitation');
    }
  });

  test('durable approval delivery disables SDK retries without changing legacy callers', async () => {
    process.env.EMAIL_PROVIDER = 'ses';
    sesSend.mockResolvedValue({ MessageId: 'captured' });
    await sendEmail({
      to: 'local@example.org',
      subject: 'Captured',
      html: '<p>Captured</p>',
      text: 'Captured',
      singleAttempt: true,
    });
    expect(sesClientConfigs[0]?.maxAttempts).toBe(1);
  });

	test('sends through AWS SES when EMAIL_PROVIDER is ses', async () => {
		process.env.EMAIL_PROVIDER = 'ses';
		process.env.AWS_REGION = 'us-east-1';
		process.env.RESEND_FROM_EMAIL = 'info@yawp.school';
		sesSend.mockResolvedValue({ MessageId: 'ses-message-id' });

		const result = await sendEmail({
			to: 'bryant@brock.software',
			subject: 'SES smoke test',
			html: '<p>SES smoke test</p>',
			text: 'SES smoke test',
		});

		expect(result).toEqual({
			status: 'success',
			data: { id: 'ses-message-id' },
		});
		expect(sesClientConfigs).toEqual([{ region: 'us-east-1' }]);
		expect(sesSend).toHaveBeenCalledTimes(1);
		const command = sesSend.mock.calls[0]?.[0] as MockSendEmailCommand;
		expect(command.input).toEqual({
			FromEmailAddress: 'info@yawp.school',
			Destination: { ToAddresses: ['bryant@brock.software'] },
			Content: {
				Simple: {
					Subject: { Data: 'SES smoke test' },
					Body: {
						Html: { Data: '<p>SES smoke test</p>' },
						Text: { Data: 'SES smoke test' },
					},
				},
			},
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test('keeps the explicit Resend provider path available', async () => {
		process.env.EMAIL_PROVIDER = 'resend';
		process.env.RESEND_API_KEY = 'resend-test-key';
		process.env.RESEND_FROM_EMAIL = 'info@yawp.school';

		const result = await sendEmail({
			to: 'bryant@brock.software',
			subject: 'Resend smoke test',
			html: '<p>Resend smoke test</p>',
			text: 'Resend smoke test',
		});

		expect(result.status).toBe('success');
		expect(fetchMock).toHaveBeenCalledWith('https://api.resend.com/emails', {
			method: 'POST',
			body: JSON.stringify({
				from: 'info@yawp.school',
				to: 'bryant@brock.software',
				subject: 'Resend smoke test',
				html: '<p>Resend smoke test</p>',
				text: 'Resend smoke test',
			}),
			headers: {
				Authorization: 'Bearer resend-test-key',
				'Content-Type': 'application/json',
			},
		});
		expect(sesSend).not.toHaveBeenCalled();
	});


  test('passes optional BCC to SES without changing To', async () => {
    process.env.EMAIL_PROVIDER = 'ses';
    sesSend.mockResolvedValue({ MessageId: 'mock' });
    await sendEmail({ to: 'principal@example.edu', bcc: ['teacher@example.edu'], subject: 'Approval', html: '<p>fixed</p>', text: 'fixed' } as Parameters<typeof sendEmail>[0]);
    expect((sesSend.mock.calls[0][0] as MockSendEmailCommand).input).toMatchObject({ Destination: { ToAddresses: ['principal@example.edu'], BccAddresses: ['teacher@example.edu'] } });
  });

  test('passes optional BCC to Resend without changing To', async () => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 'mock-key';
    await sendEmail({ to: 'principal@example.edu', bcc: ['teacher@example.edu'], subject: 'Approval', html: '<p>fixed</p>', text: 'fixed' } as Parameters<typeof sendEmail>[0]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ to: 'principal@example.edu', bcc: ['teacher@example.edu'] });
  });

  test('redacts unsent Resend payloads unless local dev explicitly opts into body logs', async () => {
    const errorLog = mock((..._args: unknown[]) => {});
    const originalError = console.error;
    console.error = errorLog as typeof console.error;
    try {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
      delete process.env.EMAIL_LOG_BODY;
      delete process.env.RESEND_API_KEY;
      delete process.env.RESEND_FROM_EMAIL;
      delete process.env.MOCKS;

      await sendEmail({
        to: 'teacher@school.edu',
        subject: 'Class code inside',
        html: '<p>https://yawp.school/join?code=secret</p>',
        text: 'https://yawp.school/join?code=secret',
        logKind: 'teacher-invite',
      });

      const logCalls = errorLog.mock.calls as unknown[][];
      const wouldHaveSent = logCalls.find((call) =>
        String(call[0]).includes('Would have sent the following email:'),
      );
      expect(wouldHaveSent).toBeDefined();
      const payload = JSON.parse(String(wouldHaveSent?.[1]));
      expect(payload).toEqual({
        to: 't***@s***',
        subject: 'Class code inside',
        kind: 'teacher-invite',
        bodyLength: 43,
      });
      expect(logCalls.some((call) =>
        String(call[0]).includes('Full email payload'),
      )).toBe(false);
    } finally {
      console.error = originalError;
    }
  });

  test('never logs full email bodies on preview even with EMAIL_LOG_BODY=1', async () => {
    const errorLog = mock((..._args: unknown[]) => {});
    const originalError = console.error;
    console.error = errorLog as typeof console.error;
    try {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
      process.env.EMAIL_LOG_BODY = '1';
      process.env.YAWP_ENVIRONMENT = 'preview';
      delete process.env.RESEND_API_KEY;
      delete process.env.RESEND_FROM_EMAIL;
      delete process.env.MOCKS;

      await sendEmail({
        to: 'teacher@school.edu',
        subject: 'Preview',
        html: '<p>secret-body</p>',
        text: 'secret-body',
      });

      const logCalls = errorLog.mock.calls as unknown[][];
      expect(logCalls.some((call) =>
        String(call[0]).includes('Full email payload'),
      )).toBe(false);
    } finally {
      console.error = originalError;
    }
  });

  test('redacts preview capture logs', async () => {
    const infoLog = mock((..._args: unknown[]) => {});
    const originalInfo = console.info;
    console.info = infoLog as typeof console.info;
    try {
      process.env.YAWP_ENVIRONMENT = 'preview';
      process.env.DATABASE_URL = 'postgresql://app@db/yawp_pr_416';
      process.env.RESEND_FROM_EMAIL = 'preview@yawp.local';
      process.env.RESEND_API_KEY = '';

      await sendEmail({
        to: 'teacher@school.edu',
        subject: 'Preview invite',
        html: '<p>https://yawp.school/join?code=secret</p>',
        text: 'secret-body',
        logKind: 'teacher-invite',
      });

      const serialized = JSON.stringify(infoLog.mock.calls);
      expect(serialized).toContain('[preview-email-capture]');
      expect(serialized).not.toContain('teacher@school.edu');
      expect(serialized).toContain('t***@s***');
      expect(serialized).not.toContain('secret-body');
    } finally {
      console.info = originalInfo;
    }
  });

	test('captures email on yawp_pr preview without calling Resend', async () => {
		process.env.YAWP_ENVIRONMENT = 'preview';
		process.env.DATABASE_URL = 'postgresql://app@db/yawp_pr_416';
		process.env.RESEND_FROM_EMAIL = 'preview@yawp.local';
		process.env.RESEND_API_KEY = '';

		const result = await sendEmail({
			to: 'admin@school.edu',
			subject: 'Approve Yawp!',
			html: '<p>test</p>',
			text: 'test',
		});

		expect(result).toEqual({
			status: 'success',
			data: { id: 'preview-captured' },
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
