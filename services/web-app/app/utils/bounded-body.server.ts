/**
 * Read a request body as text without ever buffering more than `maxBytes`.
 * `request.text()` reads an unbounded body into memory before any size check.
 * Returns null when the body is larger than the limit.
 */
async function readBoundedChunks(
  request: Request,
  maxBytes: number
): Promise<Uint8Array[] | null> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  const reader = request.body?.getReader();
  if (!reader) return [];
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return chunks;
}

/** Raw body bytes up to `maxBytes`, or null when the stream exceeds the limit. */
export async function readBoundedBytes(
  request: Request,
  maxBytes: number
): Promise<Uint8Array | null> {
  const chunks = await readBoundedChunks(request, maxBytes);
  if (chunks === null) return null;
  return new Uint8Array(Buffer.concat(chunks));
}

export async function readBoundedText(request: Request, maxBytes: number): Promise<string | null> {
  const bytes = await readBoundedBytes(request, maxBytes);
  if (bytes === null) return null;
  return Buffer.from(bytes).toString('utf8');
}
