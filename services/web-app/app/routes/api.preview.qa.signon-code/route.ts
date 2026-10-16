import type { ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import { readBoundedText } from '~/utils/bounded-body.server';
import {
  authenticatePreviewCodeRequest,
  previewCodeCaptureEnabled,
  takePreviewCode,
} from '~/domain/unified-signon/preview-code.server';

const headers = { 'cache-control': 'private, no-store' };
const reply = (body: unknown, status: number) => Response.json(body, { status, headers });
const notFound = () => reply({ error: 'Not found' }, 404);
const input = z.object({ email: z.string().trim().toLowerCase().email().max(320) }).strict();

// POST keeps the intended recipient out of access-log URLs. GET never reveals
// whether a recipient has a challenge, even on an eligible preview.
export const loader = () => notFound();

export async function action({ request }: ActionFunctionArgs) {
  if (!previewCodeCaptureEnabled()) return notFound();
  if (!authenticatePreviewCodeRequest(request)) return reply({ error: 'Unauthorized' }, 401);
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  let email: string;
  try {
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error();
    const raw = await readBoundedText(request, 2048);
    if (raw === null) throw new Error();
    email = input.parse(JSON.parse(raw)).email;
  } catch {
    return reply({ error: 'Invalid request' }, 400);
  }
  const code = takePreviewCode(request, email);
  return code === null ? notFound() : reply({ code }, 200);
}
