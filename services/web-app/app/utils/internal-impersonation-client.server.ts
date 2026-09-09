import { z } from 'zod';

const sessionId = z.string().uuid();
const boundedId = z.string().min(1).max(200);
const identitySchema = z.object({
  id: sessionId, actorId: boundedId, userId: boundedId, organizationId: boundedId,
  expiresAt: z.string().datetime(),
}).strict();
export type InternalImpersonationIdentity = z.infer<typeof identitySchema>;
type Transport = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export class InactiveImpersonationError extends Error {
  constructor() { super('Impersonation is inactive'); }
}

/** No authorization cache and no retries: redemption is a single-use operation. */
export class InternalImpersonationClient {
  private origin: string;
  constructor(origin: string, private key: string, private transport: Transport = fetch) {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('Internal platform requires a plain HTTPS origin');
    }
    if (!/^[A-Za-z0-9_-]{43,}$/.test(key)) throw new Error('Invalid Internal service credential');
    this.origin = url.origin;
  }
  private async post(action: string, body: Record<string, string>) {
    let response: Response;
    try {
      response = await this.transport(`${this.origin}/api/integrations/yawp/impersonations/${action}`, {
        method: 'POST', headers: { authorization: `Bearer ${this.key}`, 'content-type': 'application/json' },
        body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(10000),
      });
    } catch { throw new Error('Internal impersonation unavailable'); }
    if (response.status === 403) throw new InactiveImpersonationError();
    if (!response.ok) throw new Error('Internal impersonation unavailable');
    if (action === 'end' && response.status === 204) return null;
    try {
      const text = await response.text();
      if (text.length > 4096) throw new Error();
      return JSON.parse(text) as unknown;
    } catch { throw new Error('Invalid Internal impersonation response'); }
  }
  private identity(value: unknown, expectedSessionId?: string) {
    const parsed = identitySchema.safeParse(value);
    if (!parsed.success) throw new Error('Invalid Internal impersonation response');
    const expires = Date.parse(parsed.data.expiresAt);
    const remaining = expires - Date.now();
    if (remaining <= 0 || remaining > 3600000 || (expectedSessionId && parsed.data.id !== expectedSessionId)) {
      throw new InactiveImpersonationError();
    }
    return parsed.data;
  }
  async redeem(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new InactiveImpersonationError();
    return this.identity(await this.post('redeem', { token }));
  }
  async context(id: string) {
    if (!sessionId.safeParse(id).success) throw new InactiveImpersonationError();
    return this.identity(await this.post('context', { sessionId: id }), id);
  }
  async end(id: string) {
    if (!sessionId.safeParse(id).success) throw new InactiveImpersonationError();
    await this.post('end', { sessionId: id });
  }
}
