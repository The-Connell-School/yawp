import { resolveDisplayOptions } from './rubric-display-options';
import type { RubricDisplayConfig } from './rubric-display';
import { readDisplaySnapshotFromAiMeta } from './submission-display-options';

export {
  derivedPerCategoryCommentsFromCategories,
  grammarHighlightingEnabledForDisplay,
  readDisplaySnapshotFromAiMeta,
  rubricDisplayConfigurationIsExplicit,
} from './submission-display-options';

export function resolveDisplayForSubmissionView({
  rubricConfig,
  outputSchema,
  grammarGradingEnabled,
  aiMeta,
}: {
  rubricConfig: RubricDisplayConfig;
  outputSchema: unknown;
  grammarGradingEnabled?: boolean | null;
  aiMeta?: unknown;
}): RubricDisplayConfig {
  const snapshot = readDisplaySnapshotFromAiMeta(aiMeta);
  const display =
    snapshot ??
    resolveDisplayOptions(outputSchema, rubricConfig.categories, {
      grammarGradingEnabled,
    });
  return { ...rubricConfig, display };
}
