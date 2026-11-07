/**
 * The Yawp! lesson catalog (How to Teach It → lesson plans, Kevin, Nov 5):
 * Brian's Thesis-Driven Essay lessons, ready to open in a teacher's own
 * Lesson Planner as a stack.
 *
 * Each lesson is written the way the planner writes a plan, so it files
 * through the same path "Add everything" uses (`fileReplyPieces`): a title,
 * an overview, then one `## Step (N min)` heading per step holding a
 * `yawp-material` block with the step's minutes and type.
 *
 * Every step is a notes block rather than a bare heading on purpose. A bare
 * step whose title or text mentions a thesis, a pre-write or "students write"
 * grows a "Create … in Yawp!" button with the step's first line as the prompt
 * (stack-create-link.ts), which is wrong here: the assignment already exists,
 * made from the Prompt Library. A notes block gets the type chip, the minutes
 * and the writing badge (`type: thesis_essay` counts as writing time) and no
 * button. Step titles also keep the word "thesis" for the writing step alone:
 * the stack counts any step whose title names an assignment type as writing
 * (step-types.ts), and a mini-lesson about thesis statements is not writing
 * time. `yawp-lessons.test.ts` pins all of that for every lesson.
 *
 * The text is Brian's, from his lesson plan PDFs (the Teachers' Lounge course,
 * also linked from each lesson), with minutes added to fill a 50-minute
 * period. The slide decks are his Lesson Deck Kit decks, served next to the
 * PDFs from public/courses/thesis-driven-essay (see thesis-essay-course.ts).
 */

export const YAWP_LESSON_SLUGS = [
  'introduce-students-to-yawp',
  'pre-writing',
  'thesis-statement',
  'introduction-paragraph',
  'body-paragraphs',
  'conclusion-paragraph',
] as const;

export type YawpLessonSlug = (typeof YAWP_LESSON_SLUGS)[number];

export type YawpLessonFile = {
  /** Where the file is served. */
  href: string;
  /** What it saves as. */
  fileName: string;
};

export type YawpLesson = {
  slug: YawpLessonSlug;
  /** The lesson's name, as the course card and the stack page show it. */
  title: string;
  /** Which lesson of the course this is, from one. */
  lessonNumber: number;
  /** How long the plan runs: every step's minutes add up to this. */
  periodMinutes: number;
  /** Brian's slide deck (PowerPoint). */
  deck: YawpLessonFile;
  /** Brian's original lesson plan (PDF), for teachers who want the page. */
  lessonPlanPdf: YawpLessonFile;
  /** The plan, in the planner's reply format. */
  plan: string;
};

export const YAWP_COURSE_TITLE = 'The Thesis-Driven Essay course';

/** Where a Yawp! lesson opens: the route that makes (or finds) the teacher's copy. */
export const YAWP_LESSON_PATH = '/app/lesson-planner/yawp';

export function yawpLessonHref(slug: YawpLessonSlug): string {
  return `${YAWP_LESSON_PATH}/${slug}`;
}

export function isYawpLessonSlug(value: string | undefined | null): value is YawpLessonSlug {
  return (YAWP_LESSON_SLUGS as readonly string[]).includes(value ?? '');
}

export function yawpLesson(slug: string | undefined | null): YawpLesson | null {
  return isYawpLessonSlug(slug) ? YAWP_LESSONS[slug] : null;
}

/** What the teacher's turn says in the chat above the plan. */
export function yawpLessonRequest(lesson: YawpLesson): string {
  return `Open the Yawp! lesson “${lesson.title}” (Lesson ${lesson.lessonNumber} of ${YAWP_COURSE_TITLE}).`;
}

const DIR = '/courses/thesis-driven-essay';

const file = (name: string, fileName: string): YawpLessonFile => ({
  href: `${DIR}/${name}`,
  fileName,
});

type Step = {
  title: string;
  minutes: number;
  type: 'class_starter' | 'activity' | 'context' | 'read_aloud' | 'daily_pages' | 'thesis_essay' | 'closing';
  body: string[];
};

/**
 * The plan as a reply: `# title`, the overview, the materials, then each step
 * as a heading over its notes block. Minutes sit in the heading (for the
 * chat's chip) and in the block (for the stack).
 */
