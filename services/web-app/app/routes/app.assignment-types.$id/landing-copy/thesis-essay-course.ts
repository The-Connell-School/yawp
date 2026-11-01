// The Thesis-Driven Essay course: the eight lessons a teacher teaches, in
// order, with the materials each comes with. The Tutor's steps in a student's
// essay follow the same order.
//
// Rows and titles are Brian's (his mock-up of the course card). The slide
// decks are his Lesson Deck Kit decks; the lesson plans are his PDFs from the
// Teachers' Lounge course of the same name. Both are served as static files
// from public/courses/thesis-driven-essay, next to the "See how it works"
// clips. To update one, replace the file and keep its name.
//
// Body paragraphs takes two class periods: the body paragraphs deck, then the
// supporting quotes deck ("Step four, continued").

export const THESIS_ESSAY_COURSE_TITLE = 'The Thesis-Driven Essay course';

const DIR = '/courses/thesis-driven-essay';

export type CourseFile = {
  /** Where the file is served. */
  href: string;
  /** What it saves as. */
  fileName: string;
};

export type CourseDeck = CourseFile & {
  /** "Slide deck", or what sets a lesson's second deck apart. */
  label: string;
};

export type CourseLesson = {
  title: string;
  lessonPlan: CourseFile | null;
  decks: CourseDeck[];
};

const plan = (file: string, fileName: string): CourseFile => ({
  href: `${DIR}/${file}`,
  fileName,
});

const deck = (file: string, fileName: string, label = 'Slide deck'): CourseDeck => ({
  href: `${DIR}/${file}`,
  fileName,
  label,
});

export const THESIS_ESSAY_COURSE: CourseLesson[] = [
  {
    title: 'Introduce students to Yawp!',
    lessonPlan: plan(
      '01-lesson-plan-introduce-students-to-yawp.pdf',
      'Lesson Plan - Introduce Students to Yawp!.pdf'
    ),
    decks: [deck('01-introduction-to-yawp.pptx', 'Introduction to Yawp!.pptx')],
  },
  {
    title: 'Pre-writing',
    lessonPlan: plan('02-lesson-plan-pre-writing.pdf', 'Lesson Plan - Pre-writing.pdf'),
    decks: [deck('02-pre-writing.pptx', 'Pre-Writing.pptx')],
  },
  {
    title: 'Developing a thesis statement',
    lessonPlan: plan(
      '03-lesson-plan-thesis-statement.pdf',
      'Lesson Plan - Thesis Statement.pdf'
    ),
    decks: [
      deck('03-develop-your-thesis-statement.pptx', 'Develop Your Thesis Statement.pptx'),
    ],
  },
  {
    title: 'Introduction paragraph',
    lessonPlan: plan(
      '04-lesson-plan-introduction-paragraph.pdf',
      'Lesson Plan - Introduction Paragraph.pdf'
    ),
    decks: [deck('04-introduction-paragraph.pptx', 'Introduction Paragraph.pptx')],
  },
  {
    title: 'Body paragraphs',
    lessonPlan: plan(
      '05-lesson-plan-body-paragraphs.pdf',
      'Lesson Plan - Body Paragraphs.pdf'
    ),
    decks: [
      deck('05-body-paragraphs.pptx', 'Body Paragraphs.pptx'),
      deck('05-supporting-quotes.pptx', 'Supporting Quotes.pptx', 'Supporting quotes'),
    ],
  },
  {
    title: 'The conclusion',
    lessonPlan: plan(
      '06-lesson-plan-conclusion-paragraph.pdf',
      'Lesson Plan - Conclusion Paragraph.pdf'
    ),
    decks: [deck('06-conclusion-paragraph.pptx', 'Conclusion Paragraph.pptx')],
  },
  {
    title: 'Titling your essay',
    lessonPlan: null,
    decks: [deck('07-titles-and-formatting.pptx', 'Titles and Formatting.pptx')],
  },
  {
    title: 'Review my essay',
    lessonPlan: null,
    decks: [],
  },
];
