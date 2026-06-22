import { createHash } from 'node:crypto';

export type AiTextContextAudit = {
  documentSource: 'submission-snapshot' | 'client-content' | 'db-document-text';
  documentId?: string | null;
  submissionId?: string | null;
  documentTextLength: number;
  documentTextSha256: string;
};

export function sha256Text(text: string) {
  return createHash('sha256').update(text).digest('hex');
}

export function buildAiTextContextAudit({
  documentSource,
  documentId,
  submissionId,
  text,
}: {
  documentSource: AiTextContextAudit['documentSource'];
  documentId?: string | null;
  submissionId?: string | null;
  text: string;
}): AiTextContextAudit {
  return {
    documentSource,
    documentId,
    submissionId,
    documentTextLength: text.length,
    documentTextSha256: sha256Text(text),
  };
}
