import { parseStoryboard } from '@app/marketing-media';
import { renderStoryboard } from './render';

const storyboard = parseStoryboard({
  slug: 'smoke-loop',
  title: 'Smoke loop',
  persona: 'teacher',
  viewport: 'laptop',
  scenes: [
    {
      id: 'dashboard',
      goto: '/app',
      waitFor: 'main',
      settle: 0.2,
      hold: 0.2,
      steps: [
        { action: 'scroll', y: 200 },
        { action: 'click', role: 'link', name: 'graded' },
        { action: 'waitFor', selector: '.ProseMirror' },
        {
          action: 'type',
          selector: '.ProseMirror',
          value: ' Typed on camera.',
          at: 'end',
        },
        { action: 'screenshot', name: 'editor' },
        { action: 'click', selector: '#missing', optional: true },
      ],
    },
    {
      id: 'switched',
      settle: 0.2,
      hold: 0.2,
      steps: [
        { action: 'login', persona: 'student-graded', path: '/app' },
        { action: 'waitFor', selector: 'main' },
      ],
    },
  ],
});

const kind = (process.argv[2] as 'STILLS' | 'CLIP') ?? 'STILLS';

const result = await renderStoryboard({
  storyboard,
  kind,
  baseUrl: 'http://localhost:4173',
  outDir: `/tmp/claude-0/-home-user-yawp-2-0/a441b922-5777-5c34-baff-e818befe66fb/scratchpad/render-out-${kind}`,
  chromiumPath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  ffmpegPath: '/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux',
});

console.log(JSON.stringify(result, null, 2));
