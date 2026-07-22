import { z } from 'zod';

export const AP_HISTORY_ASSIGNMENT_TYPE_KEY = 'ap_history_essay' as const;
export const AP_HISTORY_SNAPSHOT_VERSION = 2 as const;
export const AP_HISTORY_PUBLIC_DOMAIN_LICENSE = 'Public Domain' as const;
export const AP_HISTORY_PUBLIC_DOMAIN_LICENSE_URL =
  'https://creativecommons.org/public-domain/mark/1.0/' as const;

const EssayTypeSchema = z.enum(['dbq', 'leq']);
const CourseSchema = z.literal('apush');
const TimeModeSchema = z.enum(['untimed', 'timed']);
const ReasoningSkillSchema = z.enum([
  'causation',
  'comparison',
  'continuity-and-change',
  'periodization',
]);
const HttpsUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith('https://'), {
    message: 'URL must use HTTPS.',
  });

const LegacyApHistorySourceSnapshotSchema = z.object({
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

export const ApHistorySourceSnapshotSchema =
  LegacyApHistorySourceSnapshotSchema.extend({
    licenseName: z.string().trim().min(1),
    licenseUrl: HttpsUrlSchema,
    provenanceUrl: HttpsUrlSchema,
  });

const RubricSchema = z.object({
  rubricId: z.enum(['ap-history-dbq-2026', 'ap-history-leq-2026']),
  totalPoints: z.union([z.literal(7), z.literal(6)]),
});

const TimingSchema = z.object({
  mode: TimeModeSchema,
  durationMinutes: z.number().int().positive(),
});

const commonSnapshotShape = {
  libraryEntryId: z.string().min(1),
  course: CourseSchema,
  essayType: EssayTypeSchema,
  prompt: z.string().min(1),
  period: z.string().min(1),
  periodNumber: z.number().int().positive(),
  reasoningSkill: z.string().min(1),
  rubric: RubricSchema,
  timing: TimingSchema,
};

const LegacyApHistorySnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  ...commonSnapshotShape,
  sources: z.array(LegacyApHistorySourceSnapshotSchema),
});

const ApHistorySnapshotV2Schema = z.object({
  schemaVersion: z.literal(AP_HISTORY_SNAPSHOT_VERSION),
  origin: z.enum(['library', 'pdf-import']),
  importDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  ...commonSnapshotShape,
  sources: z.array(ApHistorySourceSnapshotSchema).max(10),
});

export const ApHistorySnapshotSchema = z
  .union([LegacyApHistorySnapshotSchema, ApHistorySnapshotV2Schema])
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

    if (snapshot.essayType === 'dbq' && snapshot.sources.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'DBQ snapshots require at least one source.',
        path: ['sources'],
      });
    }
    if (snapshot.essayType === 'leq' && snapshot.sources.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'LEQ snapshots cannot contain DBQ sources.',
        path: ['sources'],
      });
    }

    if (
      snapshot.schemaVersion === AP_HISTORY_SNAPSHOT_VERSION &&
      snapshot.origin === 'pdf-import' &&
      !snapshot.importDigest
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'PDF imports require a SHA-256 digest.',
        path: ['importDigest'],
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
    Omit<
      z.input<typeof LegacyApHistorySourceSnapshotSchema>,
      'mediaType'
    > & {
      mediaType: string;
      licenseName?: string | null;
      licenseUrl?: string | null;
    }
  >;
};

export function parseApHistorySnapshot(value: unknown): ApHistorySnapshot {
  return ApHistorySnapshotSchema.parse(value);
}

export function isApHistorySnapshot(value: unknown): value is ApHistorySnapshot {
  return ApHistorySnapshotSchema.safeParse(value).success;
}

function rubricForEssayType(essayType: 'dbq' | 'leq') {
  return essayType === 'dbq'
    ? { rubricId: 'ap-history-dbq-2026' as const, totalPoints: 7 as const }
    : { rubricId: 'ap-history-leq-2026' as const, totalPoints: 6 as const };
}