function plan({
  title,
  overview,
  deck,
  lessonPlanPdf,
  steps,
}: {
  title: string;
  overview: string[];
  deck: YawpLessonFile;
  lessonPlanPdf: YawpLessonFile;
  steps: Step[];
}): string {
  const lines: string[] = [`# ${title}`, '', ...overview.flatMap((paragraph) => [paragraph, ''])];
  lines.push(
    '**Materials:** ' +
      `[${deck.fileName.replace(/\.pptx$/, '')} (slide deck)](${deck.href}), ` +
      `[Brian’s original lesson plan (PDF)](${lessonPlanPdf.href}), ` +
      'and student laptops or Chromebooks with access to yawp.school.',
    ''
  );
  for (const step of steps) {
    lines.push(
      `## ${step.title} (${step.minutes} min)`,
      '',
      '```yawp-material',
      'kind: notes',
      `title: ${step.title}`,
      `minutes: ${step.minutes}`,
      `type: ${step.type}`,
      '---',
      ...step.body,
      '```',
      ''
    );
  }
  return lines.join('\n').trim();
}

const INTRODUCE: YawpLesson = {
  slug: 'introduce-students-to-yawp',
  title: 'Introduce students to Yawp!',
  lessonNumber: 1,
  periodMinutes: 50,
  deck: file('01-introduction-to-yawp.pptx', 'Introduction to Yawp!.pptx'),
  lessonPlanPdf: file(
    '01-lesson-plan-introduce-students-to-yawp.pdf',
    'Lesson Plan - Introduce Students to Yawp!.pdf'
  ),
  plan: '',
};
INTRODUCE.plan = plan({
  title: INTRODUCE.title,
  overview: [
    'In this lesson, students are introduced to the Yawp! assignment and create their Yawp! accounts.',
    '**Students will** understand the purpose and philosophy of the Yawp! assignment, read a sample essay, and create their accounts and complete the Welcome Exercise. **You will** explain Yawp!, lead a brief discussion of the sample essay, and walk students through account creation.',
  ],
  deck: INTRODUCE.deck,
  lessonPlanPdf: INTRODUCE.lessonPlanPdf,
  steps: [
    {
      title: 'Opening game: Two Truths and a Lie',
      minutes: 8,
      type: 'activity',
      body: [
        'Open with the game “Two Truths and a Lie.” This is designed simply to engage students in a fun way at the top of the program.',
      ],
    },
    {
      title: 'Define Yawp!',
      minutes: 10,
      type: 'context',
      body: [
        '- Using Walt Whitman’s quote, define the term “yawp” for the students.',
        '- Using the slides, discuss why we write. This creates shared context and understanding of “What’s the point of this?”',
      ],
    },
    {
      title: 'Read the sample essay',
      minutes: 15,
      type: 'read_aloud',
      body: [
        'Read the sample essay together. Don’t overanalyze or get in the weeds here. Let students connect to it, and then help them find the thesis statement.',
      ],
    },
    {
      title: 'Onboard students to yawp.school',
      minutes: 12,
      type: 'activity',
      body: [
        '- Use the instructions in the Resources. Note: the website is simply **yawp.school**; there is no “www” or “.com”.',
        '- Instruct students to open the “Welcome to Yawp!” course, create a document, and complete the Welcome Exercise.',
      ],
    },
    {
      title: 'Closing: what’s next',
      minutes: 5,
      type: 'closing',
      body: [
        'Tell students what comes next: the essay prompt, and a lesson on pre-writing, the first step of the Yawp! writing process. Anyone who didn’t finish the Welcome Exercise finishes it before next class.',
      ],
    },
  ],
});

