import expansionSource from './library/gba300-international-expansion.json';
import etiquetteSource from './library/gba300-international-etiquette.json';
import { parseRubricSchema, type RubricSchema } from './rubric-schema';

function loadBundledRubric(source: unknown, label: string): RubricSchema {
  const parsed = parseRubricSchema(source);
  if (!parsed.ok) {
    throw new Error(`Invalid bundled ${label} rubric: ${parsed.error}`);
  }
  return parsed.schema;
}

export const GBA300_INTERNATIONAL_EXPANSION = loadBundledRubric(
  expansionSource,
  'GBA 300 International Expansion'
);

export const GBA300_INTERNATIONAL_ETIQUETTE = loadBundledRubric(
  etiquetteSource,
  'GBA 300 International Etiquette'
);
