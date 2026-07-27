/**
 * Exercises every Stage verb against a static fixture page.
 *
 * This is the demo to run when you are changing how demos *look* — cursor
 * easing, caption styling, card typography, spotlight weight. It needs no
 * database and no dev server, so the edit-record-watch loop is about twenty
 * seconds instead of several minutes.
 *
 * It is also the fastest way to tell whether a broken recording is the tool's
 * fault or the app's: if the self-test records cleanly, the tool is fine.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineDemo } from '../runtime/record';

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'self-test.html'
);

export default defineDemo({
  name: 'self-test',
  kicker: 'Demo runtime',
  title: 'Every verb, once',
  subtitle:
    'A styling harness for the demo tool itself — no database, no dev server.',
  endCard: {
    kicker: 'Demo runtime',
    title: 'Runtime OK',
    subtitle: 'Cursor, captions, typing, spotlight, scroll, and encode.',
  },

  async fixtureServer() {
    const server = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(Bun.file(FIXTURE), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
    });
    return {
      url: `http://127.0.0.1:${server.port}`,
      close: async () => {
        await server.stop(true);
      },
    };
  },

  async run(stage) {
    const { page } = stage;

    await stage.say('The cursor glides instead of teleporting');
    await stage.moveTo(page.locator('#nav-practice'));

    await stage.highlight(page.locator('#card-wordiness'), {
      say: 'Spotlight dims everything else',
      hold: 1600,
    });
    await stage.clearHighlight();

    await stage.type(
      page.locator('#prompt'),
      'Trim this paragraph to half its length. Keep the argument intact.',
      { say: 'Text is typed key by key, with pauses at punctuation' }
    );

    await stage.click(page.locator('#assign'), {
      say: 'Clicks land with a ripple',
    });

    await stage.say('And the frame can follow you down the page');
    await stage.scrollTo(page.locator('#footer-panel'));
    await stage.beat(900);
  },
});
