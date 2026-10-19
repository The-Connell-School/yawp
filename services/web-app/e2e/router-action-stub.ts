import { createRequire } from 'node:module';

// Use the encoder shipped with this checkout's router, including its pinned
// stream version. The app's fetchers now use .data requests in development too.
const require = createRequire(import.meta.url);
const routerRequire = createRequire(require.resolve('react-router'));
const { encode } = routerRequire('turbo-stream') as {
  encode: (value: unknown) => ReadableStream<Uint8Array>;
};

export async function routerActionStub(url: string, payload: unknown) {
  if (!new URL(url, 'http://stub.local').pathname.endsWith('.data')) {
    return {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    };
  }
  const reader = encode({ data: payload }).getReader();
  const decoder = new TextDecoder();
  let body = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    body += decoder.decode(value, { stream: true });
  }
  body += decoder.decode();
  return {
    status: 200,
    contentType: 'text/x-script',
    headers: { 'X-Remix-Response': 'yes' },
    body,
  };
}
