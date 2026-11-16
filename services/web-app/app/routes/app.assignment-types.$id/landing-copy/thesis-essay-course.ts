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
// The tutorial videos are Brian's (Nov 14): one per lesson, recorded for the
// teacher, in public/courses/thesis-driven-essay/tutorials with a poster
// (.jpg) and captions (.vtt) beside each. They were compressed from his Loom
// recordings to fit in the repository, with the black bars above and below
// his slides cropped off, and the captions are Loom's, made by machine. To
// update one, replace its three files and its length in seconds.
//
// The first lesson also hands out Yawp!'s grading rubric for the essay and a
// sample essay, "Bored in the USA" (Michael, Nov 16), as PDFs beside the
// decks. To update one, replace the file and keep its name.
//
// Body paragraphs takes two class periods: the body paragraphs deck, then the
// supporting quotes deck ("Step four, continued").

import type { YawpLessonSlug } from '~/domain/lesson-planner/yawp-lessons';

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

export type CourseHandout = CourseFile & {
  /** What it is, as the link reads: "Rubric", "Sample essay". */
  label: string;
};

export type CourseTutorial = {
  /** What the video teaches. Shown above it where a lesson has two. */
  title: string;
  /** Where the video is served (MP4). */
  src: string;
  /** A still from it, shown until it plays. */
  poster: string;
  /** Its captions (WebVTT). */
  captions: string;
  /** How long it runs, to the minute. */
  minutes: number;
  /** How long it runs, in whole seconds: what the Lounge counts watching against. */
  seconds: number;
};

export type CourseLesson = {
  title: string;
  lessonPlan: CourseFile | null;
  decks: CourseDeck[];
  /** PDFs for the class, listed under the deck(s). */
  handouts: CourseHandout[];
  /** Brian's tutorial video(s) for the teacher. None: no "Watch tutorial". */
  tutorials: CourseTutorial[];
  /**
   * The same lesson in the Yawp! lesson catalog (yawp-lessons.ts), ready to
   * open as a stack in the teacher's Lesson Planner. With the lesson plans
   * flag on, "Lesson plan" opens this instead of the PDF. Null: PDF only.
   */
  yawpLesson: YawpLessonSlug | null;
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

const handout = (file: string, fileName: string, label: string): CourseHandout => ({
  href: `${DIR}/${file}`,
  fileName,
  label,
});

const tutorial = (file: string, title: string, seconds: number): CourseTutorial => ({
  title,
  src: `${DIR}/tutorials/${file}.mp4`,
  poster: `${DIR}/tutorials/${file}.jpg`,
  captions: `${DIR}/tutorials/${file}.vtt`,
  minutes: Math.round(seconds / 60),
  seconds,
});

/** The videos' frame: his slides at 16:9, with the recording's black bars cropped off. */
export const COURSE_TUTORIAL_SIZE = { width: 1080, height: 608 } as const;

export const THESIS_ESSAY_COURSE: CourseLesson[] = [
  {
    title: 'Introduce students to Yawp!',
    lessonPlan: plan(
      '01-lesson-plan-introduce-students-to-yawp.pdf',
      'Lesson Plan - Introduce Students to Yawp!.pdf'
    ),
    decks: [deck('01-introduction-to-yawp.pptx', 'Introduction to Yawp!.pptx')],
    handouts: [
      handout('01-thesis-driven-essay-rubric.pdf', 'Yawp! Thesis-Driven Essay Rubric.pdf', 'Rubric'),
      handout('01-sample-essay-bored-in-the-usa.pdf', 'Sample Essay - Bored in the USA.pdf', 'Sample essay'),
    ],
    tutorials: [
      tutorial('01-introducing-the-thesis-driven-essay', 'Introducing the thesis-driven essay', 788),
    ],
    yawpLesson: 'introduce-students-to-yawp',
  },
  {
    title: 'Pre-writing',
    lessonPlan: plan('02-lesson-plan-pre-writing.pdf', 'Lesson Plan - Pre-writing.pdf'),
    decks: [deck('02-pre-writing.pptx', 'Pre-Writing.pptx')],
    handouts: [],
    tutorials: [tutorial('02-pre-writing', 'Pre-writing', 827)],
    yawpLesson: 'pre-writing',
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
    handouts: [],
    tutorials: [tutorial('03-thesis-statement', 'Developing a thesis statement', 768)],
    yawpLesson: 'thesis-statement',
  },
  {
    title: 'Introduction paragraph',
    lessonPlan: plan(
      '04-lesson-plan-introduction-paragraph.pdf',
      'Lesson Plan - Introduction Paragraph.pdf'
    ),
    decks: [deck('04-introduction-paragraph.pptx', 'Introduction Paragraph.pptx')],
    handouts: [],
    tutorials: [tutorial('04-introduction-paragraph', 'Introduction paragraph', 636)],
    yawpLesson: 'introduction-paragraph',
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
    handouts: [],
    tutorials: [
      tutorial('05-body-paragraphs', 'Body paragraphs', 651),
      tutorial('05-supporting-quotes', 'Supporting quotes', 297),
    ],
    yawpLesson: 'body-paragraphs',
  },
  {
    title: 'The conclusion',
    lessonPlan: plan(
      '06-lesson-plan-conclusion-paragraph.pdf',
      'Lesson Plan - Conclusion Paragraph.pdf'
    ),
    decks: [deck('06-conclusion-paragraph.pptx', 'Conclusion Paragraph.pptx')],
    handouts: [],
    tutorials: [tutorial('06-conclusion-paragraph', 'The conclusion', 567)],
    yawpLesson: 'conclusion-paragraph',
  },
  {
    title: 'Titling your essay',
    lessonPlan: null,
    decks: [deck('07-titles-and-formatting.pptx', 'Titles and Formatting.pptx')],
    handouts: [],
    tutorials: [tutorial('07-titles-and-formatting', 'Titles and formatting', 336)],
    yawpLesson: null,
  },
  {
    title: 'Review my essay',
    lessonPlan: null,
    decks: [],
    handouts: [],
    tutorials: [],
    yawpLesson: null,
  },
];
