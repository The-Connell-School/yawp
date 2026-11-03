// The Thesis-Driven Essay has no `kind` or `systemKey`; its title is what marks
// it, here and on its assignment type page. Free-tier localhost also exposes
// "Thesis Statement" (`kind: thesis_statement`) with the same prompt library.
const THESIS_ESSAY_TITLE = 'the thesis-driven essay';
const THESIS_STATEMENT_TITLE = 'thesis statement';
export const THESIS_STATEMENT_KIND = 'thesis_statement';

export function isThesisDrivenEssayTitle(title: string) {
  return title.trim().toLowerCase() === THESIS_ESSAY_TITLE;
}

export function isThesisPromptLibraryType(input: {
  title: string;
  kind?: string | null;
}) {
  if (input.kind === THESIS_STATEMENT_KIND) return true;
  if (isThesisDrivenEssayTitle(input.title)) return true;
  return input.title.trim().toLowerCase() === THESIS_STATEMENT_TITLE;
}
