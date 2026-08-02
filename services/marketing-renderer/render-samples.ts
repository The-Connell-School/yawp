import { parseStoryboard } from '@app/marketing-media';
import { renderStoryboard } from './src/render';

const SAMPLES = [
  {
    slug: 'student-daily-writing',
    title: 'Students draft right in YAWP!',
    audience: 'Teachers',
    goal: 'Show the student writing experience',
    persona: 'student',
    viewport: { width: 1280, height: 800 },
    scenes: [
      {
        id: 'student-dashboard',
        goto: '/app',
        waitFor: 'main',
        settle: 0.8,
        hold: 0.5,
        screenshot: false,
        steps: [{ action: 'click', text: 'Practice essay draft' }],
      },
      {
        id: 'draft-in-editor',
        settle: 1,
        hold: 2,
        screenshot: true,
        steps: [
          { action: 'waitFor', selector: '.ProseMirror' },
          {
            action: 'type',
            selector: '.ProseMirror',
            at: 'end',
            value: ' The bell rang, but nobody moved.',
          },
        ],
      },
    ],
  },
  {
    slug: 'teacher-class-overview',
    title: 'Every class, one glance',
    audience: 'School administrators',
    goal: 'Show the teacher class view',
    persona: 'teacher',
    viewport: { width: 1280, height: 800 },
    scenes: [
      {
        id: 'my-classes',
        goto: '/app/my-classes',
        waitFor: 'main',
        settle: 0.8,
        hold: 1,
        screenshot: false,
        steps: [{ action: 'click', role: 'link', name: 'English 10 - Period 3' }],
      },
      {
        id: 'class-detail',
        settle: 1,
        hold: 2.5,
        screenshot: true,
        steps: [{ action: 'waitFor', selector: "[data-testid='class-detail-header']" }],
      },
    ],
  },
];

for (const sample of SAMPLES) {
  const storyboard = parseStoryboard(sample);
  try {
    const result = await renderStoryboard({
      storyboard,
      kind: 'CLIP',
      baseUrl: 'http://127.0.0.1:8123',
      outDir: `${process.env.OUT_DIR || '/tmp/samples'}/${sample.slug}`,
      chromiumPath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    });
    console.log(sample.slug, 'OK', result.files.map((f) => f.kind).join(','), 'warnings:', result.warnings.length);
  } catch (err) {
    console.log(sample.slug, 'FAILED:', err instanceof Error ? err.message : String(err));
  }
}
