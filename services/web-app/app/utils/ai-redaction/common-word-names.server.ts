/**
 * First names that are also ordinary English words.
 *
 * Redacting a name out of a short structured field ("Student first name:
 * Will") is safe to do case-insensitively. Redacting it out of an essay is
 * not: a student named Will, Grace, or Rose writes hundreds of words in
 * which those letters are a verb, a noun, or an adverb, and blindly
 * swapping every one of them would hand the model a mangled essay and cost
 * us the grading quality the redaction is supposed to leave untouched.
 *
 * For these names only, prose redaction requires the capitalized form, so
 * "Will you help" survives while "Will wrote this essay" is redacted. The
 * residual risk is a sentence-initial common word that happens to be the
 * student's name ("Will power matters" for a student named Will), which
 * redacts a word that was not a reference to the student. That is the safe
 * direction to err: it costs a little essay fidelity rather than leaking a
 * name.
 *
 * Lowercase entries only - membership is tested against `name.toLowerCase()`.
 */
export const COMMON_WORD_FIRST_NAMES = new Set([
  'art',
  'bill',
  'bob',
  'brook',
  'brooke',
  'chase',
  'dawn',
  'don',
  'drew',
  'faith',
  'frank',
  'grace',
  'gray',
  'grey',
  'guy',
  'hope',
  'indigo',
  'jack',
  'jean',
  'joy',
  'justice',
  'lane',
  'mark',
  'may',
  'mercy',
  'miles',
  'nick',
  'pat',
  'patience',
  'penny',
  'ray',
  'reed',
  'rich',
  'robin',
  'rose',
  'rusty',
  'sawyer',
  'sky',
  'sunny',
  'summer',
  'wade',
  'will',
  'wren',
]);

export function isCommonWordFirstName(name: string): boolean {
  return COMMON_WORD_FIRST_NAMES.has(name.trim().toLowerCase());
}
