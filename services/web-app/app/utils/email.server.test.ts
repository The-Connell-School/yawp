import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const sesSend = mock();
const sesClientConfigs: Array<{ region?: string }> = [];

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
	'EMAIL_PROVIDER',
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
				process.env[key] = value;
			}
		}
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

	test('captures email on yawp_pr preview without calling Resend', async () => {
		process.env.YAWP_ENVIRONMENT = 'preview';
		process.env.DATABASE_URL = 'postgresql://app@db/yawp_pr_416';
		process.env.RESEND_FROM_EMAIL = 'preview@yawp.local';
		process.env.RESEND_API_KEY = '';

		const result = await sendEmail({
			to: 'admin@school.edu',
			subject: 'Approve YAWP',
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
