/**
 * Writing practice — the self-guided grammar lessons prototype.
 *
 * The feature is intentionally URL-only right now (see #194): it is reachable
 * at /app/writing-lessons but deliberately absent from the student dashboard
 * nav, so this demo navigates there directly rather than clicking through.
 *
 * Requires a running dev server with a seeded database:
 *   bun dev                 (repo root, in another terminal)
 *   bun demo writing-practice
 */

import { defineDemo } from '../runtime/record';
import { signIn } from '../runtime/sign-in';

export default defineDemo({
  name: 'writing-practice',
  kicker: 'New in Yawp',
  title: 'Writing practice',
  subtitle:
    'Focused grammar lessons with a prompt students can answer and check on their own.',
  endCard: {
    kicker: 'New in Yawp',
    title: 'Writing practice',
    subtitle: 'Prototype · reachable by URL while we test it.',
  },

  async setup(stage) {
    await signIn(stage.page, 'student');
  },

  async run(stage) {
    const { page } = stage;

    await stage.goto('/app/writing-lessons', {
      say: 'Ten lesson families, recovered from the original Yawp',
    });

    await stage.highlight(
      page.getByText(/self-guided practice prompts/i).first(),
      {
        say: 'Every lesson carries its own practice prompts',
        hold: 1200,
      }
    );
    await stage.clearHighlight();

    await stage.click(
      page.getByRole('link', { name: /revising for wordiness/i }),
      { say: 'A student picks one and starts practising' }
    );

    await stage.say('The lesson itself is on the left');
    await stage.beat(900);

    await stage.highlight(page.getByText('Practice prompt').first(), {
      say: 'The drill sits alongside it, always in view',
      hold: 1200,
    });
    await stage.clearHighlight();

    await stage.type(
      page.locator('#practice-response'),
      'The committee decided to postpone the vote.',
      { say: 'They rewrite the sentence in their own words' }
    );

    await stage.click(page.getByRole('button', { name: /check response/i }), {
      say: 'And check it without waiting on a teacher',
    });

    await stage.highlight(page.getByText(/score preview/i).first(), {
      say: 'A first-pass score, plus what to do next',
      hold: 1800,
    });
    await stage.clearHighlight();
  },
});
