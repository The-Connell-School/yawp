import * as thesis from '../thesis-prompts-library/data';
import * as freewrite from '../prompts-library/data';
import * as shortForm from '../short-form-prompts-library/data';
import { paginatePrompts } from '../thesis-prompts-library/pagination';

export type Corpus = 'thesis' | 'freewrite' | 'short-form';
export type PromptEntry =
  | thesis.ThesisLibraryEntry
  | freewrite.LibraryEntry
  | shortForm.ShortFormLibraryEntry;
export type LibraryData = {
  prompts: PromptEntry[];
  facets: Record<string, string[]>;
  optionCounts: Record<string, Record<string, number>>;
  totalCount: number;
};
export type FacetSpec = { key: string; param: string; label: string };
const LABELS: Record<string, string> = {
  ...thesis.CATEGORY_LABEL,
  ...thesis.COGNITIVE_MOVE_LABEL,
  ...thesis.SOURCE_NEED_LABEL,
  ...freewrite.COGNITIVE_MOVE_LABEL,
  ...freewrite.PROMPT_TYPE_LABEL,
  ...freewrite.SERIOUSNESS_LABEL,
  ...shortForm.KIND_LABEL,
  ...shortForm.COGNITIVE_MOVE_LABEL,
};
export function optionLabel(value: string) {
  return LABELS[value] ?? value;
}
export function collectionPage<T extends { collection: string }>(
  items: readonly T[],
  collection: string | null,
  requested: string | null
) {
  const filtered = items.filter(
    (p) => p.collection === (collection === 'mine' ? 'mine' : 'library')
  );
  return { ...paginatePrompts(filtered, requested), total: filtered.length };
}
export function libraryAdapter(corpus: Corpus) {
  const keys =
    corpus === 'thesis'
      ? thesis.FACET_KEYS
      : corpus === 'freewrite'
        ? freewrite.FACET_KEYS
        : shortForm.FACET_KEYS;
  const facetLabels: Record<string, string> = {
    categories: 'Category',
    subjects: 'Subject',
    textsOrUnits: corpus === 'freewrite' ? 'Text / unit' : 'Text',
    cognitiveMoves: 'Cognitive mode',
    sourceNeeds: 'Source text',
    gradeBands: 'Grade band',
    themes: 'Theme',
    types: 'Type',
    seriousness: 'Seriousness',
    kinds: 'Kind',
    lengthTargets: 'Length',
  };
  return {
    searchParam: keys.search,
    collectionParam: keys.collections,
    facets: Object.entries(keys)
      .filter(([key]) => key !== 'search' && key !== 'collections')
      .map(([key, param]) => ({ key, param, label: facetLabels[key] })),
    saveAction:
      corpus === 'thesis'
        ? '/api/domain/thesis-prompt-save'
        : '/api/domain/daily-pages-prompt-save',
    card(entry: PromptEntry) {
      const subject =
        'subjects' in entry
          ? (entry.subjects[0] ?? '')
          : 'themes' in entry
            ? (entry.themes[0] ?? '')
            : '';
      const thinking = entry.cognitiveMoves[0]
        ? optionLabel(entry.cognitiveMoves[0])
        : '';
      const grades = entry.gradeBands.length
        ? `Grades ${entry.gradeBands.join(', ')}`
        : '';
      return {
        title:
          'title' in entry
            ? entry.title
            : shortForm.deriveTitleFromPrompt(entry.prompt),
        badge: optionLabel(
          ('category' in entry
            ? entry.category
            : 'kind' in entry
              ? entry.kind
              : entry.type) ?? 'My prompt'
        ),
        meta: [subject, thinking, grades].filter(Boolean).join(' · '),
        mobileMeta: [thinking, grades].filter(Boolean).join(' · '),
      };
    },
    saveFields(entry: PromptEntry): Record<string, string> {
      return corpus === 'thesis'
        ? {
            title:
              'title' in entry
                ? entry.title
                : shortForm.deriveTitleFromPrompt(entry.prompt),
          }
        : {
            facets: JSON.stringify({
              ...('type' in entry && entry.type ? { type: entry.type } : {}),
              ...('seriousness' in entry && entry.seriousness
                ? { seriousness: entry.seriousness }
                : {}),
              cognitiveMoves: entry.cognitiveMoves,
            }),
          };
    },
  };
}
