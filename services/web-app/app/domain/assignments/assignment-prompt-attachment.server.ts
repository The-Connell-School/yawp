import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deleteSmallObject, putSmallObject } from '~/services/s3.server';

export const MAX_ASSIGNMENT_PROMPT_PDF_BYTES = 10 * 1024 * 1024;
const MAX_ASSIGNMENT_PROMPT_REQUEST_BYTES =
  MAX_ASSIGNMENT_PROMPT_PDF_BYTES + 1024 * 1024;

export class AssignmentPromptAttachmentError extends Error {}

export function assignmentPromptAttachmentRequestTooLarge(request: Request) {
  const contentLength = Number(request.headers.get('content-length'));
  return (
    Number.isFinite(contentLength) &&
    contentLength > MAX_ASSIGNMENT_PROMPT_REQUEST_BYTES
  );
}

function safeFileName(name: string) {
  return (
    name
      .trim()
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(-180) || 'assignment.pdf'
  );
}

export function usesLocalAssignmentPromptStorage() {
  return (
    process.env.NODE_ENV === 'development' &&
    process.env.AWS_S3_BUCKET_FOR_VIDEOS?.endsWith('-local-dev-bucket')
  );
}

function localPathForKey(key: string) {
  if (!key.startsWith('assignment-prompts/') || key.includes('..')) {
    throw new AssignmentPromptAttachmentError('Invalid attachment key.');
  }
  return path.join(process.cwd(), '.cache', key);
}

export async function uploadAssignmentPromptAttachment(file: File) {
  const isPdf =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    throw new AssignmentPromptAttachmentError('Only PDF files are supported.');
  }
  if (file.size <= 0) {
    throw new AssignmentPromptAttachmentError('Uploaded PDF is empty.');
  }
  if (file.size > MAX_ASSIGNMENT_PROMPT_PDF_BYTES) {
    throw new AssignmentPromptAttachmentError(
      'PDF is too large. Maximum size is 10 MB.'
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const trailer = bytes
    .subarray(Math.max(0, bytes.length - 1024))
    .toString('ascii');
  if (
    bytes.subarray(0, 5).toString('ascii') !== '%PDF-' ||
    !trailer.includes('%%EOF')
  ) {
    throw new AssignmentPromptAttachmentError(
      'The selected file is not a valid PDF.'
    );
  }

  const fileName = safeFileName(file.name);
  const displayName = file.name.trim().slice(0, 200) || 'assignment.pdf';
  const key = `assignment-prompts/${randomUUID()}/${fileName}`;
  if (usesLocalAssignmentPromptStorage()) {
    const localPath = localPathForKey(key);
    await mkdir(path.dirname(localPath), { recursive: true });
    await writeFile(localPath, bytes);
  } else {
    await putSmallObject(key, bytes, 'application/pdf');
  }

  return {
    promptAttachmentKey: key,
    promptAttachmentName: displayName,
    promptAttachmentSize: file.size,
  };
}

export async function deleteAssignmentPromptAttachment(key: string) {
  if (usesLocalAssignmentPromptStorage()) {
    await unlink(localPathForKey(key)).catch(() => {});
  } else {
    await deleteSmallObject(key);
  }
}

export async function readLocalAssignmentPromptAttachment(key: string) {
  if (!usesLocalAssignmentPromptStorage()) return null;
  return readFile(localPathForKey(key));
}
