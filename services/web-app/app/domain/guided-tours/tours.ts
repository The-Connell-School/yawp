/**
 * Page tours for free classroom teachers: a welcome card on each page they
 * land on, then a short spotlight walk through what is on it. They stand in
 * for the hands-on orientation a paid school gets. See
 * docs/free-tier/guided-tours.md.
 *
 * A step points at an element by its `data-tour` attribute. A step whose
 * element is not on screen (another tab is open, a phone hides the sidebar) is
 * skipped, so a tour never points at nothing.
 *
 * Shared by the server (to validate a tour id) and the browser (to render the
 * tour), so nothing here may import server code.
 */

export const TOUR_IDS = [
  'dashboard',
  'my-classes',
  'class',
  'my-assignments',
  'documents',
  'writing-practice',
  'teachers-lounge',
  'lesson-planner',
  'organization',
  'type-class-starter',
  'type-prewriting',
  'type-thesis-statement',
  'document',
] as const;

export type TourId = (typeof TOUR_IDS)[number];

/** How a teacher left a tour. Completed wins: it is never downgraded. */
export const TOUR_STATUSES = ['completed', 'dismissed'] as const;

export type TourStatus = (typeof TOUR_STATUSES)[number];

export type TourIcon =
  | 'home'
  | 'classes'
  | 'class'
  | 'assignments'
  | 'documents'
  | 'practice'
  | 'lounge'
  | 'planner'
  | 'organization'
  | 'assignment-type'
  | 'document';

export type TourStep = {
  /** Value of the `data-tour` attribute on the element this step points at. */
  target: string;
  title: string;
  body: string;
};

export type PageTour = {
  id: TourId;
  welcome: { title: string; body: string; icon: TourIcon };
  steps: TourStep[];
};

/** The writing page, wherever a document opens. */
const DOCUMENT_TOUR: PageTour = {
  id: 'document',
  welcome: {
    title: 'Welcome to the writing page',
    body: 'This is the page your students write on. Take a quick look around so you know what they will see.',
    icon: 'document',
  },
  steps: [
    {
      target: 'doc-tutor',
      title: 'The Tutor',
      body: 'The assignment and its steps sit here. Students can open Chat to talk an idea through with the Tutor while they write.',
    },
    {
      target: 'doc-toolbar',
      title: 'Write here',
      body: 'The page in the middle is the document. The toolbar formats it, and every change saves on its own.',
    },
    {
      target: 'doc-comments',
      title: 'Comments',
      body: 'Highlight any text to leave a comment on it. Comments on the writing collect here.',
    },
    {
      target: 'doc-submit',
      title: 'Submit',
      body: 'Students submit here when they are done. Submitted work shows up in Documents, ready for you to grade.',
    },
    {
      target: 'doc-status',
      title: 'Saved, history, print',
      body: 'See that the work is saved, and use this menu to step back through every version in History or to print it.',
    },
  ],
};