const PRE_WRITING: YawpLesson = {
  slug: 'pre-writing',
  title: 'Pre-writing',
  lessonNumber: 2,
  periodMinutes: 50,
  deck: file('02-pre-writing.pptx', 'Pre-Writing.pptx'),
  lessonPlanPdf: file('02-lesson-plan-pre-writing.pdf', 'Lesson Plan - Pre-writing.pdf'),
  plan: '',
};
PRE_WRITING.plan = plan({
  title: PRE_WRITING.title,
  overview: [
    'In this lesson, students explore what they’re going to write about and learn how pre-writing is one of the most important parts of the critical thinking and writing process.',
    '**Students will** review the assignment prompt, understand what “critical thinking” is, pre-write on the topic, and narrow their topic by identifying “the diamonds.” **You will** introduce the essay prompt, break down “critical thinking,” and lead students in the pre-writing activity.',
  ],
  deck: PRE_WRITING.deck,
  lessonPlanPdf: PRE_WRITING.lessonPlanPdf,
  steps: [
    {
      title: 'Opening game: What’s happening in this picture?',
      minutes: 6,
      type: 'activity',
      body: [
        'Open with the game “What’s happening in this picture?” This is designed to engage students in a shared experience of critical thinking that involves observation and analysis.',
      ],
    },
    {
      title: 'Introduce the essay prompt',
      minutes: 6,
      type: 'context',
      body: [
        'Introduce the essay prompt. Break the prompt down a little, particularly the guidelines for the type of essay they’re being asked to write (formal, thesis, intro, body paragraphs, conclusion). Optional: engage students by asking them to share some of their initial ideas.',
        '',
        'Let the students know that you’re going to teach them what to do when they get an essay prompt. You might ask them how they feel when they first read a prompt: anxious? overwhelmed? confused? excited? It can definitely feel like a lot to write an essay, but you’re going to show them a practical process for getting started.',
      ],
    },
    {
      title: 'Why we pre-write before we argue',
      minutes: 8,
      type: 'context',
      body: [
        'Use the Critical Essay Form slide or handout to point students to the importance of the thesis statement: you can’t begin writing an essay without first developing your thesis statement. Tell them that developing that thesis statement takes some time, and it begins with critical thinking: figuring out what we think about a topic.',
      ],
    },
    {
      title: 'Mini-lesson: turning “I loved it” into analysis',
      minutes: 8,
      type: 'context',
      body: [
        'Explain how we often know what we feel about a topic, but we sometimes don’t know *why* we feel that way.',
        '',
        '- **Three friends walk into a movie.** Ask the class to imagine we all go see a movie together (ask them for a popular title to include them). When we come out, student A (use an actual student) says, “I loved that movie!” You say, “Great! Why’d you love it?” “Because it was awesome!” “Why was it awesome?” “Because I loved it.” Student A knows how she feels but can’t explain it, can’t answer *why?* She’s failing to offer critical analysis. Another student says, “I hated it.” (Why?) “Because it sucked.” (Why?) “Because I hated it.” They know how they feel, but they can’t turn their reaction into analysis. **Critical thinking is the key to turning your opinions into smart, scholarly analysis.**',
        '- **The 5-year-old.** Have you ever been around a 5-year-old who asks a lot of questions? Why? Why? Why?',
        '',
        'Go over the Pre-Writing slides and read the example about Creed or Disney movies. Explain, in detail, the process they’re about to go through.',
      ],
    },
    {
      title: 'Writing time: students pre-write in Yawp!',
      minutes: 17,
      type: 'thesis_essay',
      body: [
        'Students log on to yawp.school and open their documents. Make sure they are on the **Pre-Write** module before they begin.',
        '',
        '- Ask students if they have any questions before they begin their own pre-write on the prompt.',
        '- Tell them to follow the instructions the Tutor gives them. For best results, remind them: don’t worry about grammar, syntax or organization; don’t edit as you go, just get it all out; pre-writing is a purging of sorts, so anything goes; ask and answer questions; the more you write at this stage, the better.',
        '- Work the room. After several minutes, ask individual students if you can quickly read their work. Check in with anyone who isn’t writing. Give positive and constructive feedback.',
        '- After about 5 minutes, ask them to read over what they’ve written and ask the Tutor for feedback: “It’s always a good idea to read over what you just wrote. When we pre-write we’re in a flow state and might not be fully aware of what we’re saying. Some of it may be messy and not useful at all, but other moments will stand out as interesting, good, complex, or worthy of more discussion.”',
        '- The Tutor helps students identify their “diamonds in the rough,” the specific subtopics coming up in their pre-write, and asks them to choose a diamond and pre-write on that. As they continue, their ideas become more specific and interesting, until they find the specific focus for their essay. The Tutor concludes the pre-writing process with them.',
      ],
    },
    {
      title: 'Closing: What have we learned today?',
      minutes: 5,
      type: 'closing',
      body: [
        'Closing slides. Direct students’ attention to the slide and ask individual students to read each point aloud.',
      ],
    },
  ],
});

