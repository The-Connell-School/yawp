import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';
import { isThesisDrivenEssayTitle } from '~/domain/assignment-types/thesis-driven-essay';
import { isExitTicketAssignmentType } from '~/domain/assignment-types/exit-ticket';
import { resolvePromptLibraryVariant } from '../prompts-library/library-variant';
import { HOW_ITS_GRADED_INTRO } from '../about-daily-pages/content';

type TypeIdentity = { title: string; description?: string | null; kind?: string | null; systemKey?: string | null };
export function isFiveParagraph(title: string) {
  return /(?:5|five)[ -]paragraph/i.test(title);
}

export function typeGuideContent(type: TypeIdentity, gradesGrammar: boolean) {
  const variant = resolvePromptLibraryVariant(type);
  const thesis = isThesisDrivenEssayTitle(type.title);
  const five = isFiveParagraph(type.title);
  const exit = isExitTicketAssignmentType(type);
  const ap = type.systemKey === AP_HISTORY_ASSIGNMENT_TYPE_KEY;
  const daily = variant === 'daily-pages-graded' || type.kind === 'daily_pages';
  const starter = variant === 'class-starter';
  const baseGrading = "The grading assistant scores each paper against the type's rubric";
  const rubricGrading = `${baseGrading}${thesis || five ? ', out of 100 points by default.' : '.'}${gradesGrammar ? ' Grammar and syntax count unless you turn them off for an assignment.' : ''}`;
  return {
    whatStudentsWrite: thesis
      ? 'A formal, thesis-driven critical essay: introduction, thesis statement, body paragraphs and a conclusion, on an angle the student chooses.'
      : five ? 'The classic five-paragraph form: an introduction that ends on a thesis, three body paragraphs, and a conclusion.'
      : starter ? 'An open-ended freewrite to begin class.'
      : daily ? 'Short, low-stakes writing practice tied to your prompt: bell ringers, exit tickets, and journal reflections.'
      : exit ? 'A short explanation in their own words of what they understood from the lesson.'
      : ap ? 'A document-based question (DBQ) using its source set, or a long essay question (LEQ).'
      : type.description ?? '',
    gradingLabel: starter ? 'Graded on effort' : daily ? 'Graded on engagement' : exit ? 'Optional grading' : ap ? 'AP rubric points' : 'Graded on a rubric',
    howItsGraded: starter
      ? 'Graded on effort: did the student write, and did they reflect. Feedback is about their ideas, not rubric scores or correctness.'
      : daily ? HOW_ITS_GRADED_INTRO
      : exit ? 'Every response is read and given feedback on how much of the idea the student can explain. Grading is optional; you choose whether the score counts in the gradebook.'
      : ap ? 'Every rubric point is all-or-nothing. Grammar and spelling slips never cost a point. Feedback comes back point by point for you to review and override before releasing grades.'
      : rubricGrading,
    teachingGuideBlurb: thesis ? "Why open-ended prompts get the best writing, and what to tell a student who's stuck."
      : starter ? 'How to invite a freewrite and keep the focus on ideas and reflection.'
      : daily ? 'What engagement looks like, how the tiers work, and how to write a useful prompt.'
      : exit ? 'How to ask for understanding, make honesty useful, and read the responses before the next lesson.'
      : ap ? 'How DBQs and LEQs work, and what each rubric point asks students to do.' : '',
    sparsePromptCopy: five
      ? "There's no prompt library here. Any question that calls for a clear claim and three supporting points works."
      : "There's no prompt library for this type. Write the prompt in New assignment.",
    tutorOn: !exit,
  };
}

export function moduleGuide(title: string, fiveParagraph = false) {
  const normalized = title.toLowerCase().replace(/[^a-z]/g, '');
  const variants: Record<string, [string, string]> = {
    prewriting: ['Pre-writing', 'Students pick a topic and gather ideas before they draft.'],
    thesis: ['Thesis', 'Students write the one-sentence claim the essay will prove.'],
    thesisstatement: ['Thesis', 'Students write the one-sentence claim the essay will prove.'],
    writingyourthesisstatement: ['Thesis', 'Students write the one-sentence claim the essay will prove.'],
    introduction: ['Introduction', 'Students open with a way in and end the paragraph on the thesis.'],
    introductionparagraph: ['Introduction', 'Students open with a way in and end the paragraph on the thesis.'],
    bodyparagraphs: ['Body paragraphs', `${fiveParagraph ? 'Three paragraphs' : 'Paragraphs'}, each with a topic sentence and support for the thesis.`],
    conclusion: ['Conclusion', 'Students restate the thesis in new words and close the argument.'],
    conclusionparagraph: ['Conclusion', 'Students restate the thesis in new words and close the argument.'],
    titleyouressay: ['Title', 'Students name the essay once they know what it says.'],
    reviewmyessay: ['Review', 'Students reread, revise, and check the essay before they submit.'],
  };
  const known = variants[normalized];
  return known ? { label: known[0], oneLiner: known[1] } : { label: title, oneLiner: '' };
}
export function numberWord(n: number) {
  return ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'][n] ?? String(n);
}
