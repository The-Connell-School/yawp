import { buildDocumentImageSrc } from '~/domain/document-images/document-images';

export type UploadedDocumentImage = { id: string; src: string; altText: string };

export type UploadDocumentImageResult =
  | { ok: true; image: UploadedDocumentImage }
  | { ok: false; message: string };

const GENERIC_FAILURE = "That image didn't upload. Try again.";

/**
 * POST one figure to the document's own upload endpoint.
 *
 * Split out of the button so the failure paths -- a rejected file type, a
 * server that answered with something that is not JSON, a network drop
 * mid-upload -- are unit-testable without mounting the editor.
 */
export async function uploadDocumentImage({
  documentId,
  file,
  altText,
  fetchImpl = fetch,
}: {
  documentId: string;
  file: File;
  altText: string;
  fetchImpl?: typeof fetch;
}): Promise<UploadDocumentImageResult> {
  const body = new FormData();
  body.set('file', file);
  body.set('altText', altText);

  let response: Response;
  try {
    response = await fetchImpl(`/api/document/${documentId}/image`, {
      method: 'POST',
      body,
    });
  } catch {
    return { ok: false, message: GENERIC_FAILURE };
  }

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok) {
    return { ok: false, message: payload?.message || GENERIC_FAILURE };
  }

  return {
    ok: true,
    image: {
      id: payload.id,
      // Trust our own builder over whatever came back on the wire.
      src: buildDocumentImageSrc(payload.id),
      altText: payload.altText ?? altText,
    },
  };
}