const TOURS: Record<TourId, PageTour> = {
  dashboard: {
    id: 'dashboard',
    welcome: {
      title: 'Welcome to YAWP!',
      body: 'This is your home base: your class, your assignments, and the work waiting for you, all in one place.',
      icon: 'home',
    },
    steps: [
      {
        target: 'dashboard-classes',
        title: 'Your class',
        body: 'We set up your class for you. Open it to invite students and see their writing.',
      },
      {
        target: 'dashboard-assignments',
        title: 'Assignments',
        body: 'Pick an assignment type to create one for your class. Your free classroom shows how many of each type you have left.',
      },
      {
        target: 'dashboard-grading',
        title: 'Grading at a glance',
        body: 'When students submit, the work that needs grading and the grades ready to release to students show up here.',
      },
      {
        target: 'app-nav',
        title: 'Getting around',
        body: 'Use this menu to reach your classes, assignments, documents, and more from any page.',
      },
    ],
  },
  'my-classes': {
    id: 'my-classes',
    welcome: {
      title: 'Welcome to My Classes',
      body: 'Every class you teach lives here. Your free classroom comes with one class, already set up.',
      icon: 'classes',
    },
    steps: [
      {
        target: 'my-classes-grid',
        title: 'Your class',
        body: 'Open your class to add students, see their documents, and track assignments.',
      },
      {
        target: 'my-classes-create',
        title: 'One class included',
        body: 'Free classrooms include one class with up to 35 students. To start a new class, archive this one or upgrade.',
      },
    ],
  },
  class: {
    id: 'class',
    welcome: {
      title: 'Welcome to your class',
      body: 'This is where you get students in and follow their work. A quick tour shows you how.',
      icon: 'class',
    },
    steps: [
      {
        target: 'class-join-link',
        title: 'Student join link',
        body: 'Share this link or QR code with your students. They pick a handle and a password, with no email needed.',
      },
      {
        target: 'class-roster',
        title: 'Your roster',
        body: 'Students appear here once they join. If someone forgets a password, you can reset it from their row.',
      },
      {
        target: 'class-tabs',
        title: 'Students, documents, assignments',
        body: 'Switch tabs to see every document your students are writing and every assignment you have given this class.',
      },
    ],
  },
  'my-assignments': {
    id: 'my-assignments',
    welcome: {
      title: 'Welcome to My Assignments',
      body: 'Every assignment you have given, across your class, in one list.',
      icon: 'assignments',
    },
    steps: [
      {
        target: 'my-assignments-new',
        title: 'Create an assignment',
        body: 'Start a new assignment here. Choose a type, and YAWP shows how many of that type your free classroom has left.',
      },
      {
        target: 'my-assignments-list',
        title: 'Assigned work',
        body: 'Open an assignment to see who has started, who has submitted, and what is ready to grade.',
      },
    ],
  },
  documents: {
    id: 'documents',
    welcome: {
      title: 'Welcome to Documents',
      body: 'Every piece of writing your students start or submit lands here, ready to review, grade, and release.',
      icon: 'documents',
    },
    steps: [
      {
        target: 'documents-status',
        title: 'Where each document stands',
        body: 'Filter by In Progress, Needs Grading, Needs Releasing, or Released. The numbers show how many are in each.',
      },
      {
        target: 'documents-tools',
        title: 'Filter, group, and act',
        body: 'Narrow the list to a student or assignment, group it, and release grades or unsubmit work for the documents you select.',
      },
      {
        target: 'documents-list',
        title: 'Open a document',
        body: 'Click any row to read the writing, see the AI feedback, and grade it.',
      },
    ],
  },
  'writing-practice': {
    id: 'writing-practice',
    welcome: {
      title: 'Welcome to Writing Practice',
      body: "Short lessons on grammar, syntax, and revision that sharpen the skills behind your students' writing.",
      icon: 'practice',
    },
    steps: [
      {
        target: 'practice-create',
        title: 'Send practice to your class',
        body: 'Build an assignment from one or more lessons and send it to your class.',
      },
      {
        target: 'practice-assigned',
        title: 'Practice you assigned',
        body: 'Everything you have sent shows up here, so you can see how your class did.',
      },
      {
        target: 'practice-library',
        title: 'The lesson library',
        body: 'Browse every lesson by skill. Open one to see the example and the practice prompt your students will get.',
      },
    ],
  },
  'teachers-lounge': {
    id: 'teachers-lounge',
    welcome: {
      title: "Welcome to the Teacher's Lounge",
      body: 'Courses and resources for you, the teacher, to work through at your own pace.',
      icon: 'lounge',
    },
    steps: [
      {
        target: 'lounge-courses',
        title: 'Your courses',
        body: 'Open a course to work through its modules and download its resources.',
      },
    ],
  },
  'lesson-planner': {
    id: 'lesson-planner',
    welcome: {
      title: 'Welcome to the Lesson Planner',
      body: 'Plan a lesson by talking it through. The planner builds the slides, activities, handouts, and exit tickets for your class.',
      icon: 'planner',
    },
    steps: [
      {
        target: 'planner-composer',
        title: 'Describe your lesson',
        body: 'Say what you are teaching and who is in the room, the way you would tell a colleague. Then send it.',
      },
      {
        target: 'planner-starters',
        title: 'Or start from an idea',
        body: 'Not sure where to begin? Pick one of these to get a lesson going.',
      },
      {
        target: 'planner-rail',
        title: 'Your lessons',
        body: 'Every lesson you plan is saved here. Your free classroom includes a limited number of lesson plans; deleting a draft frees one up.',
      },
      {
        target: 'planner-guide',
        title: 'See how it works',
        body: 'A short walkthrough of the planner, with clips, whenever you want a refresher.',
      },
    ],
  },
  organization: {
    id: 'organization',
    welcome: {
      title: 'Welcome to Organization',
      body: 'The account behind your free classroom: its class, school, teachers, and students.',
      icon: 'organization',
    },
    steps: [
      {
        target: 'organization-tabs',
        title: 'Classes, schools, teachers, students',
        body: 'Switch tabs to see everyone and everything in your account. Your free classroom has one class with room for up to 35 students.',
      },
      {
        target: 'organization-content',
        title: 'Manage the details',
        body: 'Each tab lists what is in your account. Use its Edit button to update a class, your school, or a student.',
      },
    ],
  },
  'type-class-starter': {
    id: 'type-class-starter',
    welcome: {
      title: 'Welcome to Class Starter',
      body: 'Open-ended writing to begin class. It is graded on engagement: did the student write, and did they reflect.',
      icon: 'assignment-type',
    },
    steps: [
      {
        target: 'type-new',
        title: 'Make one',
        body: 'New → Assignment gives it to your class. New → Document lets you try it yourself first, the way your students will. Each one you assign uses one from your free classroom.',
      },
      {
        target: 'type-directions',
        title: 'How it works',
        body: 'Write a prompt and every student gets a blank document titled with it. Feedback is about their ideas, not rubric scores or correctness.',
      },
      {
        target: 'type-library',
        title: 'Prompt library',
        body: 'Short on ideas? Open the Prompt Library and pick one; it fills in the assignment for you. New → Generate a prompt makes a fresh one.',
      },
      {
        target: 'type-modules',
        title: 'The writing process',
        body: 'The steps this assignment walks students through. Open one for an overview of what they will do.',
      },
      {
        target: 'type-documents',
        title: 'Your own drafts',
        body: 'Documents you start with New → Document show up here, so you can see the student side before you assign it.',
      },
    ],
  },
  'type-prewriting': {
    id: 'type-prewriting',
    welcome: {
      title: 'Welcome to Prewriting',
      body: 'Students explore the prompt and find a specific focus before they write a thesis.',
      icon: 'assignment-type',
    },
    steps: [
      {
        target: 'type-new',
        title: 'Make one',
        body: 'New → Assignment gives it to your class. New → Document lets you try it yourself first, the way your students will. Each one you assign uses one from your free classroom.',
      },
      {
        target: 'type-modules',
        title: 'The writing process',
        body: 'The steps this assignment walks students through. Open one for an overview of what they will do.',
      },
      {
        target: 'type-documents',
        title: 'Your own drafts',
        body: 'Documents you start with New → Document show up here, so you can see the student side before you assign it.',
      },
    ],
  },
  'type-thesis-statement': {
    id: 'type-thesis-statement',
    welcome: {
      title: 'Welcome to Thesis Statement',
      body: 'Students develop a single clear, arguable thesis sentence.',
      icon: 'assignment-type',
    },
    steps: [
      {
        target: 'type-new',
        title: 'Make one',
        body: 'New → Assignment gives it to your class. New → Document lets you try it yourself first, the way your students will. Each one you assign uses one from your free classroom.',
      },
      {
        target: 'type-directions',
        title: 'How it works',
        body: 'How the prompts work and what tends to get the best essays out of students.',
      },
      {
        target: 'type-library',
        title: 'Prompt library',
        body: 'Pick a ready-made prompt and it fills in the assignment for you, or use New → Generate a prompt.',
      },
      {
        target: 'type-modules',
        title: 'The writing process',
        body: 'The steps this assignment walks students through. Open one for an overview of what they will do.',
      },
      {
        target: 'type-documents',
        title: 'Your own drafts',
        body: 'Documents you start with New → Document show up here, so you can see the student side before you assign it.',
      },
    ],
  },
  document: DOCUMENT_TOUR,
};

