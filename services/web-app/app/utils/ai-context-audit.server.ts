import { createHash } from 'node:crypto';

export type AiTextContextAudit = {
  documentSource: 'submission-snapshot' | 'client-content' | 'db-document-text';
  documentId?: string | null;
  submissionId?: string | null;
  documentTextLength: number;
  documentTextSha256: string;
};

export type AiContextAuditMetadata = AiTextContextAudit & {
  assignmentTypeId?: string | null;
  assignmentTypeRubricSource?: string | null;
  assignmentTypeGradingVersion?: number | null;
  rubricCategoryKeys?: string[];
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

export function buildAiContextAuditMetadata({
  textContext,
  assignmentTypeId,
  assignmentTypeRubricSource,
  assignmentTypeGradingVersion,
  rubricCategoryKeys,
}: {
  textContext: AiTextContextAudit;
  assignmentTypeId?: string | null;
  assignmentTypeRubricSource?: string | null;
  assignmentTypeGradingVersion?: number | null;
  rubricCategoryKeys?: string[];
}): AiContextAuditMetadata {
  return {
    ...textContext,
    ...(assignmentTypeId !== undefined ? { assignmentTypeId } : {}),
    ...(assignmentTypeRubricSource !== undefined
      ? { assignmentTypeRubricSource }
      : {}),
    ...(assignmentTypeGradingVersion !== undefined
      ? { assignmentTypeGradingVersion }
      : {}),
    ...(rubricCategoryKeys ? { rubricCategoryKeys } : {}),
  };
}
