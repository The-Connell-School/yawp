import { z } from 'zod';

export const AP_HISTORY_ASSIGNMENT_TYPE_KEY = 'ap_history_essay' as const;
export const AP_HISTORY_SNAPSHOT_VERSION = 1 as const;

const EssayTypeSchema = z.enum(['dbq', 'leq']);
const CourseSchema = z.literal('apush');
const TimeModeSchema = z.enum(['untimed', 'timed']);

export const ApHistorySourceSnapshotSchema = z.object({
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

export const ApHistorySnapshotSchema = z
  .object({
    schemaVersion: z.literal(AP_HISTORY_SNAPSHOT_VERSION),
    libraryEntryId: z.string().min(1),
    course: CourseSchema,
    essayType: EssayTypeSchema,
    prompt: z.string().min(1),
    period: z.string().min(1),
    periodNumber: z.number().int().positive(),
    reasoningSkill: z.string().min(1),
    sources: z.array(ApHistorySourceSnapshotSchema),
    rubric: z.object({
      rubricId: z.enum(['ap-history-dbq-2026', 'ap-history-leq-2026']),
      totalPoints: z.union([z.literal(7), z.literal(6)]),
    }),
    timing: z.object({
      mode: TimeModeSchema,
      durationMinutes: z.number().int().positive(),
    }),
  })
  .superRefine((snapshot, ctx) => {
    const expectedRubric =
      snapshot.essayType === 'dbq'
        ? { rubricId: 'ap-history-dbq-2026', totalPoints: 7 }
        : { rubricId: 'ap-history-leq-2026', totalPoints: 6 };

    if (
      snapshot.rubric.rubricId !== expectedRubric.rubricId ||
      snapshot.rubric.totalPoints !== expectedRubric.totalPoints
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Rubric must match the AP History essay type.',
        path: ['rubric'],
      });
    }
  });

export type ApHistorySnapshot = z.infer<typeof ApHistorySnapshotSchema>;

type LibraryEntryForSnapshot = {
  externalKey: string;
  course: string;
  essayType: string;
  prompt: string;
  period: string;
  periodNumber: number;
  reasoningSkill: string;
  defaultTimeMode: string;
  defaultDurationMinutes: number;
  sources: Array<
    Omit<z.input<typeof ApHistorySourceSnapshotSchema>, 'mediaType'> & {
      mediaType: string;
    }
  >;
};

export function parseApHistorySnapshot(value: unknown): ApHistorySnapshot {
  return ApHistorySnapshotSchema.parse(value);
}

export function isApHistorySnapshot(value: unknown): value is ApHistorySnapshot {
  return ApHistorySnapshotSchema.safeParse(value).success;
}

export function buildApHistorySnapshot(
  entry: LibraryEntryForSnapshot,
): ApHistorySnapshot {
  const course = CourseSchema.parse(entry.course);
  const essayType = EssayTypeSchema.parse(entry.essayType);
  const rubric =
    essayType === 'dbq'
      ? { rubricId: 'ap-history-dbq-2026' as const, totalPoints: 7 as const }
      : { rubricId: 'ap-history-leq-2026' as const, totalPoints: 6 as const };

  const snapshot = {
    schemaVersion: AP_HISTORY_SNAPSHOT_VERSION,
    libraryEntryId: entry.externalKey,
    course,
    essayType,
    prompt: entry.prompt,
    period: entry.period,
    periodNumber: entry.periodNumber,
    reasoningSkill: entry.reasoningSkill,
    sources: entry.sources.map((source) => ({ ...source })),
    rubric,
    timing: {
      mode: TimeModeSchema.parse(entry.defaultTimeMode),
      durationMinutes: entry.defaultDurationMinutes,
    },
  };

  return ApHistorySnapshotSchema.parse(snapshot);
}
