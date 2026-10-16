import { describe, expect, mock, test } from 'bun:test';
import { submitDemoFeedback, demoFeedbackAvailable, type DemoFeedbackDependencies } from './demo-feedback.server';
import { FEATURE_FLAGS, parseFeatureFlagValue } from '~/domain/feature-flags/feature-flags';

function setup(overrides: Partial<DemoFeedbackDependencies> = {}) {
  const save = mock(async () => true);
  const deps: DemoFeedbackDependencies = {
    environment: () => 'demo', flagEnabled: async () => true,
    getUser: async () => ({ id: 'demo-user' }), save, ...overrides,
  };
  return { deps, save };
}
const input = { note: 'The assignment page was slow', url: '/app/assignments?token=secret#hash', actions: [{ type: 'route', path: '/app?password=secret' }] };
function request(body: unknown = input, extra: RequestInit = {}) {
  return new Request('https://demo.example/api/demo-feedback', { method: 'POST', headers: { origin: 'https://demo.example', 'content-type': 'application/json' }, body: JSON.stringify(body), ...extra });
}
describe('demo feedback endpoint', () => {
  test('flag is registered and absent values default off', () => {
    expect(FEATURE_FLAGS).toHaveProperty('demo-feedback-widget');
    expect(parseFeatureFlagValue(undefined).mode).toBe('off');
  });
  test('requires demo runtime and a successful flag read for rendering and submission', async () => {
    for (const environment of ['production', 'development', 'pr-123', 'test']) {
      const { deps, save } = setup({ environment: () => environment });
      expect(await demoFeedbackAvailable(deps)).toBe(false);
      expect((await submitDemoFeedback(request(), deps)).status).toBe(404);
      expect(save).not.toHaveBeenCalled();
    }
    for (const flagEnabled of [async () => false, async () => { throw Error('db unavailable'); }]) {
      const { deps, save } = setup({ flagEnabled });
      expect(await demoFeedbackAvailable(deps)).toBe(false);
      expect((await submitDemoFeedback(request(), deps)).status).toBe(404);
      expect(save).not.toHaveBeenCalled();
    }
    expect(await demoFeedbackAvailable(setup().deps)).toBe(true);
  });
  test('requires authentication and same-origin POST', async () => {
    expect((await submitDemoFeedback(request(), setup({ getUser: async () => null }).deps)).status).toBe(401);
    expect((await submitDemoFeedback(request(input, { headers: { origin: 'https://evil.example', 'content-type': 'application/json' } }), setup().deps)).status).toBe(403);
    expect((await submitDemoFeedback(new Request('https://demo.example/api/demo-feedback'), setup().deps)).status).toBe(405);
    expect((await submitDemoFeedback(request(input, { headers: { 'content-type': 'application/json' } }), setup().deps)).status).toBe(403);
  });
  test('persists a note and bounded context through the existing feedback service with server attribution', async () => {
    const { deps, save } = setup();
    const response = await submitDemoFeedback(request({ ...input, userId: 'attacker', environment: 'production' }), deps);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
    expect(save).toHaveBeenCalledWith({ userId: 'demo-user', environment: 'demo', userAgent: '', url: '/app/assignments', whatHappened: input.note, whatIWish: 'Demo feedback note', whatIDid: JSON.stringify([{ type: 'route', path: '/app' }]), severity: null });
  });
  test('rejects malformed, empty, oversized or unsafe payloads without saving', async () => {
    for (const body of [null, { ...input, note: ' ' }, { ...input, note: 'x'.repeat(4001) }, { ...input, url: '/auth/login' }, { ...input, actions: Array(6).fill(input.actions[0]) }, { ...input, actions: [{ type: 'input', value: 'password' }] }, { ...input, actions: [{ type: 'click', path: '/app', target: 'secret-text' }] }, { ...input, actions: [{ type: 'capture', path: '/app', event: 'secret' }] }]) {
      const { deps, save } = setup();
      expect((await submitDemoFeedback(request(body), deps)).status).toBe(400);
      expect(save).not.toHaveBeenCalled();
    }
    expect((await submitDemoFeedback(request(input, { body: '{invalid' }), setup().deps)).status).toBe(400);
    expect((await submitDemoFeedback(request(input, { body: 'x'.repeat(30001) }), setup().deps)).status).toBe(413);
  });
  test('returns retryable storage errors and the shared rate limit', async () => {
    expect((await submitDemoFeedback(request(), setup({ save: async () => false }).deps)).status).toBe(429);
    const response = await submitDemoFeedback(request(), setup({ save: async () => { throw Error('secret database URL'); } }).deps);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('secret');
  });
});
