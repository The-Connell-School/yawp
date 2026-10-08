import { describe, expect, test } from 'bun:test';
import { renderGuideDocument } from './guide-document';
import { guideStoryboard } from './guide.fixture';
import { parseStoryboard } from './storyboard';

const PNG = 'data:image/png;base64,AAAA';
const MP4 = 'data:video/mp4;base64,BBBB';

function render(overrides: Record<string, unknown> = {}) {
  const storyboard = parseStoryboard(guideStoryboard(overrides));
  return renderGuideDocument({
    storyboard,
    media: {
      hero: { image: PNG },
      'prompt-library': { image: PNG },
      assign: { image: PNG, clip: MP4 },
      review: { image: PNG },
    },
  });
}

describe('renderGuideDocument', () => {
  test('is a complete, standalone page titled after the guide', () => {
    const html = render();
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>Daily Pages guide</title>');
    expect(html).toContain('name="viewport"');
  });

  // The file is opened from S3, attached to an email, and served behind a
  // sandbox CSP that blocks scripts. Nothing in it may depend on one.
  test('needs no script and no network', () => {
    const html = render();
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/(src|href)="https?:/i);
  });

  test('sets the highlighted words of the headline apart', () => {
    expect(render()).toContain(
      'Get students writing <mark>every day</mark> in five minutes.'
    );
  });

  test('follows the documented shape: hero, range, steps, will / won’t, footer', () => {
    const html = render();
    const order = [
      'data-guide="hero"',
      'data-guide="range"',
      'data-guide="steps"',
      'data-guide="will-wont"',
      'data-guide="footer"',
    ].map((marker) => html.indexOf(marker));
    expect(order.every((index) => index > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test('numbers the steps and shows a looping clip where one was filmed', () => {
    const html = render();
    expect(html).toContain('<span class="step-n">1</span>');
    expect(html).toContain('<span class="step-n">2</span>');
    expect(html).toMatch(
      /<video[^>]*autoplay[^>]*muted[^>]*loop[^>]*playsinline[^>]*poster="data:image\/png;base64,AAAA"[^>]*src="data:video\/mp4;base64,BBBB"/
    );
    // The second step had no clip, so it falls back to its still.
    expect(html.match(/<video/g)).toHaveLength(1);
  });

  // `.shot img` is display:block, so a bare `.print-only` rule loses and the
  // print still shows on screen under every clip.
  test('hides the print still on screen with a rule that outranks .shot img', () => {
    expect(render()).toContain('.shot .print-only{display:none}');
  });

  test('lists the range and the moments teachers use it', () => {
    const html = render();
    expect(html).toContain('<li>Quick feedback on each entry</li>');
    expect(html).toContain('<li>Bell work</li>');
  });

  test('carries the will / won’t lists and the honest footer', () => {
    const html = render();
    expect(html).toContain('What it will do');
    expect(html).toContain('What it won’t do');
    expect(html).toContain('Share a student’s writing with other students.');
    expect(html).toContain('Clips use demo classes.');
  });

  test('escapes generated copy', () => {
    const html = render({
      title: 'Guide <img src=x onerror=alert(1)>',
    });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('Guide &lt;img src=x onerror=alert(1)&gt;');
  });

  test('refuses media that is not an inline image or video', () => {
    const storyboard = parseStoryboard(guideStoryboard());
    const html = renderGuideDocument({
      storyboard,
      media: { hero: { image: 'javascript:alert(1)' } },
    });
    expect(html).not.toContain('javascript:');
  });

  test('leaves out sections the storyboard has no copy for', () => {
    const base = guideStoryboard();
    const html = render({
      guide: { ...base.guide, canDo: [], useCases: [] },
      scenes: base.scenes.filter((scene) => scene.id !== 'prompt-library'),
    });
    expect(html).not.toContain('data-guide="range"');
    expect(html).not.toContain('Where teachers use it');
  });
});
