/**
 * The booth video's "visual voiceover", injected into every page before the
 * app loads (Playwright addInitScript). It draws, above the app:
 *
 *  - a caption bar along the bottom (the narrator's line),
 *  - a chapter pill top right ("2 / 7 · The student experience"),
 *  - callouts styled after the in-app guided tour (guided-tour.tsx): a cream
 *    card with a spotlight ring on the thing being described,
 *  - a cursor, because the screen capture can't see a real one.
 *
 * Sizes are larger than the tour's so they read from across a booth.
 * Chapter and cursor position survive navigation through localStorage.
 */
(() => {
  if (window.__booth) return;
  const STATE_KEY = 'booth-video-state';
  const readState = () => {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}'); } catch { return {}; }
  };
  const writeState = (patch) => {
    try { localStorage.setItem(STATE_KEY, JSON.stringify({ ...readState(), ...patch })); } catch { /* storage off */ }
  };

  const css = `
    #booth-root { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000; font-family: Roboto, system-ui, sans-serif; }
    #booth-root * { box-sizing: border-box; }
    .booth-caption { position: absolute; left: 50%; bottom: 26px; transform: translate(-50%, 16px); max-width: 1180px;
      background: rgba(39, 37, 26, 0.94); color: #FFFEFA; border-radius: 16px; padding: 16px 30px 17px 26px;
      font-size: 30px; line-height: 1.3; font-weight: 500; letter-spacing: -0.01em; box-shadow: 0 12px 32px rgba(0,0,0,.28);
      opacity: 0; transition: opacity .45s ease, transform .45s ease; text-align: left; }
    .booth-caption.on { opacity: 1; transform: translate(-50%, 0); }
    .booth-chapter { position: absolute; top: 18px; right: 22px; display: flex; align-items: center; gap: 10px;
      background: rgba(255, 254, 250, 0.96); border: 1px solid #D6D5CF; border-radius: 999px; padding: 8px 16px 8px 9px;
      font-size: 17px; font-weight: 500; color: #3C3828; box-shadow: 0 4px 14px rgba(0,0,0,.10); opacity: 0; transition: opacity .4s ease; }
    .booth-chapter.on { opacity: 1; }
    html:has([role="dialog"][data-state="open"]) .booth-chapter { opacity: 0; }
    /* Full-screen views (editor, grading, revision) keep their own controls top right. */
    html:not(:has(a[href="/app/my-classes"])) .booth-chapter { opacity: 0; }
    .booth-chapter b { background: #D27151; color: #FFFEFA; border-radius: 999px; padding: 3px 10px; font-size: 15px; font-weight: 700; }
    .booth-spot { position: absolute; border-radius: 14px; box-shadow: 0 0 0 3px #D27151, 0 0 0 9999px rgba(0,0,0,0.45);
      opacity: 0; transition: opacity .35s ease, left .45s ease, top .45s ease, width .45s ease, height .45s ease; }
    .booth-spot.nodim { box-shadow: 0 0 0 4px #D27151, 0 0 24px 6px rgba(210,113,81,.45); }
    .booth-spot.on { opacity: 1; }
    .booth-card { position: absolute; width: 470px; background: #FFFEFA; color: #27251A; border: 1px solid #D6D5CF;
      border-radius: 16px; padding: 24px 26px 22px; box-shadow: 0 18px 40px -8px rgba(0,0,0,.35), 0 6px 12px -6px rgba(0,0,0,.2);
      opacity: 0; transform: scale(.95); transition: opacity .35s ease, transform .35s ease; }
    .booth-card.on { opacity: 1; transform: scale(1); }
    .booth-card .eyebrow { font-size: 14px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #D27151; margin-bottom: 8px; }
    .booth-card h2 { margin: 0; font-size: 26px; line-height: 1.22; font-weight: 700; color: #0f172a; letter-spacing: -0.01em; }
    .booth-card p { margin: 10px 0 0; font-size: 21px; line-height: 1.4; color: #57554b; }
    .booth-card .pills { display: flex; gap: 6px; margin-top: 18px; }
    .booth-card .pills i { display: block; height: 6px; width: 16px; border-radius: 999px; background: #E6E2D6; }
    .booth-card .pills i.done { background: rgba(210,113,81,.4); }
    .booth-card .pills i.cur { width: 26px; background: #D27151; }
    .booth-badge { position: absolute; top: 18px; left: 50%; transform: translateX(-50%); background: #D27151; color: #FFFEFA;
      border-radius: 999px; padding: 8px 18px; font-size: 18px; font-weight: 700; letter-spacing: .04em; opacity: 0; transition: opacity .3s ease; }
    .booth-badge.on { opacity: 1; }
    .booth-cursor { position: absolute; width: 30px; height: 30px; left: 0; top: 0; transition-property: transform; transition-timing-function: cubic-bezier(.45,.05,.25,1); }
    .booth-cursor svg { filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
    .booth-ripple { position: absolute; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 999px; border: 3px solid #D27151;
      animation: booth-ripple .6s ease-out forwards; }
    @keyframes booth-ripple { from { transform: scale(.3); opacity: 1; } to { transform: scale(1.4); opacity: 0; } }
  `;

  let root;
  const el = (cls, html = '') => {
    const node = document.createElement('div');
    node.className = cls;
    node.innerHTML = html;
    root.appendChild(node);
    return node;
  };
  const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  let caption, chapter, spot, card, badge, cursor;
  function mount() {
    if (document.getElementById('booth-root')) return;
    const style = document.createElement('style');
    style.textContent = css;
    document.documentElement.appendChild(style);
    root = document.createElement('div');
    root.id = 'booth-root';
    document.documentElement.appendChild(root);
    caption = el('booth-caption');
    chapter = el('booth-chapter');
    spot = el('booth-spot');
    card = el('booth-card');
    badge = el('booth-badge');
    cursor = el('booth-cursor', '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M4 2.5 L4 19.5 L8.6 15.4 L11.6 22 L14.6 20.7 L11.7 14.2 L18 14.2 Z" fill="#27251A" stroke="#FFFEFA" stroke-width="1.6" stroke-linejoin="round"/></svg>');
    const state = readState();
    applyDock(state.dock);
    if (state.chapter) api.chapter(state.chapter.n, state.chapter.total, state.chapter.title, true);
    const pos = state.cursor || { x: innerWidth * 0.6, y: innerHeight * 0.55 };
    cursor.style.transitionDuration = '0ms';
    cursor.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    cursor.style.display = state.cursorHidden ? 'none' : '';
  }

  function applyDock(dock) {
    if (!caption) return;
    if (dock) {
      Object.assign(caption.style, { left: `${dock.left + dock.width / 2}px`, maxWidth: `${dock.width}px`, width: 'max-content', bottom: `${dock.bottom ?? 26}px`, fontSize: dock.fontSize ? `${dock.fontSize}px` : '' });
    } else {
      Object.assign(caption.style, { left: '', maxWidth: '', width: '', bottom: '', fontSize: '' });
    }
  }

  const api = {
    caption(text) {
      if (!text) { caption.classList.remove('on'); return; }
      const swap = () => { caption.textContent = text; caption.classList.add('on'); };
      if (caption.classList.contains('on')) { caption.classList.remove('on'); setTimeout(swap, 260); } else swap();
    },
    /** Moves the caption bar: { left, width, bottom } in CSS px, or null for centred. */
    captionDock(dock) {
      writeState({ dock });
      applyDock(dock);
    },
    chapter(n, total, title, instant) {
      if (!n) { chapter.classList.remove('on'); writeState({ chapter: null }); return; }
      chapter.innerHTML = `<b>${n} / ${total}</b><span>${escape(title)}</span>`;
      if (instant) chapter.style.transition = 'none';
      chapter.classList.add('on');
      writeState({ chapter: { n, total, title } });
    },
    /** rect is in CSS px; omit for a centred card with no spotlight. */
    callout({ rect, title, body, eyebrow, side = 'auto', step, steps, dim = true }) {
      card.innerHTML =
        (eyebrow ? `<div class="eyebrow">${escape(eyebrow)}</div>` : '') +
        `<h2>${escape(title)}</h2>` +
        (body ? `<p>${escape(body)}</p>` : '') +
        (steps ? `<div class="pills">${Array.from({ length: steps }, (_, i) => `<i class="${i < step ? 'done' : i === step ? 'cur' : ''}"></i>`).join('')}</div>` : '');
      card.classList.remove('on');
      const pad = 8;
      if (rect) {
        Object.assign(spot.style, { left: `${rect.x - pad}px`, top: `${rect.y - pad}px`, width: `${rect.width + pad * 2}px`, height: `${rect.height + pad * 2}px` });
        spot.classList.toggle('nodim', !dim);
        spot.classList.add('on');
      } else {
        spot.classList.remove('on');
      }
      requestAnimationFrame(() => {
        const w = card.offsetWidth, h = card.offsetHeight, gap = 22, margin = 20;
        let x = (innerWidth - w) / 2, y = (innerHeight - h) / 2 - 40;
        if (rect) {
          const fits = {
            bottom: rect.y + rect.height + pad + gap + h < innerHeight - 110,
            top: rect.y - pad - gap - h > margin,
            right: rect.x + rect.width + pad + gap + w < innerWidth - margin,
            left: rect.x - pad - gap - w > margin,
          };
          const order = side === 'auto' ? ['bottom', 'top', 'right', 'left'] : [side, 'bottom', 'top', 'right', 'left'];
          const chosen = order.find((s) => fits[s]) || 'bottom';
          if (chosen === 'bottom' || chosen === 'top') {
            x = rect.x + rect.width / 2 - w / 2;
            y = chosen === 'bottom' ? rect.y + rect.height + pad + gap : rect.y - pad - gap - h;
          } else {
            y = rect.y + rect.height / 2 - h / 2;
            x = chosen === 'right' ? rect.x + rect.width + pad + gap : rect.x - pad - gap - w;
          }
          x = Math.max(margin, Math.min(innerWidth - w - margin, x));
          y = Math.max(margin + 50, Math.min(innerHeight - h - 110, y));
        }
        card.style.left = `${x}px`;
        card.style.top = `${y}px`;
        card.classList.add('on');
      });
    },
    clearCallout() {
      card.classList.remove('on');
      spot.classList.remove('on');
    },
    badge(text) {
      if (!text) { badge.classList.remove('on'); return; }
      badge.textContent = text;
      badge.classList.add('on');
    },
    cursorTo(x, y, ms = 700) {
      cursor.style.display = '';
      cursor.style.transitionDuration = `${ms}ms`;
      cursor.style.transform = `translate(${x}px, ${y}px)`;
      writeState({ cursor: { x, y }, cursorHidden: false });
    },
    hideCursor(hidden = true) {
      cursor.style.display = hidden ? 'none' : '';
      writeState({ cursorHidden: hidden });
    },
    ripple(x, y) {
      const r = el('booth-ripple');
      r.style.left = `${x}px`;
      r.style.top = `${y}px`;
      setTimeout(() => r.remove(), 700);
    },
    clearAll() {
      api.caption('');
      api.clearCallout();
      api.badge('');
    },
  };

  window.__booth = api;
  // React hydrates the whole document and may drop nodes it didn't render;
  // put the same nodes back so captions and callouts keep their state.
  let styleNode;
  setInterval(() => {
    if (!root) return;
    styleNode = styleNode || [...document.querySelectorAll('style')].find((s) => s.textContent === css);
    if (!root.isConnected) document.documentElement.appendChild(root);
    if (!styleNode || !styleNode.isConnected) {
      styleNode = document.createElement('style');
      styleNode.textContent = css;
      document.documentElement.appendChild(styleNode);
    }
  }, 100);
  if (document.documentElement) mount();
  else document.addEventListener('readystatechange', mount, { once: true });
  document.addEventListener('DOMContentLoaded', mount);
})();
