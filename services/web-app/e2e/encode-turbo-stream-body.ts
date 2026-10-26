import { encode } from 'turbo-stream';

/** Materialize turbo-stream v3 output for mocked `.data` responses (string chunks, not Uint8Array). */
export async function encodeTurboStreamBody(value: unknown): Promise<string> {
  const stream = encode(value);
  const reader = stream.getReader();
  let body = '';
  while (true) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    body += chunk;
  }
  return body;
}
