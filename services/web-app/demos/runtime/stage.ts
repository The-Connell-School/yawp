/**
 * The authoring API for demo scripts.
 *
 * A demo reads as a sequence of beats — say something, move somewhere, click,
 * type — and the Stage turns each beat into two parallel things: the real
 * Playwright interaction, and the visible motion that makes the recording
 * legible to someone who was not there.
 *
 * Every method waits for what it just did to settle before returning, so a
 * script is a flat list of awaits with no manual sleeps.
 */

import type { Locator, Page } from '@playwright/test';
import { BEATS } from '../theme';
import type { CardContent, DemoOverlayApi } from './overlay';
import { captionHoldMs, travelDurationMs, typingDelays } from './timing';

/** Playwright evaluates in the page, where `window.__demo` exists. */
declare global {
  interface Window {
    __demo?: DemoOverlayApi;
  }
}

export type SayOptions = {
  /** Override the reading-time-derived hold, in milliseconds. */
  hold?: number;
};

export type ActionOptions = {
  /** Caption to show alongside the action. */
  say?: string;
  /** Dim the rest of the page and ring this element while acting on it. */
  spotlight?: boolean;
  /** Extra pause after the action settles. */
  hold?: number;
};

export type TypeOptions = ActionOptions & {
  /** Median milliseconds per keystroke. Lower reads as a confident typist. */
  speedMs?: number;
  /** Clear the field before typing. */
  clear?: boolean;
};

export class Stage {
  private typingSeed = 1;

  constructor(readonly page: Page) {}

  /* ---------------------------------------------------------------- speech */

  /**
   * Show a caption and hold it long enough to read.
   *
   * Captions are the narration track. Aim for one short clause per beat —
   * anything that takes more than a breath to read should be two beats.
   */
  async say(text: string, options: SayOptions = {}): Promise<void> {
    await this.overlay('showCaption', text);
    await this.page.waitForTimeout(options.hold ?? captionHoldMs(text));
  }

  /** Drop the current caption without saying anything new. */
  async hush(): Promise<void> {
    await this.overlay('hideCaption');
  }

  /* ----------------------------------------------------------------- cards */

  async showCard(content: CardContent, holdMs: number): Promise<void> {
    await this.overlay('showCard', content);
    await this.page.waitForTimeout(holdMs);
  }

  async hideCard(): Promise<void> {
    await this.overlay('hideCard');
  }

  /* ------------------------------------------------------------ navigation */

  /**
   * Go to a path and wait for it to settle.
   *
   * Captions survive the navigation only if said afterwards, so `say` here
   * fires once the new page is ready rather than on the outgoing one.
   */
  async goto(path: string, options: ActionOptions = {}): Promise<void> {
    await this.page.goto(path);
    await this.settle();
    if (options.say) await this.say(options.say);
    await this.page.waitForTimeout(options.hold ?? BEATS.afterNavigate);
  }

