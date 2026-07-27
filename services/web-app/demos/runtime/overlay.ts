/**
 * The in-page overlay: cursor, captions, cards, and spotlight.
 *
 * This is what separates a demo video from a screen recording. Playwright's
 * real mouse is invisible in a capture and moves by teleporting, so we draw
 * our own cursor and animate it with eased motion, then fire the real click
 * once it arrives.
 *
 * `installOverlay` is serialized and injected with `page.addInitScript`, so it
 * must be entirely self-contained — no imports, no closure over module scope.
 * It re-runs on every navigation, which is why it restores the cursor position
 * from sessionStorage: without that, the cursor would snap back to center
 * every time the app routed to a new page.
 */

export type OverlayTheme = {
  accent: string;
  ink: string;
  captionBackground: string;
  captionForeground: string;
  scrimColor: string;
  fontStack: string;
};

export type CardContent = {
  kicker?: string;
  title: string;
  subtitle?: string;
};

export type Rect = { x: number; y: number; width: number; height: number };

/** Shape of `window.__demo`, available to `page.evaluate` after injection. */
export type DemoOverlayApi = {
  cursorPosition(): { x: number; y: number };
  placeCursor(x: number, y: number): void;
  moveCursor(x: number, y: number, durationMs: number): Promise<void>;
  clickFeedback(): Promise<void>;
  setCursorStyle(style: 'default' | 'pointer' | 'text'): void;
  showCaption(text: string): Promise<void>;
  hideCaption(): Promise<void>;
  showCard(content: CardContent): Promise<void>;
  hideCard(): Promise<void>;
  spotlight(rect: Rect | null): Promise<void>;
  hideCursor(): void;
  showCursor(): void;
};

declare global {
  interface Window {
    __demo?: DemoOverlayApi;
  }
}

export type OverlayConfig = { theme: OverlayTheme; fadeMs: number };

/**
 * Injected with `page.addInitScript`, which serializes this function with
 * `toString()`. It therefore cannot reference anything in module scope —
 * every constant it needs is declared inside the body, and its whole
 * configuration arrives as the single `config` argument.
 */
