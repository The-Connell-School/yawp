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
] as const;

export type TourId = (typeof TOUR_IDS)[number];

/** How a teacher left a tour. Completed wins: it is never downgraded. */
export const TOUR_STATUSES = ['completed', 'dismissed'] as const;

export type TourStatus = (typeof TOUR_STATUSES)[number];

export type TourIcon = 'home' | 'classes' | 'class' | 'assignments';

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

/** The tour for a page, or null for pages without one. */
export function tourForPathname(pathname: string): PageTour | null {
  const path =
    pathname.length > 1 && pathname.endsWith('/')
      ? pathname.slice(0, -1)
      : pathname;
  if (path === '/app') return TOURS.dashboard;
  if (path === '/app/my-classes') return TOURS['my-classes'];
  if (/^\/app\/my-classes\/[^/]+$/.test(path)) return TOURS.class;
  if (path === '/app/assignments') return TOURS['my-assignments'];
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