const THESIS: YawpLesson = {
  slug: 'thesis-statement',
  title: 'Developing a thesis statement',
  lessonNumber: 3,
  periodMinutes: 50,
  deck: file('03-develop-your-thesis-statement.pptx', 'Develop Your Thesis Statement.pptx'),
  lessonPlanPdf: file('03-lesson-plan-thesis-statement.pdf', 'Lesson Plan - Thesis Statement.pdf'),
  plan: '',
};
THESIS.plan = plan({
  title: THESIS.title,
  overview: [
    'Students learn how to write a thesis statement.',
    '**Students will** see how pre-writing about specific points leads to more complex, sophisticated ideas; understand what a thesis statement is; understand how observation and analysis create strong, complex thesis statements; write their own observation and analysis on their topic; and use them to write a thesis statement.',
  ],
  deck: THESIS.deck,
  lessonPlanPdf: THESIS.lessonPlanPdf,
  steps: [
    {
      title: 'Opening activity: observation and analysis',
      minutes: 7,
      type: 'activity',
      body: [
        'Show students the photograph on the board and ask them to observe and analyze it. Ask, “What’s happening in this picture?” When students offer theories, ask, “What do you see in the picture that makes you say that?” Stand next to the slide and point out details the students might be seeing.',
        '',
        'The purpose is to teach the relationship between observation and analysis, so students understand how to use both in their thesis statements.',
      ],
    },
    {
      title: 'Where is the class: more pre-writing, or ready to move on?',
      minutes: 5,
      type: 'context',
      body: [
        'Depending on where you are as a class, students may need to pre-write more on their specific “diamonds” to get more ideas out. In other cases they may already have found their specific focus (the goal of pre-writing) and be ready for thesis statements. Use your judgment, based on what you see on student docs: if they have identified specific areas of focus, they’re ready; if they could benefit from more pre-writing, give them some time at the start.',
      ],
    },
    {
      title: 'The Critical Essay Form: where the argument starts',
      minutes: 4,
      type: 'context',
      body: [
        'Using the Critical Essay Form handout or slide, do a quick review of the importance and role of the thesis statement.',
      ],
    },
    {
      title: 'Mini-lesson: observation + analysis = your claim',
      minutes: 14,
      type: 'context',
      body: [
        'Using the slide deck, talk about how all the pre-writing up to this point has let students get ideas out and find a focus for their essay. Now they’re ready to write their thesis statement.',
        '',
        '- Define thesis statement. Many students have never written an essay like this before, so a thesis statement might be a very abstract concept to them. Don’t dwell on this.',
        '- Go through the slides that define a thesis statement; have students read parts of the slides if it helps keep them engaged.',
        '- Go through the slides on **observation**. Ask students if they can define the word. Show them the examples of observation statements.',
        '- Go through the slides on **analysis**. Call on students to read some of these.',
        '- Very carefully and clearly review the slides on **Observation + Analysis**. Let students see and understand how the analysis is connected to the observation.',
        '- Then review the slides on combining the observation and analysis to form a thesis.',
      ],
    },
    {
      title: 'Writing time: students write their thesis statements in Yawp!',
      minutes: 17,
      type: 'thesis_essay',
      body: [
        'Students log on to yawp.school. Make sure they are on the **Thesis Statement** module (noted at the top of the Tutor).',
        '',
        '- If students completed the pre-writing process last class, they have a specific topic at the end of their pre-write. That specific topic is their starting point today.',
        '- Students follow the instructions and go through the Thesis process.',
        '- Go around the room and check in with as many students as possible. Help them identify and compose their observation and analysis.',
        '- Even for seasoned writers, developing a thesis statement takes time and effort. Help students as much as they need it.',
        '- As students draft, they can ask the Tutor for feedback. Sometimes the Tutor suggests a word choice that removes or sterilizes the student’s voice. Be on the lookout for this, and help students word and shape their thesis statements in effective ways.',
      ],
    },
    {
      title: 'Closing, and before next class',
      minutes: 3,
      type: 'closing',
      body: [
        'Tell students the goal: a working thesis statement for everyone who was here today, before the Introduction Paragraph lesson.',
        '',
        '**Following class:** check each student’s document for a strong, working thesis statement and leave a positive comment on the work they’ve done. Revise any thesis statements that are wordy or syntactically incorrect; keep their original and show the “Revised Thesis” below it so they can see the differences. Unless a student was absent, don’t move on to the Introduction Paragraph lesson until all students have their thesis statements.',
      ],
    },
  ],
});

