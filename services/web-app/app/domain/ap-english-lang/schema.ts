import { z } from 'zod';
import {
  AP_ENGLISH_LANG_RUBRIC_ID,
  AP_ENGLISH_LANG_RUBRIC_TOTAL_POINTS,
  SYNTHESIS_SOURCE_RULES,
} from './rubric';

export const AP_ENGLISH_LANG_ASSIGNMENT_TYPE_KEY =
  'ap_english_lang_essay' as const;
export const AP_ENGLISH_LANG_SNAPSHOT_VERSION = 1 as const;

/**
 * The three free-response questions on the AP English Language exam:
 *   - synthesis ............ Q1, 6-7 provided sources including at least one
 *                            visual; the student argues a position using them
 *   - rhetorical_analysis .. Q2, one provided nonfiction passage; the student
 *                            analyzes the writer's rhetorical choices
 *   - argument ............. Q3, no provided text; the student argues from
 *                            their own reading, observation, and experience
 */
export const ApEnglishLangFrqTypeSchema = z.enum([
  'synthesis',
  'rhetorical_analysis',
  'argument',
]);
export type ApEnglishLangFrqType = z.infer<typeof ApEnglishLangFrqTypeSchema>;

const TimeModeSchema = z.enum(['untimed', 'timed']);

export const ApEnglishLangSourceSnapshotSchema = z.object({
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

export const ApEnglishLangSnapshotSchema = z
  .object({
    schemaVersion: z.literal(AP_ENGLISH_LANG_SNAPSHOT_VERSION),
    libraryEntryId: z.string().min(1),
    frqType: ApEnglishLangFrqTypeSchema,
    prompt: z.string().min(1),
    focusSkill: z.string().min(1),
    /**
     * Q1 ships the full source packet. Q2 ships exactly one passage. Q3 ships
     * none — the student supplies evidence from their own knowledge.
     */
    sources: z.array(ApEnglishLangSourceSnapshotSchema),
    /**
     * Optional Q3 scaffolding: domains or examples a student might marshal for
     * the open argument question. Empty for Q1/Q2.
     */
    suggestedEvidence: z.array(z.string().min(1)),
    rubric: z.object({
      rubricId: z.literal(AP_ENGLISH_LANG_RUBRIC_ID),
      totalPoints: z.literal(AP_ENGLISH_LANG_RUBRIC_TOTAL_POINTS),
    }),
    timing: z.object({
      mode: TimeModeSchema,
      durationMinutes: z.number().int().positive(),
    }),
  })
  .superRefine((snapshot, ctx) => {
    if (snapshot.frqType === 'synthesis') {
      if (
        snapshot.sources.length <
        SYNTHESIS_SOURCE_RULES.minSourcesForTwoOrMorePoints
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            `A synthesis prompt must provide at least ` +
            `${SYNTHESIS_SOURCE_RULES.minSourcesForTwoOrMorePoints} sources so a ` +
            'response can clear the Row B source floor.',
          path: ['sources'],
        });
      }
      const hasVisual = snapshot.sources.some(
        (source) => source.mediaType === 'image',
      );
      if (!hasVisual) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'A synthesis prompt must include at least one visual source, as the exam does.',
          path: ['sources'],
        });
      }
    }

    if (snapshot.frqType === 'rhetorical_analysis') {
      if (snapshot.sources.length !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'A rhetorical analysis prompt must provide exactly one nonfiction passage.',
          path: ['sources'],
        });
      }
    }

    if (snapshot.frqType === 'argument' && snapshot.sources.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'The argument question is open — it must not ship a provided text.',
        path: ['sources'],
      });
    }
  });

export type ApEnglishLangSnapshot = z.infer<typeof ApEnglishLangSnapshotSchema>;

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
  suggestedEvidence?: string | null;
  provenanceUrl?: string | null;
  sources: Array<
    Omit<z.input<typeof ApEnglishLangSourceSnapshotSchema>, 'mediaType'> & {
      mediaType: string;
    }
  >;
};

export function parseApEnglishLangSnapshot(
  value: unknown,
): ApEnglishLangSnapshot {
  return ApEnglishLangSnapshotSchema.parse(value);
}

export function isApEnglishLangSnapshot(
  value: unknown,
): value is ApEnglishLangSnapshot {
  return ApEnglishLangSnapshotSchema.safeParse(value).success;
}

/**
 * Splits a stored `suggestedEvidence` blob (newline-separated items) into a
 * trimmed, non-empty array. Returns [] for null/empty input.
 */
export function parseSuggestedEvidence(
  value: string | null | undefined,
): string[] {
  if (!value) return [];
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function buildApEnglishLangSnapshot(
  entry: LibraryEntryForSnapshot,
): ApEnglishLangSnapshot {
  const frqType = ApEnglishLangFrqTypeSchema.parse(entry.frqType);

  const snapshot = {
    schemaVersion: AP_ENGLISH_LANG_SNAPSHOT_VERSION,
    libraryEntryId: entry.externalKey,
    frqType,
    prompt: entry.prompt,
    focusSkill: entry.focusSkill,
    sources: entry.sources.map((source) => ({ ...source })),
    suggestedEvidence: parseSuggestedEvidence(entry.suggestedEvidence),
    rubric: {
      rubricId: AP_ENGLISH_LANG_RUBRIC_ID,
      totalPoints: AP_ENGLISH_LANG_RUBRIC_TOTAL_POINTS,
    },
    timing: {
      mode: TimeModeSchema.parse(entry.defaultTimeMode),
      durationMinutes: entry.defaultDurationMinutes,
    },
  };

  return ApEnglishLangSnapshotSchema.parse(snapshot);
}