export function buildApHistorySnapshot(
  entry: LibraryEntryForSnapshot,
): ApHistorySnapshot {
  const course = CourseSchema.parse(entry.course);
  const essayType = EssayTypeSchema.parse(entry.essayType);
  const sources = entry.sources.map((source) => ({ ...source }));
  const common = {
    libraryEntryId: entry.externalKey,
    course,
    essayType,
    prompt: entry.prompt,
    period: entry.period,
    periodNumber: entry.periodNumber,
    reasoningSkill: entry.reasoningSkill,
    sources,
    rubric: rubricForEssayType(essayType),
    timing: {
      mode: TimeModeSchema.parse(entry.defaultTimeMode),
      durationMinutes: entry.defaultDurationMinutes,
    },
  };

  const hasCompleteRightsMetadata = sources.every(
    (source) =>
      source.licenseName?.trim() &&
      source.licenseUrl?.trim() &&
      source.provenanceUrl?.trim(),
  );

  if (!hasCompleteRightsMetadata && sources.length > 0) {
    return ApHistorySnapshotSchema.parse({
      schemaVersion: 1,
      ...common,
      sources: sources.map(
        ({ licenseName: _licenseName, licenseUrl: _licenseUrl, ...source }) =>
          source,
      ),
    });
  }

  return ApHistorySnapshotSchema.parse({
    schemaVersion: AP_HISTORY_SNAPSHOT_VERSION,
    origin: 'library',
    ...common,
  });
}

const ImportedApHistoryInputSchema = z
  .object({
    importDigest: z.string().regex(/^[a-f0-9]{64}$/),
    essayType: EssayTypeSchema,
    prompt: z.string().trim().min(1).max(8_000),
    period: z.string().trim().min(1).max(120),
    periodNumber: z.number().int().min(1).max(9),
    reasoningSkill: ReasoningSkillSchema,
    timeMode: TimeModeSchema,
    durationMinutes: z.number().int().min(1).max(240),
    provenanceUrl: HttpsUrlSchema,
    sources: z
      .array(
        z.object({
          position: z.number().int().positive(),
          title: z.string().trim().min(1).max(200),
          attribution: z.string().trim().min(1).max(500),
          body: z.string().trim().min(1).max(20_000),
        }),
      )
      .max(10),
  })
  .superRefine((input, ctx) => {
    if (input.essayType === 'dbq' && input.sources.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'DBQ imports require at least one source.',
        path: ['sources'],
      });
    }
    if (input.essayType === 'leq' && input.sources.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'LEQ imports cannot contain sources.',
        path: ['sources'],
      });
    }
  });

export type ImportedApHistoryInput = z.input<
  typeof ImportedApHistoryInputSchema
>;

export function buildImportedApHistorySnapshot(
  value: ImportedApHistoryInput,
): ApHistorySnapshot {
  const input = ImportedApHistoryInputSchema.parse(value);
  const entryKey = `pdf-${input.importDigest.slice(0, 16)}`;

  return ApHistorySnapshotSchema.parse({
    schemaVersion: AP_HISTORY_SNAPSHOT_VERSION,
    origin: 'pdf-import',
    importDigest: input.importDigest,
    libraryEntryId: entryKey,
    course: 'apush',
    essayType: input.essayType,
    prompt: input.prompt,
    period: input.period,
    periodNumber: input.periodNumber,
    reasoningSkill: input.reasoningSkill,
    sources: input.sources.map((source) => ({
      externalKey: `${entryKey}-doc-${source.position}`,
      position: source.position,
      title: source.title,
      attribution: source.attribution,
      body: source.body,
      caption: null,
      mediaType: 'text' as const,
      imageUrl: null,
      imageAlt: null,
      provenanceUrl: input.provenanceUrl,
      licenseName: AP_HISTORY_PUBLIC_DOMAIN_LICENSE,
      licenseUrl: AP_HISTORY_PUBLIC_DOMAIN_LICENSE_URL,
    })),
    rubric: rubricForEssayType(input.essayType),
    timing: {
      mode: input.timeMode,
      durationMinutes: input.durationMinutes,
    },
  });
}
