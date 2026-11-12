// The Thesis-Driven Essay has no `kind` or `systemKey`; its title is what marks
// it, here and on its assignment type page.
const THESIS_ESSAY_TITLE = 'the thesis-driven essay';

export function isThesisDrivenEssayTitle(title: string) {
  return title.trim().toLowerCase() === THESIS_ESSAY_TITLE;
}
