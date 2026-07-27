import { describe, expect, it } from 'bun:test';
import { Stage } from './stage';

/**
 * Ordering tests for the Stage.
 *
 * These do not launch a browser. They drive the Stage against a fake Page and
 * record the sequence of overlay calls and Playwright actions, because what
 * actually matters here is *order*: the cursor has to arrive before the click,
 * and the spotlight has to be up before the caption describes it. Both are
 * invisible in a passing e2e run and obvious in a bad video.
 */

type Call = { kind: string; detail?: unknown };

function makeStage() {
  const calls: Call[] = [];
  const record = (kind: string, detail?: unknown) =>
    calls.push({ kind, detail });

  const overlayApi = new Proxy(
    {},
    {
      get(_target, method: string) {
        return (...args: unknown[]) => {
          record(`overlay:${method}`, args);
          if (method === 'cursorPosition') return { x: 0, y: 0 };
          return Promise.resolve();
        };
      },
    }
  );

  // Stage's overlay() dispatch reaches for window.__demo inside page.evaluate.
  (globalThis as unknown as { window: unknown }).window = {
    __demo: overlayApi,
  };

  const locator = {
    first: () => locator,
    waitFor: async () => record('locator:waitFor'),
    scrollIntoViewIfNeeded: async () => record('locator:scrollIntoView'),
    boundingBox: async () => ({ x: 100, y: 200, width: 80, height: 40 }),
    click: async () => record('locator:click'),
    fill: async (value: string) => record('locator:fill', value),
    evaluate: async () => record('locator:evaluate'),
  };

  const page = {
    evaluate: async (fn: (arg: unknown) => unknown, arg: unknown) => fn(arg),
    waitForTimeout: async (ms: number) => record('wait', ms),
    waitForLoadState: async () => undefined,
    goto: async (url: string) => record('goto', url),
    mouse: {
      move: async (x: number, y: number) => record('mouse:move', [x, y]),
    },
    keyboard: { type: async (text: string) => record('key', text) },
  };

  return {
    stage: new Stage(page as never),
    locator: locator as never,
    calls,
    kinds: () => calls.map((call) => call.kind),
  };
}

/** Index of the first call of a kind, or -1. */
const at = (kinds: string[], kind: string) => kinds.indexOf(kind);

describe('Stage.click', () => {
  it('lands the cursor on the target before clicking it', async () => {
    const { stage, locator, kinds } = makeStage();
    await stage.click(locator);
    const order = kinds();

    expect(at(order, 'overlay:moveCursor')).toBeGreaterThan(-1);
    expect(at(order, 'overlay:moveCursor')).toBeLessThan(
      at(order, 'locator:click')
    );
  });

  it('moves the real mouse only after the drawn cursor has arrived', async () => {
    // Moving both together would fire hover states on everything the cursor
    // sweeps past, lighting up unrelated rows mid-glide.
    const { stage, locator, kinds } = makeStage();
    await stage.click(locator);
    const order = kinds();

    expect(at(order, 'overlay:moveCursor')).toBeLessThan(
      at(order, 'mouse:move')
    );
    expect(at(order, 'mouse:move')).toBeLessThan(at(order, 'locator:click'));
  });

  it('shows the click ripple before the click, not after', async () => {
    const { stage, locator, kinds } = makeStage();
    await stage.click(locator);
    const order = kinds();

    expect(at(order, 'overlay:clickFeedback')).toBeLessThan(
      at(order, 'locator:click')
    );
  });

  it('aims at the centre of the target', async () => {
    const { stage, locator, calls } = makeStage();
    await stage.click(locator);

    const move = calls.find((call) => call.kind === 'overlay:moveCursor');
    // Box is x:100 y:200 w:80 h:40, so the centre is (140, 220).
    expect((move?.detail as number[]).slice(0, 2)).toEqual([140, 220]);
  });

  it('scrolls the target into view before measuring it', async () => {
    const { stage, locator, kinds } = makeStage();
    await stage.click(locator);
    const order = kinds();

    expect(at(order, 'locator:scrollIntoView')).toBeLessThan(
      at(order, 'overlay:moveCursor')
    );
  });
});

