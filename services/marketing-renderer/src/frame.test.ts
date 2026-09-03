import { describe, expect, test } from 'bun:test';
import { buildFramingPage, buildStillFramingPage, frameGeometry } from './frame';

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

describe('buildStillFramingPage', () => {
  const still = {
    width: 1280,
    height: 800,
    addressText: 'app.yawp.school',
    imageSrc: '01-grading-hub.png',
  };

  // A raw viewport capture is a screenshot; a framed one is marketing. Same
  // scene language as the clip framing — gradient, window chrome, shadow — so
  // stills and clips from one storyboard sit together in a deck.
  test('places the capture inside the window chrome on the gradient', () => {
    const html = buildStillFramingPage(still);

    expect(html).toContain('<img id="still" src="01-grading-hub.png"');
    expect(html).toContain('class="window"');
    expect(html).toContain('linear-gradient(');
    expect(html).toContain('class="address">app.yawp.school<');
  });

  test('sizes the canvas with the shared geometry', () => {
    const geometry = frameGeometry(1280, 800);
    const html = buildStillFramingPage(still);

    expect(html).toContain(`width: ${geometry.canvasWidth}px`);
    expect(html).toContain(`height: ${geometry.canvasHeight}px`);
    expect(html).toContain(`width: ${geometry.windowWidth}px`);
  });

  // A still has no timeline, so the scene's overlay copy is simply on.
  test('shows the caption when the scene has one', () => {
    const html = buildStillFramingPage({
      ...still,
      caption: 'Every writer, one pipeline',
    });
    expect(html).toContain('class="overlay on"');
    expect(html).toContain('Every writer, one pipeline');
  });

  test('omits the caption element when there is no copy', () => {
    const html = buildStillFramingPage(still);
    expect(html).not.toContain('class="overlay');
  });

  test('escapes caption copy', () => {
    const html = buildStillFramingPage({
      ...still,
      caption: '</div><script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('backdrops', () => {
  const still = {
    width: 1280,
    height: 800,
    addressText: 'app.yawp.school',
    imageSrc: 'shot.png',
  };

  // Same scene, different ground. The window chrome and geometry are shared,
  // so a deck can mix backdrops without the frames looking unrelated.
  test('gradient is what a storyboard gets by default', () => {
    expect(buildStillFramingPage(still)).toContain('linear-gradient(');
    expect(buildFramingPage({ ...base })).toContain('linear-gradient(');
  });

  test('slate and paper are flat grounds, not gradients', () => {
    const slate = buildStillFramingPage({ ...still, backdrop: 'slate' });
    expect(slate).not.toContain('linear-gradient(');
    expect(slate).toContain('#0f172a');

    const paper = buildStillFramingPage({ ...still, backdrop: 'paper' });
    expect(paper).not.toContain('linear-gradient(');
    // The app's own warm off-white, so a still sits on the brand ground.
    expect(paper).toContain('#f5f1ec');
  });

  test('paper keeps the caption readable on a light ground', () => {
    const paper = buildStillFramingPage({
      ...still,
      backdrop: 'paper',
      caption: 'Feedback students actually read',
    });
    expect(paper).toContain('Feedback students actually read');
    expect(paper).toContain('color: #fff');
  });

  test('none drops the chrome and the margin entirely', () => {
    const bare = buildStillFramingPage({ ...still, backdrop: 'none' });
    expect(bare).not.toContain('class="bar"');
    expect(bare).not.toContain('linear-gradient(');
    // Canvas is the capture itself; nothing is added around it.
    expect(bare).toContain(`width: ${still.width}px`);
  });

  test('clips take the same backdrops', () => {
    const slate = buildFramingPage({ ...base, backdrop: 'slate' });
    expect(slate).toContain('#0f172a');
    expect(slate).not.toContain('linear-gradient(');
  });
});

describe('frameGeometry', () => {
  // 'none' delivers the capture at its own size; every other backdrop leaves
  // room for the ground around the window.
  test('unframed captures keep the capture’s exact size', () => {
    expect(frameGeometry(1280, 800, 'none')).toMatchObject({
      canvasWidth: 1280,
      canvasHeight: 800,
      windowWidth: 1280,
      barHeight: 0,
    });
  });

  test('framed captures leave room for the backdrop', () => {
    const framed = frameGeometry(1280, 800, 'gradient');
    expect(framed.canvasWidth).toBe(1280);
    expect(framed.canvasHeight).toBeGreaterThan(800);
    expect(framed.windowWidth).toBeLessThan(1280);
  });
});
