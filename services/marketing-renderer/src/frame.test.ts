import { describe, expect, test } from 'bun:test';
import { buildFramingPage, frameGeometry } from './frame';

const base = {
  width: 1280,
  height: 800,
  addressText: 'app.yawp.school',
  videoSrc: 'clip.webm',
};

describe('buildFramingPage overlays', () => {
  // Silent clips carry no narration, so on-screen copy is the only thing
  // telling a viewer what the feature is. The framing stage is where it can
  // be composited, because it is already replaying the capture in a browser.
  test('emits the timed copy for each scene that has some', () => {
    const html = buildFramingPage({
      ...base,
      overlays: [
        { text: 'Assign daily writing in seconds', startMs: 0, endMs: 4000 },
        { text: 'Feedback students actually read', startMs: 4000, endMs: 9000 },
      ],
    });

    expect(html).toContain('Assign daily writing in seconds');
    expect(html).toContain('Feedback students actually read');
    expect(html).toContain('"startMs":4000');
    expect(html).toContain('id="overlay"');
  });

  // Storyboard copy reaches this page as markup. A stray angle bracket must
  // not be able to close the framing page's own tags.
  test('escapes copy rather than letting it write markup', () => {
    const html = buildFramingPage({
      ...base,
      overlays: [
        {
          text: '</script><img src=x onerror=alert(1)>',
          startMs: 0,
          endMs: 1000,
        },
      ],
    });

    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;/script&gt;');
  });

  test('stays as it was when a storyboard carries no copy', () => {
    const html = buildFramingPage(base);

    expect(html).toContain('window.__overlays = []');
    expect(html).toContain('<video id="clip"');
  });

  // A 1280px viewport scaled into a feed leaves product UI unreadable, so a
  // scene can push in on the element it is demonstrating. The capture is
  // never scaled — that would reflow the page under the steps — so the move
  // has to happen here, against the clip's own playback position.
  test('emits a timed push-in positioned on the measured element', () => {
    const html = buildFramingPage({
      ...base,
      zooms: [{ startMs: 1200, endMs: 4200, x: 0.25, y: 0.6, scale: 1.8 }],
    });

    expect(html).toContain('"scale":1.8');
    expect(html).toContain('"x":0.25');
    expect(html).toContain('transformOrigin');
    expect(html).toContain('transition: transform');
  });

  test('leaves the picture alone when no scene asked to push in', () => {
    const html = buildFramingPage(base);

    expect(html).toContain('window.__zooms = []');
  });

  // The overlay sits inside the canvas, so it has to be measured from the
  // same geometry the window chrome uses.
  test('sizes the copy against the rendered canvas', () => {
    const geometry = frameGeometry(1280, 800);
    const html = buildFramingPage({
      ...base,
      overlays: [{ text: 'Short and legible', startMs: 0, endMs: 500 }],
    });

    expect(html).toContain(`${Math.round(geometry.canvasWidth * 0.022)}px`);
  });
});