const INTRODUCTION: YawpLesson = {
  slug: 'introduction-paragraph',
  title: 'Introduction paragraph',
  lessonNumber: 4,
  periodMinutes: 50,
  deck: file('04-introduction-paragraph.pptx', 'Introduction Paragraph.pptx'),
  lessonPlanPdf: file(
    '04-lesson-plan-introduction-paragraph.pdf',
    'Lesson Plan - Introduction Paragraph.pdf'
  ),
  plan: '',
};
INTRODUCTION.plan = plan({
  title: INTRODUCTION.title,
  overview: [
    'Students learn how to write an introduction that effectively prepares the reader for their thesis statement.',
    '**Students will** review their thesis statements, understand how an introduction functions, learn different introduction styles, and begin writing their introductions.',
  ],
  deck: INTRODUCTION.deck,
  lessonPlanPdf: INTRODUCTION.lessonPlanPdf,
  steps: [
    {
      title: 'Opening activity: general to specific',
      minutes: 8,
      type: 'activity',
      body: [
        'Optional first: review the assessment questions about critical essays.',
        '',
        'Using the slides, have students place terms and sentences in order, individually or in groups. The instructions are deliberately vague: the goal is for students to figure out the order, which is most general to most specific (or vice versa), but don’t tell them this in your directions.',
        '',
        'Have students report on the correct answers and reveal them on the slides. Ask how they came to their conclusions. What relationship or order is being used here? (Answer: big-to-small, general-to-specific.)',
      ],
    },
    {
      title: 'Celebrate the milestone',
      minutes: 5,
      type: 'context',
      body: [
        'At this point most students have a working thesis statement. Celebrate this: it’s a major milestone in the essay-writing process. It may be useful to check in with students or have them share their thesis statements out loud or with a partner. This helps them understand, own and commit to a sentence they’ll be spending a lot of time with. More importantly, now that they have a thesis statement, they can actually begin writing their essays.',
      ],
    },
    {
      title: 'Mini-lesson: four ways to open an essay',
      minutes: 14,
      type: 'context',
      body: [
        'Using the slides, teach students the four introduction styles, with examples. To keep them in the examples:',
        '',
        '- Make sure students understand that they’re going to write their own intros today. Raising the stakes this way encourages them to pay attention to the examples.',
        '- You might read the first paragraph yourself, then call on students to read the examples of the different styles.',
        '- Comment or ask questions about the different styles.',
        '- Note in each example how the thesis statement is the final sentence of the paragraph.',
        '- Pay special attention to how these paragraphs start somewhat generally and then become more specific (like the opening activity) until you’re ready to drop the thesis statement at the end.',
      ],
    },
    {
      title: 'Writing time: students write their introductions in Yawp!',
      minutes: 20,
      type: 'thesis_essay',
      body: [
        'Students open their documents on yawp.school and move to the **Introduction Paragraph** module.',
        '',
        '- Tell students that writing is decision making, and this is one of those moments where they decide how to start their essays. With a story? A definition, a quote, a question?',
        '- In formal, critical writing students are often told to avoid the first-person “I.” Decide on your policy here. Depending on the topic, a student may choose to start with a personal anecdote, where “I” might be fine.',
        '- Students should be pretty active in writing their intros. As they do, they’ll want immediate feedback from you as well as from the Yawp! Tutor. Work the room and stay as active as possible with this feedback.',
      ],
    },
    {
      title: 'Closing: what’s next',
      minutes: 3,
      type: 'closing',
      body: [
        'Next class is body paragraphs. Before then, hop on student documents to check their progress on their introductions and leave helpful comments; some students may need a transition sentence that links their intro to their thesis.',
      ],
    },
  ],
});