/** Assignment type kinds with a tour of their page, and which tour. */
const ASSIGNMENT_TYPE_TOURS: Record<string, TourId> = {
  class_starter: 'type-class-starter',
  prewriting: 'type-prewriting',
  thesis_statement: 'type-thesis-statement',
};

export function getTour(id: TourId): PageTour {
  return TOURS[id];
}

export function isTourId(value: unknown): value is TourId {
  return (
    typeof value === 'string' && (TOUR_IDS as readonly string[]).includes(value)
  );
}

export function isTourStatus(value: unknown): value is TourStatus {
  return (
    typeof value === 'string' &&
    (TOUR_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * The tour for a page, or null for pages without one. `variant` is the page's
 * own `data-tour-variant`, for pages whose URL does not say enough: an
 * assignment type page names its kind there.
 */
export function tourForPage(
  pathname: string,
  variant: string | null | undefined
): PageTour | null {
  const path =
    pathname.length > 1 && pathname.endsWith('/')
      ? pathname.slice(0, -1)
      : pathname;
  if (/^\/app\/assignment-types\/[^/]+$/.test(path)) {
    const id = variant ? ASSIGNMENT_TYPE_TOURS[variant] : undefined;
    return id ? TOURS[id] : null;
  }
  return tourForPathname(path);
}

/** The tour for a page whose URL alone picks it, or null. */
export function tourForPathname(pathname: string): PageTour | null {
  const path =
    pathname.length > 1 && pathname.endsWith('/')
      ? pathname.slice(0, -1)
      : pathname;
  if (path === '/app') return TOURS.dashboard;
  if (path === '/app/my-classes') return TOURS['my-classes'];
  if (/^\/app\/my-classes\/[^/]+$/.test(path)) return TOURS.class;
  if (path === '/app/assignments') return TOURS['my-assignments'];
  if (path === '/app/documents') return TOURS.documents;
  if (path === '/app/writing-lessons') return TOURS['writing-practice'];
  if (path === '/app/teacher-trainings') return TOURS['teachers-lounge'];
  if (path === '/app/lesson-planner') return TOURS['lesson-planner'];
  if (/^\/app\/organization(\/[^/]+)?$/.test(path)) return TOURS.organization;
  if (/^\/app\/documents\/[^/]+$/.test(path)) return TOURS.document;
  return null;
}

/**
 * Tours are for teachers in a free classroom, and only while the free tier is
 * switched on.
 */
export function guidedToursAvailable({
  freeTierEnabled,
  role,
  plan,
}: {
  freeTierEnabled: boolean;
  role: string | null | undefined;
  plan: string | null | undefined;
}) {
  return freeTierEnabled && role === 'TEACHER' && plan === 'FREE_CLASSROOM';
}

/** The status to store when a teacher leaves a tour; null stores nothing. */
export function nextTourStatus(
  previous: TourStatus | null,
  outcome: TourStatus
): TourStatus | null {
  if (previous === 'completed') return null;
  if (previous === outcome) return null;
  return outcome;
}
