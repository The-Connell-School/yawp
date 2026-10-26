import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router';

const { AboutWritingStep } = await import('./about-writing-step');
const { LessonMaterialsCard } =
  await import('~/components/lesson-materials-card');
const { WRITING_STEP_COPY } = await import('./content');

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(element: React.ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const router = createMemoryRouter([{ path: '/', element }]);
  act(() => root!.render(<RouterProvider router={router} />));
  return container;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe('AboutWritingStep', () => {
  it('says what Prewriting is, how it runs, and how it is scored', () => {
    const view = render(
      <AboutWritingStep copy={WRITING_STEP_COPY.prewriting} />
    );
    const text = view.textContent ?? '';

    expect(view.querySelector('h2')?.textContent).toBe('About Prewriting');
    expect(text).toContain(WRITING_STEP_COPY.prewriting.lede);
    expect(text).toContain('Teach the Pre-writing lesson');
    expect(text).toContain('Scored 1–5 on Focus and exploration.');
    expect(view.querySelector('[data-tour="type-directions"]')).not.toBeNull();
  });
});

describe('LessonMaterialsCard', () => {
  it('downloads files and opens the video lesson', () => {
    const view = render(
      <LessonMaterialsCard
        lesson={{
          lessonTitle: 'Lesson 2: Pre-writing',
          courseTitle: 'The Thesis-Driven Essay',
          lessonPath: '/app/teacher-trainings/t/modules/m',
          materials: [
            {
              kind: 'lesson-plan',
              label: 'Lesson plan',
              href: '/api/teacher-training-module-resource/plan',
            },
            {
              kind: 'slide-deck',
              label: 'Slide deck',
              href: '/api/teacher-training-module-resource/deck',
            },
            {
              kind: 'video',
              label: 'Tutorial video',
              href: '/app/teacher-trainings/t/modules/m',
            },
          ],
        }}
      />
    );

    expect(view.textContent).toContain(
      'Lesson 2: Pre-writing, from The Thesis-Driven Essay course'
    );
    const links = [...view.querySelectorAll('a')].map((a) => ({
      text: a.textContent,
      href: a.getAttribute('href'),
      download: a.hasAttribute('download'),
    }));
    expect(links).toEqual([
      {
        text: 'Lesson plan',
        href: '/api/teacher-training-module-resource/plan',
        download: true,
      },
      {
        text: 'Slide deck',
        href: '/api/teacher-training-module-resource/deck',
        download: true,
      },
      {
        text: 'Tutorial video',
        href: '/app/teacher-trainings/t/modules/m',
        download: false,
      },
    ]);
  });
});
