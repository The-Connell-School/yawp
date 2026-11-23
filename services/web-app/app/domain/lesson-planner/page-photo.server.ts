/**
 * A photo of the teacher's pages, read as text (plan item 12, Nov 23). A
 * teacher with the book in hand photographs the two pages the lesson reads;
 * the words are transcribed exactly and kept as the document's text, so the
 * quotations are checked against them like any other upload. The photo
 * itself is never kept.
 *
 * Exactness is the point: the transcription is what the lesson's quotations
 * are corrected to. A strong model, told to copy and never to tidy, mark
 * what it cannot read, and refuse a photo that is not printed text.
 */
import { AgentType, getLLMCompletion } from '~/utils/getLLMCompletion';

export const PAGE_PHOTO_MODEL = 'claude-sonnet-5-5';
/** The model takes pictures up to 5 MB. */
export const MAX_PAGE_PHOTO_BYTES = 5 * 1024 * 1024;
const PAGE_PHOTO_MS = 60_000;

export type PagePhotoType = 'image/jpeg' | 'image/png' | 'image/webp';

export const NOT_A_PAGE = 'NOT_A_PAGE';

export const PAGE_PHOTO_SYSTEM = `You transcribe a photo of printed pages from a book, so a teacher's lesson can quote them exactly.

Copy the words exactly as printed: the same spelling, capitals, punctuation, italics left plain, dialect and archaic spellings as they are. Never correct, modernize, summarize or complete anything.
- Prose: one paragraph per paragraph, a blank line between paragraphs. Join a word hyphenated across a line break ("remem-\\nber" is "remember").
- Verse and plays: keep each printed line on its own line, and speakers' names as printed.
- Leave out the running head, the page numbers and anything not on the page itself (a thumb, the table). Write each page's number on its own line as [p. 23] where the page shows one.
- Two pages in one photo: the left page, then the right.
- A word you cannot read: write [illegible]. Never guess.
- If the photo is not of printed text (a person, a drawing, a blank page), answer only ${NOT_A_PAGE}.

Answer with the transcription only, no other words.`;

type Attribution = Parameters<typeof getLLMCompletion>[0]['attribution'];

/** What a picture file is, from its first bytes; null when it is not a JPEG, PNG or WebP. */
export function pagePhotoType(bytes: Uint8Array): PagePhotoType | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (
    bytes.length > 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
  )
    return 'image/webp';
  return null;
}

export type TranscribePage = (bytes: Uint8Array, type: PagePhotoType) => Promise<string>;

/** The model's transcription, tidied; empty when the photo is not of printed text. */
export function readTranscription(answer: string): string {
  const text = answer.replace(/^```[a-z]*\n?|\n?```$/g, '').trim();
  return text === NOT_A_PAGE || text.startsWith(NOT_A_PAGE) ? '' : text;
}

/** A transcriber for one upload, logged with its answer but never the photo. */
export function pagePhotoTranscriber(
  attribution: () => Attribution,
  { model = process.env.LESSON_PLANNER_PAGE_PHOTO_MODEL || PAGE_PHOTO_MODEL, complete = getLLMCompletion }: { model?: string; complete?: typeof getLLMCompletion } = {}
): TranscribePage {
  return async (bytes, type) => {
    const answer = await complete({
      model,
      system: PAGE_PHOTO_SYSTEM,
      messages: [
        {
          role: AgentType.User,
          content: [
            { type: 'image', source: { type: 'base64', media_type: type, data: Buffer.from(bytes).toString('base64') } },
            { type: 'text', text: 'Transcribe the printed text in this photo exactly.' },
          ],
        },
      ],
      maxTokens: 8_000,
      attribution: attribution(),
      allowFallbackProvider: false,
      signal: AbortSignal.timeout(PAGE_PHOTO_MS),
      logPayload: 'metadata-only',
      metadata: { feature: 'lesson-planner-page-photo' },
    });
    return readTranscription(typeof answer === 'string' ? answer : String((answer as { text?: string })?.text ?? ''));
  };
}
