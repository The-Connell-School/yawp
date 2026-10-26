import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

type ReactRouterEncode = (
  input: unknown,
  options?: Record<string, unknown>
) => ReadableStream<Uint8Array | string>;

let cachedEncode: ReactRouterEncode | undefined;

/** React Router single-fetch wire format (vendored turbo-stream), not the npm `turbo-stream` package encoder. */
function getReactRouterEncode(): ReactRouterEncode {
  if (cachedEncode) return cachedEncode;
  const require = createRequire(import.meta.url);
  const reactRouterDir = path.dirname(require.resolve('react-router'));
  for (const file of fs.readdirSync(reactRouterDir)) {
    if (!file.startsWith('chunk-') || !file.endsWith('.mjs')) continue;
    const mod = require(path.join(reactRouterDir, file)) as {
      encode?: ReactRouterEncode;
    };
    if (typeof mod.encode === 'function') {
      cachedEncode = mod.encode;
      return cachedEncode;
    }
  }
  throw new Error('Could not resolve react-router single-fetch encode()');
}

/** Materialize a mocked `.data` response body for Playwright `route.fulfill`. */
export async function encodeTurboStreamBody(value: unknown): Promise<string> {
  const encode = getReactRouterEncode();
  const stream = encode(value, {});
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let body = '';
  while (true) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    if (chunk instanceof Uint8Array) {
      body += decoder.decode(chunk, { stream: true });
    } else if (typeof chunk === 'string') {
      body += chunk;
    } else {
      throw new TypeError(
        `Unexpected turbo-stream chunk type: ${chunk === null ? 'null' : typeof chunk}`
      );
    }
  }
  body += decoder.decode();
  return body;
}