  /** Smoothly scroll a target to the middle of the frame. */
  async scrollTo(target: Locator): Promise<void> {
    await target.first().evaluate((element) => {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    // Smooth scrolling is not awaitable; this covers the animation.
    await this.page.waitForTimeout(700);
  }

  /* ---------------------------------------------------------- interactions */

  /** Glide the cursor onto an element without clicking it. */
  async moveTo(target: Locator): Promise<void> {
    const point = await this.centerOf(target);
    await this.glide(point);
  }

  async click(target: Locator, options: ActionOptions = {}): Promise<void> {
    const element = target.first();
    await element.scrollIntoViewIfNeeded();

    // When spotlighting, let highlight() own the caption so the scrim is up
    // before the narration refers to it — and so it is not said twice.
    if (options.spotlight) {
      await this.highlight(element, { say: options.say });
    } else if (options.say) {
      await this.say(options.say);
    }

    const point = await this.centerOf(element);
    await this.glide(point, { pointer: true });

    await this.overlay('clickFeedback');
    await element.click();

    if (options.spotlight) await this.clearHighlight();
    await this.settle();
    await this.page.waitForTimeout(options.hold ?? BEATS.afterClick);
  }

  /**
   * Type into a field one key at a time, with human cadence.
   *
   * Playwright can fill a field instantly, but instant text is the single
   * biggest tell that a video is automated — so this issues real keystrokes
   * with jittered gaps and pauses at punctuation.
   */
  async type(
    target: Locator,
    text: string,
    options: TypeOptions = {}
  ): Promise<void> {
    const element = target.first();
    await element.scrollIntoViewIfNeeded();

    if (options.say) await this.say(options.say);

    const point = await this.centerOf(element);
    await this.glide(point, { pointer: true });
    await this.overlay('clickFeedback');
    await element.click();

    if (options.clear) await element.fill('');

    // Seed advances per call so two fields in one demo do not share a rhythm.
    const delays = typingDelays(text, {
      baseMs: options.speedMs ?? 55,
      seed: this.typingSeed++,
    });

    for (const [index, char] of Array.from(text).entries()) {
      await this.page.waitForTimeout(delays[index]!);
      await this.page.keyboard.type(char);
    }

    await this.page.waitForTimeout(options.hold ?? BEATS.afterClick);
  }

  /* ------------------------------------------------------------- spotlight */

  /** Dim the page and ring an element, to point at something without clicking. */
  async highlight(target: Locator, options: ActionOptions = {}): Promise<void> {
    const element = target.first();
    await element.scrollIntoViewIfNeeded();

    const box = await element.boundingBox();
    if (!box) throw new Error('Cannot spotlight an element with no box');

    // Scrim first, then narration. Said the other way round, the caption
    // describes a highlight the viewer cannot see yet.
    await this.overlay('spotlight', box);
    if (options.say) await this.say(options.say);
    if (options.hold) await this.page.waitForTimeout(options.hold);
  }

  async clearHighlight(): Promise<void> {
    await this.overlay('spotlight', null);
  }

  /* ----------------------------------------------------------------- pauses */

  /** Hold on the current frame. Use sparingly; dead air reads as a bug. */
  async beat(ms: number = BEATS.afterClick): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  /* ---------------------------------------------------------------- internals */

  /**
   * Move the drawn cursor, then bring the real one along.
   *
   * The real mouse only jumps to the destination at the end. Moving it in
   * lockstep would fire a hover on everything the path crosses, lighting up
   * unrelated rows and buttons as the cursor sweeps past them.
   */
  private async glide(
    point: { x: number; y: number },
    options: { pointer?: boolean } = {}
  ): Promise<void> {
    const from = await this.overlay('cursorPosition');
    const distance = Math.hypot(point.x - from.x, point.y - from.y);
    const duration = travelDurationMs(distance);

    if (options.pointer) {
      await this.overlay('setCursorStyle', 'pointer');
    }

    await this.overlay('moveCursor', point.x, point.y, duration);
    await this.page.mouse.move(point.x, point.y);

    if (options.pointer) {
      await this.overlay('setCursorStyle', 'default');
    }
  }

  private async centerOf(target: Locator): Promise<{ x: number; y: number }> {
    const element = target.first();
    await element.waitFor({ state: 'visible' });
    const box = await element.boundingBox();
    if (!box) {
      throw new Error('Target has no bounding box — is it visible?');
    }
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  /** Wait for the app to stop moving, tolerating routes that keep a socket open. */
  private async settle(): Promise<void> {
    await this.page
      .waitForLoadState('networkidle', { timeout: 5000 })
      .catch(() => undefined);
  }

  /**
   * Call a method on the injected overlay.
   *
   * Dispatched by name because `page.evaluate` serializes its callback and
   * cannot close over anything on this side. Centralized so every call site
   * gets the same "overlay is missing" error instead of an opaque
   * `undefined is not a function` from inside the page.
   */
  private overlay<K extends keyof DemoOverlayApi>(
    method: K,
    ...args: Parameters<DemoOverlayApi[K]>
  ): Promise<Awaited<ReturnType<DemoOverlayApi[K]>>> {
    return this.page.evaluate(
      ({ method, args }) => {
        const api = window.__demo;
        if (!api) throw new Error('Demo overlay is not installed on this page');
        const fn = api[method] as (...a: unknown[]) => unknown;
        return fn.apply(api, args) as never;
      },
      { method, args: args as unknown[] }
    );
  }
}