const BODY: YawpLesson = {
  slug: 'body-paragraphs',
  title: 'Body paragraphs',
  lessonNumber: 5,
  periodMinutes: 50,
  deck: file('05-body-paragraphs.pptx', 'Body Paragraphs.pptx'),
  lessonPlanPdf: file('05-lesson-plan-body-paragraphs.pdf', 'Lesson Plan - Body Paragraphs.pdf'),
  plan: '',
};
BODY.plan = plan({
  title: BODY.title,
  overview: [
    'This class can be a turning point for many students, as they start to see their essays really take shape. Just having a solid introduction that ends with a strong thesis statement is a big confidence builder: they start to realize they’re actually writing a great essay. Today’s class is about getting to this point and then pushing them into the rest of their essay.',
    '**Students will** review and improve their intros, break their thesis statements into parts, and map out and begin writing their body paragraphs.',
    '**Before class:** hop on student documents to check their progress on their introductions. Give helpful comments and suggestions; sometimes students need a transition sentence that links their intro to their thesis. Reviewing intros beforehand also tells you whether to give them more time on intros before launching into body paragraphs.',
  ],
  deck: BODY.deck,
  lessonPlanPdf: BODY.lessonPlanPdf,
  steps: [
    {
      title: 'Open your docs: the last sentence of the intro',
      minutes: 7,
      type: 'activity',
      body: [
        'Begin by asking students to open their Yawp! docs and look at their existing intros and thesis statements.',
        '',
        '- Refresh their memory about what they did last class (writing intros that prepare the reader to understand their thesis statement). Ask, “Where does your thesis statement go in your introductory paragraph?” (Answer: the final sentence. Add the disclaimer that this isn’t a hard and fast rule, but for this essay that’s where it goes.)',
        '- Optional: read the introduction of the sample essay together for a shared understanding of the introduction.',
        '- Optional: check in on intro paragraphs with students or have them share with a partner. Praise what’s working, make sure the intro flows into the thesis, and suggest linking sentences where it doesn’t. If a student hasn’t written an intro yet, give clear, direct advice for how to begin. Avoid writing their intros for them or getting bogged down with one student.',
      ],
    },
    {
      title: 'Let the argument be your guide',
      minutes: 10,
      type: 'context',
      body: [
        'Using the slide deck, tell students that once they’ve dropped their thesis at the end of their introduction, everything they write must in some way define, illustrate or support their thesis statement. The good news: their thesis tells them exactly where to go from here.',
        '',
        '- Use the example thesis statement to show how to break a thesis into its parts, noting how these parts become the body paragraphs.',
        '- Make sure students are on the **Body Paragraphs** module, then have them follow the Tutor’s instructions for breaking their thesis statements into parts. Have them review the suggestion to make sure they agree with how it is broken up; they may want to consult you.',
        '- It’s most effective when students highlight the individual parts of their thesis, like this: *When teacher training programs do not emphasize creative design in lesson plans, / teachers fail to understand their role as entertainers, / resulting in boring lessons.* Having this visual helps students stay organized and focused as they begin their body paragraphs.',
        '- Not all thesis statements have 3 parts; they usually have 2–4 (occasionally 5). Usually one part yields one body paragraph, but a complex idea can yield two or even three. Avoid teaching this step as if a specific number of body paragraphs is required, lest students think we’re teaching the “5-paragraph essay.”',
      ],
    },
    {
      title: 'Read the sample essay’s body paragraphs',
      minutes: 8,
      type: 'read_aloud',
      body: [
        'Read the sample essay’s body paragraphs to reinforce the method and get students in the space of body paragraphs.',
      ],
    },
    {
      title: 'The House Analogy',
      minutes: 5,
      type: 'context',
      body: ['Explain the House Analogy to students, from the slides.'],
    },
    {
      title: 'Writing time: students write their first body paragraph in Yawp!',
      minutes: 17,
      type: 'thesis_essay',
      body: [
        'Students begin their first body paragraph, focused only on the first element of their thesis statement.',
        '',
        '- Use the “Basic Structure of a Body Paragraph” slide to help them.',
        '- Tell students that just as their intro started somewhat generally and got more specific as it went along, body paragraphs can start with the general point or element and then get more specific with examples, analysis, opinions and conclusions.',
        '- Work the room, reading paragraphs and giving feedback and encouragement. As essays take shape you may see a rise in student confidence. Celebrate this.',
      ],
    },
    {
      title: 'Closing: what’s next',
      minutes: 3,
      type: 'closing',
      body: [
        'Body paragraphs take two class periods. Next class picks up here with the Supporting Quotes deck (“Step four, continued”), then the conclusion.',
      ],
    },
  ],
});