describe('Stage.highlight', () => {
  it('raises the spotlight before the caption describes it', async () => {
    const { stage, locator, kinds } = makeStage();
    await stage.highlight(locator, { say: 'Spotlight dims everything else' });
    const order = kinds();

    expect(at(order, 'overlay:spotlight')).toBeLessThan(
      at(order, 'overlay:showCaption')
    );
  });

  it('passes the element box through to the overlay', async () => {
    const { stage, locator, calls } = makeStage();
    await stage.highlight(locator);

    const spotlight = calls.find((call) => call.kind === 'overlay:spotlight');
    expect((spotlight?.detail as unknown[])[0]).toEqual({
      x: 100,
      y: 200,
      width: 80,
      height: 40,
    });
  });

  it('clears by spotlighting nothing', async () => {
    const { stage, calls } = makeStage();
    await stage.clearHighlight();

    const spotlight = calls.find((call) => call.kind === 'overlay:spotlight');
    expect((spotlight?.detail as unknown[])[0]).toBeNull();
  });
});

describe('Stage.click with spotlight', () => {
  it('raises the spotlight before the caption', async () => {
    const { stage, locator, kinds } = makeStage();
    await stage.click(locator, { say: 'Assign it', spotlight: true });
    const order = kinds();

    expect(at(order, 'overlay:spotlight')).toBeLessThan(
      at(order, 'overlay:showCaption')
    );
  });

  it('says the caption exactly once', async () => {
    const { stage, locator, kinds } = makeStage();
    await stage.click(locator, { say: 'Assign it', spotlight: true });

    const said = kinds().filter((kind) => kind === 'overlay:showCaption');
    expect(said.length).toBe(1);
  });

  it('drops the spotlight after the click resolves', async () => {
    const { stage, locator, calls } = makeStage();
    await stage.click(locator, { spotlight: true });

    const spotlights = calls.filter(
      (call) => call.kind === 'overlay:spotlight'
    );
    expect(spotlights.length).toBe(2);
    expect((spotlights[1]?.detail as unknown[])[0]).toBeNull();
  });
});

describe('Stage.type', () => {
  it('types one key at a time rather than filling the field', async () => {
    const { stage, locator, calls } = makeStage();
    await stage.type(locator, 'abc');

    const keys = calls.filter((call) => call.kind === 'key');
    expect(keys.map((call) => call.detail)).toEqual(['a', 'b', 'c']);
  });

  it('focuses the field before typing into it', async () => {
    const { stage, locator, kinds } = makeStage();
    await stage.type(locator, 'abc');
    const order = kinds();

    expect(at(order, 'locator:click')).toBeLessThan(at(order, 'key'));
  });

  it('clears the field first only when asked', async () => {
    const plain = makeStage();
    await plain.stage.type(plain.locator, 'abc');
    expect(plain.kinds()).not.toContain('locator:fill');

    const cleared = makeStage();
    await cleared.stage.type(cleared.locator, 'abc', { clear: true });
    expect(cleared.kinds()).toContain('locator:fill');
  });

  it('pauses between keystrokes', async () => {
    const { stage, locator, calls } = makeStage();
    await stage.type(locator, 'abc');

    // A wait precedes each of the three keystrokes.
    const waitsBeforeKeys = calls.filter(
      (call, index) => call.kind === 'wait' && calls[index + 1]?.kind === 'key'
    );
    expect(waitsBeforeKeys.length).toBe(3);
  });

  it('gives successive fields different typing rhythms', async () => {
    const { stage, locator, calls } = makeStage();
    await stage.type(locator, 'abcdefgh');
    await stage.type(locator, 'abcdefgh');

    const waits = calls
      .filter(
        (call, index) =>
          call.kind === 'wait' && calls[index + 1]?.kind === 'key'
      )
      .map((call) => call.detail as number);

    const first = waits.slice(0, 8);
    const second = waits.slice(8, 16);
    expect(first).not.toEqual(second);
  });
});
