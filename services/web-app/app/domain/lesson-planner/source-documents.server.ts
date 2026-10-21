/**
 * A teacher's own document, read for the lesson planner (Oct 21): a chapter,
 * a handout, their notes, last year's unit. Only the text is kept, never the
 * file. PDF through pdf.js (`unpdf`); Word and PowerPoint through the app's
 * own readers; plain text and Markdown as written.
 */
import { extractText, getDocumentProxy } from 'unpdf';
import { readDocxText } from '~/domain/office/docx';
import { pptxPlainText } from '~/domain/office/pptx';

export const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
/** About forty pages of prose: enough for a chapter or a unit packet. */
export const MAX_SOURCE_CHARS = 120_000;
export const MAX_SOURCES_PER_LESSON = 10;
export const SOURCE_ACCEPT = '.pdf,.docx,.pptx,.txt,.md';

export class SourceDocumentError extends Error {}

export type SourceDocument = {
  kind: 'pdf' | 'docx' | 'pptx' | 'text';
  contentType: string;
  text: string;
  truncated: boolean;
};

const CONTENT_TYPES: Record<SourceDocument['kind'], string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  text: 'text/plain',
};

function kindOf(name: string): SourceDocument['kind'] | null {
  const extension = /\.([a-z0-9]+)$/i.exec(name.trim())?.[1]?.toLowerCase();
  if (extension === 'pdf') return 'pdf';
  if (extension === 'docx') return 'docx';
  if (extension === 'pptx') return 'pptx';
  if (extension === 'txt' || extension === 'md' || extension === 'markdown') return 'text';
  return null;
}

/** Runs of blank lines and trailing spaces, tidied; the words untouched. */
function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  // A PDF starts with its signature; anything else is not one, whatever its name.
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw new Error('not a PDF');
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

export async function readSourceDocument(file: File): Promise<SourceDocument> {
  const kind = kindOf(file.name);
  if (!kind) throw new SourceDocumentError('Yawp! can read PDF, Word, PowerPoint, text and Markdown files.');
  if (file.size <= 0) throw new SourceDocumentError(`"${file.name}" is empty.`);
  if (file.size > MAX_SOURCE_BYTES) throw new SourceDocumentError(`"${file.name}" is over 10 MB.`);

  const bytes = new Uint8Array(await file.arrayBuffer());
  let raw: string;
  try {
    raw =
      kind === 'pdf'
        ? await pdfText(bytes)
        : kind === 'docx'
          ? readDocxText(bytes)
          : kind === 'pptx'
            ? pptxPlainText(bytes)
            : new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    throw new SourceDocumentError(`"${file.name}" could not be opened.`);
  }

  const text = tidy(raw);
  if (!text) {
    throw new SourceDocumentError(
      kind === 'pdf'
        ? `"${file.name}" has no text Yawp! can read. It may be a scan; try the Word file or a PDF exported from it.`
        : `"${file.name}" has no text Yawp! can read.`
    );
  }
  return {
    kind,
    contentType: CONTENT_TYPES[kind],
    text: text.slice(0, MAX_SOURCE_CHARS),
    truncated: text.length > MAX_SOURCE_CHARS,
  };
}