const CONCLUSION: YawpLesson = {
  slug: 'conclusion-paragraph',
  title: 'The conclusion',
  lessonNumber: 6,
  periodMinutes: 50,
  deck: file('06-conclusion-paragraph.pptx', 'Conclusion Paragraph.pptx'),
  lessonPlanPdf: file(
    '06-lesson-plan-conclusion-paragraph.pdf',
    'Lesson Plan - Conclusion Paragraph.pdf'
  ),
  plan: '',
};
CONCLUSION.plan = plan({
  title: CONCLUSION.title,
  overview: [
    'Students learn how to write an effective conclusion that goes beyond merely restating their thesis and main ideas.',
    '**Students will** understand the function of a conclusion, learn about rhetorical questions, and write their conclusions.',
  ],
  deck: CONCLUSION.deck,
  lessonPlanPdf: CONCLUSION.lessonPlanPdf,
  steps: [
    {
      title: 'Opening: where are we?',
      minutes: 5,
      type: 'activity',
      body: [
        'Optional opening: review the assessment questions about critical essays.',
        '',
        'At this point most students should be near or at the end of their body paragraphs. If so, make sure they have advanced their documents to the **Conclusion Paragraph** module on yawp.school. Some students may still be working on body paragraphs, which is OK: let them continue wherever they are. Teaching the conclusion now lets them finish when they get to this step.',
      ],
    },
    {
      title: 'Mini-lesson: debunk “restate and repeat”',
      minutes: 10,
      type: 'context',
      body: [
        'Using the slides, debunk the myth that good conclusions “restate the thesis and main ideas of an essay.” Even if you have been taught this, or taught it yourself, please accept that it’s a bland and unimaginative way to end an essay.',
        '',
        'Then discuss the definition of “conclusion” as a deduction one makes based on available information.',
      ],
    },
    {
      title: 'Read the sample essay’s conclusion',
      minutes: 6,
      type: 'read_aloud',
      body: [
        'Read the conclusion from the sample essay to show a good alternative to repeating yourself.',
      ],
    },
    {
      title: 'The rhetorical question and the suggested structure',
      minutes: 7,
      type: 'context',
      body: [
        'Remind students about the power of the rhetorical question, and show them the suggested conclusion structure on the slides.',
      ],
    },
    {
      title: 'Writing time: students write their conclusions in Yawp!',
      minutes: 19,
      type: 'thesis_essay',
      body: [
        'This part typically goes pretty fast: once students have finished their body paragraphs they really are in the home stretch, and the suggested structure gives them the path to the finish line.',
        '',
        'As you work the room, pay attention to students’ rhetorical questions. Sometimes they don’t fully grasp how to position themselves with a good, relevant question that provides a springboard for final thoughts: they ask an overly simple question or don’t know what to say. Help them through these moments.',
      ],
    },
    {
      title: 'Closing: what’s next',
      minutes: 3,
      type: 'closing',
      body: [
        'Next: titles and formatting, with its slide deck, and then students review their essays.',
      ],
    },
  ],
});

export const YAWP_LESSONS: Record<YawpLessonSlug, YawpLesson> = {
  'introduce-students-to-yawp': INTRODUCE,
  'pre-writing': PRE_WRITING,
  'thesis-statement': THESIS,
  'introduction-paragraph': INTRODUCTION,
  'body-paragraphs': BODY,
  'conclusion-paragraph': CONCLUSION,
};