export function installOverlay(config: OverlayConfig): void {
  // addInitScript fires once per document; bail if a re-entrant load beat us.
  if (window.__demo) return;

  const { theme, fadeMs } = config;
  const CURSOR_POSITION_KEY = 'yawp-demo-cursor-position';
  const CARD_STATE_KEY = 'yawp-demo-card-state';

  const EASE = 'cubic-bezier(0.22, 0.85, 0.24, 1)';
  let cursorX = window.innerWidth / 2;
  let cursorY = window.innerHeight * 0.62;

  try {
    const saved = sessionStorage.getItem(CURSOR_POSITION_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as { x: number; y: number };
      if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
        cursorX = parsed.x;
        cursorY = parsed.y;
      }
    }
  } catch {
    // Private mode or a cross-origin document; center is a fine fallback.
  }

  let root: ShadowRoot;
  let cursorEl: HTMLElement;
  let rippleLayer: HTMLElement;
  let captionEl: HTMLElement;
  let cardEl: HTMLElement;
  let spotlightEl: HTMLElement;

  function mount(): void {
    // documentElement can be momentarily absent this early in the load.
    if (!document.documentElement) {
      requestAnimationFrame(mount);
      return;
    }

    const host = document.createElement('div');
    host.id = 'yawp-demo-overlay';
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = [
      'position:fixed',
      'inset:0',
      'pointer-events:none',
      // Above every dialog, toast, and portal the app can render.
      'z-index:2147483647',
    ].join(';');

    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = template();
    document.documentElement.appendChild(host);

    cursorEl = root.getElementById('cursor') as HTMLElement;
    rippleLayer = root.getElementById('ripples') as HTMLElement;
    captionEl = root.getElementById('caption') as HTMLElement;
    cardEl = root.getElementById('card') as HTMLElement;
    spotlightEl = root.getElementById('spotlight') as HTMLElement;

    applyCursorPosition();
    restoreCard();
  }

  function setCardContent(content: CardContent): void {
    (root.querySelector('#card .kicker') as HTMLElement).textContent =
      content.kicker ?? '';
    (root.querySelector('#card .title') as HTMLElement).textContent =
      content.title;
    (root.querySelector('#card .subtitle') as HTMLElement).textContent =
      content.subtitle ?? '';
  }

  /**
   * Bring back a card that was up before a navigation.
   *
   * Cards double as a curtain: sign-in and setup happen behind one so the
   * finished video never shows a login form. Because this script re-runs per
   * document, the card would otherwise drop on every route change and flash
   * the app underneath — so it is restored instantly, with transitions
   * suppressed for one frame.
   */
  function restoreCard(): void {
    let stored: CardContent | null = null;
    try {
      const raw = sessionStorage.getItem(CARD_STATE_KEY);
      if (raw) stored = JSON.parse(raw) as CardContent;
    } catch {
      return;
    }
    if (!stored || typeof stored.title !== 'string') return;

    setCardContent(stored);
    cardEl.classList.add('no-transition', 'is-visible');
    requestAnimationFrame(() => cardEl.classList.remove('no-transition'));
  }

  function template(): string {
    return `
      <style>
        :host { all: initial; }
        .layer { position: fixed; inset: 0; pointer-events: none; }

        #cursor {
          position: fixed; top: 0; left: 0; width: 26px; height: 26px;
          transform-origin: 4px 3px;
          will-change: transform;
          filter: drop-shadow(0 3px 6px rgba(20, 18, 15, 0.38));
          transition: opacity 200ms linear;
        }
        #cursor.is-hidden { opacity: 0; }
        #cursor .halo {
          opacity: 0;
          transition: opacity 220ms ${EASE};
        }
        #cursor.is-pointer .halo { opacity: 1; }

        .ripple {
          position: fixed; top: 0; left: 0;
          width: 14px; height: 14px; margin: -7px 0 0 -7px;
          border-radius: 999px;
          border: 2px solid ${theme.accent};
          opacity: 0.95;
          animation: ripple 620ms ${EASE} forwards;
        }
        @keyframes ripple {
          to { transform: scale(3.6); opacity: 0; }
        }

        #caption {
          position: fixed; left: 50%; bottom: 46px;
          transform: translate(-50%, 14px);
          max-width: min(760px, 78vw);
          padding: 13px 24px;
          border-radius: 999px;
          background: ${theme.captionBackground};
          -webkit-backdrop-filter: blur(14px) saturate(1.4);
          backdrop-filter: blur(14px) saturate(1.4);
          color: ${theme.captionForeground};
          font-family: ${theme.fontStack};
          font-size: 19px; font-weight: 500; line-height: 1.35;
          letter-spacing: -0.011em;
          text-align: center; text-wrap: balance;
          box-shadow: 0 12px 34px rgba(20, 18, 15, 0.3);
          opacity: 0;
          transition: opacity ${fadeMs}ms ${EASE}, transform ${fadeMs}ms ${EASE};
        }
        #caption.is-visible { opacity: 1; transform: translate(-50%, 0); }

        #card {
          position: fixed; inset: 0;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          gap: 14px; padding: 0 8vw;
          background: ${theme.ink};
          font-family: ${theme.fontStack};
          text-align: center;
          opacity: 0;
          transition: opacity ${fadeMs}ms ${EASE};
        }
        #card.is-visible { opacity: 1; }
        #card .kicker {
          color: ${theme.accent};
          font-size: 13px; font-weight: 600;
          letter-spacing: 0.16em; text-transform: uppercase;
        }
        #card .title {
          color: #faf8f3;
          font-size: 46px; font-weight: 600; line-height: 1.1;
          letter-spacing: -0.028em; text-wrap: balance;
        }
        #card .subtitle {
          color: rgba(250, 248, 243, 0.62);
          font-size: 20px; font-weight: 400; line-height: 1.45;
          letter-spacing: -0.008em; max-width: 30em; text-wrap: balance;
        }
        #card .kicker:empty, #card .subtitle:empty { display: none; }
        /* Content drifts up as the card fades in — a small thing that keeps
           the opening from feeling like a static slide. */
        #card .kicker, #card .title, #card .subtitle {
          transform: translateY(9px);
          transition: transform ${fadeMs + 140}ms ${EASE};
        }
        #card.is-visible .kicker,
        #card.is-visible .title,
        #card.is-visible .subtitle { transform: translateY(0); }
        #card.no-transition, #card.no-transition * { transition: none !important; }

        #spotlight {
          position: fixed; top: 0; left: 0;
          width: 0; height: 0;
          border-radius: 14px;
          box-shadow: 0 0 0 9999px ${theme.scrimColor};
          outline: 2px solid ${theme.accent};
          outline-offset: 2px;
          opacity: 0;
          transition:
            opacity ${fadeMs}ms ${EASE},
            transform 420ms ${EASE},
            width 420ms ${EASE},
            height 420ms ${EASE};
        }
        #spotlight.is-visible { opacity: 1; }
      </style>

      <div class="layer" id="ripples"></div>
      <div id="spotlight"></div>
      <svg id="cursor" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle class="halo" cx="4.5" cy="3.5" r="11" fill="${theme.accent}" fill-opacity="0.22"/>
        <path d="M4 2.2 L4 19.4 L8.6 15.2 L11.5 21.4 L14.4 20 L11.4 13.9 L17.6 13.6 Z"
              fill="#ffffff" stroke="${theme.ink}" stroke-width="1.4" stroke-linejoin="round"/>
      </svg>
      <div id="caption"></div>
      <div id="card">
        <div class="kicker"></div>
        <div class="title"></div>
        <div class="subtitle"></div>
      </div>
    `;
  }

  function applyCursorPosition(): void {
    cursorEl.style.transform = `translate(${cursorX}px, ${cursorY}px)`;
    try {
      sessionStorage.setItem(
        CURSOR_POSITION_KEY,
        JSON.stringify({ x: cursorX, y: cursorY })
      );
    } catch {
      // Non-fatal: the cursor just re-centers on the next navigation.
    }
  }

  function easeInOutCubic(t: number): number {
    const x = t < 0 ? 0 : t > 1 ? 1 : t;
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }

  function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  const api: DemoOverlayApi = {
    cursorPosition: () => ({ x: cursorX, y: cursorY }),

    placeCursor(x, y) {
      cursorX = x;
      cursorY = y;
      applyCursorPosition();
    },

    moveCursor(x, y, durationMs) {
      const startX = cursorX;
      const startY = cursorY;
      const deltaX = x - startX;
      const deltaY = y - startY;

      if (durationMs <= 0 || (deltaX === 0 && deltaY === 0)) {
        api.placeCursor(x, y);
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        const start = performance.now();
        const step = (now: number) => {
          const progress = Math.min((now - start) / durationMs, 1);
          const eased = easeInOutCubic(progress);
          cursorX = startX + deltaX * eased;
          cursorY = startY + deltaY * eased;
          applyCursorPosition();
          if (progress < 1) {
            requestAnimationFrame(step);
          } else {
            resolve();
          }
        };
        requestAnimationFrame(step);
      });
    },

    async clickFeedback() {
      const ripple = document.createElement('div');
      ripple.className = 'ripple';
      ripple.style.transform = `translate(${cursorX}px, ${cursorY}px)`;
      rippleLayer.appendChild(ripple);
      setTimeout(() => ripple.remove(), 700);

      // A quick press-and-release on the cursor itself, so the click reads
      // even when the underlying element has no hover or active state.
      cursorEl.animate(
        [{ scale: '1' }, { scale: '0.82' }, { scale: '1' }],
        { duration: 220, easing: 'ease-out' }
      );
      await wait(120);
    },

    setCursorStyle(style) {
      cursorEl.classList.toggle('is-pointer', style === 'pointer');
    },

    hideCursor() {
      cursorEl.classList.add('is-hidden');
    },

    showCursor() {
      cursorEl.classList.remove('is-hidden');
    },

    async showCaption(text) {
      const isSwap = captionEl.classList.contains('is-visible');
      if (isSwap && captionEl.textContent !== text) {
        // Swap through empty rather than morphing text mid-fade, which
        // otherwise reads as a glitch.
        captionEl.classList.remove('is-visible');
        await wait(fadeMs);
      }
      captionEl.textContent = text;
      // Force layout so the transition runs from the hidden state.
      void captionEl.offsetWidth;
      captionEl.classList.add('is-visible');
      await wait(fadeMs);
    },

    async hideCaption() {
      if (!captionEl.classList.contains('is-visible')) return;
      captionEl.classList.remove('is-visible');
      await wait(fadeMs);
    },

    async showCard(content) {
      setCardContent(content);
      try {
        sessionStorage.setItem(CARD_STATE_KEY, JSON.stringify(content));
      } catch {
        // Non-fatal: the card just will not survive a navigation.
      }
      void cardEl.offsetWidth;
      cardEl.classList.add('is-visible');
      await wait(fadeMs + 140);
    },

    async hideCard() {
      try {
        sessionStorage.removeItem(CARD_STATE_KEY);
      } catch {
        // Ignore; the card is being torn down anyway.
      }
      if (!cardEl.classList.contains('is-visible')) return;
      cardEl.classList.remove('is-visible');
      await wait(fadeMs);
    },

    async spotlight(rect) {
      if (!rect) {
        if (!spotlightEl.classList.contains('is-visible')) return;
        spotlightEl.classList.remove('is-visible');
        await wait(fadeMs);
        return;
      }

      const pad = 8;
      const wasVisible = spotlightEl.classList.contains('is-visible');
      spotlightEl.style.width = `${rect.width + pad * 2}px`;
      spotlightEl.style.height = `${rect.height + pad * 2}px`;
      spotlightEl.style.transform = `translate(${rect.x - pad}px, ${rect.y - pad}px)`;

      if (!wasVisible) {
        void spotlightEl.offsetWidth;
        spotlightEl.classList.add('is-visible');
      }
      // A glide between two targets is slower than a plain fade-in.
      await wait(wasVisible ? 440 : fadeMs);
    },
  };

  mount();
  window.__demo = api;
}
