import { z } from 'zod';
import {
  AP_ENGLISH_LIT_RUBRIC_ID,
  AP_ENGLISH_LIT_RUBRIC_TOTAL_POINTS,
} from './rubric';

export const AP_ENGLISH_LIT_ASSIGNMENT_TYPE_KEY = 'ap_english_lit_essay' as const;
export const AP_ENGLISH_LIT_SNAPSHOT_VERSION = 1 as const;

/**
 * The three free-response questions on the AP English Literature exam:
 *   - poetry .............. Q1, a provided poem
 *   - prose ............... Q2, a provided prose fiction or drama passage
 *   - literary_argument ... Q3, the "open" question — no provided text; the
 *                           student supplies a work of literary merit from memory
 */
export const ApEnglishLitFrqTypeSchema = z.enum([
  'poetry',
  'prose',
  'literary_argument',
]);
export type ApEnglishLitFrqType = z.infer<typeof ApEnglishLitFrqTypeSchema>;

const TimeModeSchema = z.enum(['untimed', 'timed']);

export const ApEnglishLitSourceSnapshotSchema = z.object({
  externalKey: z.string().min(1),
  position: z.number().int().positive(),
  title: z.string().min(1),
  attribution: z.string().min(1),
  body: z.string().min(1),
  caption: z.string().nullable().optional(),
  mediaType: z.enum(['text', 'image']),
  imageUrl: z.string().nullable().optional(),
  imageAlt: z.string().nullable().optional(),
  provenanceUrl: z.string().nullable().optional(),
});

export const ApEnglishLitSnapshotSchema = z
  .object({
    schemaVersion: z.literal(AP_ENGLISH_LIT_SNAPSHOT_VERSION),
    libraryEntryId: z.string().min(1),
    frqType: ApEnglishLitFrqTypeSchema,
    prompt: z.string().min(1),
    focusSkill: z.string().min(1),
    /**
     * Q1/Q2 ship the poem or passage as sources. Q3 ships none — the student
     * chooses a work of literary merit themselves.
     */
    sources: z.array(ApEnglishLitSourceSnapshotSchema),
    /**
     * Optional Q3 scaffolding: a short list of works a student might marshal
     * for the open question. Empty for Q1/Q2.
     */
    suggestedWorks: z.array(z.string().min(1)),
    rubric: z.object({
      rubricId: z.literal(AP_ENGLISH_LIT_RUBRIC_ID),
      totalPoints: z.literal(AP_ENGLISH_LIT_RUBRIC_TOTAL_POINTS),
    }),
    timing: z.object({
      mode: TimeModeSchema,
      durationMinutes: z.number().int().positive(),
    }),
  })
  .superRefine((snapshot, ctx) => {
    const requiresProvidedText =
      snapshot.frqType === 'poetry' || snapshot.frqType === 'prose';

    if (requiresProvidedText && snapshot.sources.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Poetry and prose analysis questions must include a provided text.',
        path: ['sources'],
      });
    }

    if (snapshot.frqType === 'literary_argument' && snapshot.sources.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'The literary argument question is open — it must not ship a provided text.',
        path: ['sources'],
      });
    }
  });

export type ApEnglishLitSnapshot = z.infer<typeof ApEnglishLitSnapshotSchema>;

type LibraryEntryForSnapshot = {
  externalKey: string;
  frqType: string;
  title: string;
  prompt: string;
  focusSkill: string;
  difficulty: string;
  skillEmphasis?: string | null;
  defaultTimeMode: string;
  defaultDurationMinutes: number;
  suggestedWorks?: string | null;
  provenanceUrl?: string | null;
  sources: Array<
    Omit<z.input<typeof ApEnglishLitSourceSnapshotSchema>, 'mediaType'> & {
      mediaType: string;
    }
  >;
};

export function parseApEnglishLitSnapshot(value: unknown): ApEnglishLitSnapshot {
  return ApEnglishLitSnapshotSchema.parse(value);
}

export function isApEnglishLitSnapshot(
  value: unknown,
): value is ApEnglishLitSnapshot {
  return ApEnglishLitSnapshotSchema.safeParse(value).success;
}

/**
 * Splits a stored `suggestedWorks` blob (newline-separated titles) into a
 * trimmed, non-empty array. Returns [] for null/empty input.
 */
export function parseSuggestedWorks(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function buildApEnglishLitSnapshot(
  entry: LibraryEntryForSnapshot,
): ApEnglishLitSnapshot {
  const frqType = ApEnglishLitFrqTypeSchema.parse(entry.frqType);

  const snapshot = {
    schemaVersion: AP_ENGLISH_LIT_SNAPSHOT_VERSION,
    libraryEntryId: entry.externalKey,
    frqType,
    prompt: entry.prompt,
    focusSkill: entry.focusSkill,
    sources: entry.sources.map((source) => ({ ...source })),
    suggestedWorks: parseSuggestedWorks(entry.suggestedWorks),
    rubric: {
      rubricId: AP_ENGLISH_LIT_RUBRIC_ID,
      totalPoints: AP_ENGLISH_LIT_RUBRIC_TOTAL_POINTS,
    },
    timing: {
      mode: TimeModeSchema.parse(entry.defaultTimeMode),
      durationMinutes: entry.defaultDurationMinutes,
    },
  };

  return ApEnglishLitSnapshotSchema.parse(snapshot);
}
