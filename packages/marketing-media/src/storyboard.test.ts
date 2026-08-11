import { describe, expect, test } from 'bun:test';
import {
  ALLOWED_ROUTES,
  MARKETING_PERSONAS,
  estimateRenderSeconds,
  parseStoryboard,
  safeParseStoryboard,
} from './storyboard';

function scene(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dashboard',
    goto: '/app',
    waitFor: 'main',
    ...overrides,
  };
}

function storyboard(overrides: Record<string, unknown> = {}) {
  return {
    slug: 'teacher-loop',
    title: 'The teacher loop',
    audience: 'Department chairs',
    persona: 'teacher',
    scenes: [scene()],
    ...overrides,
  };
}

// Opening a panel is not the same as showing it. A clip that clicks into the
// prompt library and holds still shows half of the first prompt before it
// ends; the list has to move for a viewer to learn there is a list.
describe('scroll pacing', () => {
  test('a scroll can be paced over seconds instead of jumping', () => {
    const parsed = parseStoryboard(
      storyboard({
        scenes: [scene({ steps: [{ action: 'scroll', y: 600, seconds: 3 }] })],
      })
    );

    const step = parsed.scenes[0].steps[0];
    expect(step).toMatchObject({ action: 'scroll', y: 600, seconds: 3 });
  });

  test('a scroll without seconds still jumps, as it always did', () => {
    const parsed = parseStoryboard(
      storyboard({ scenes: [scene({ steps: [{ action: 'scroll', y: 400 }] })] })
    );

    const step = parsed.scenes[0].steps[0];
    expect(step.action).toBe('scroll');
    if (step.action === 'scroll') expect(step.seconds).toBe(0);
  });

  // A three-second reveal costs three seconds of clip. Estimating it at the
  // flat per-step guess would let a storyboard sail past the render cap.
  test('a paced scroll is charged its own duration in the estimate', () => {
    const estimate = (steps: unknown[]) =>
      estimateRenderSeconds(
        parseStoryboard(storyboard({ scenes: [scene({ steps })] }))
      );

    // Measured against a scene with no steps, so the assertion is about the
    // four seconds being counted rather than about what a step costs.
    expect(
      estimate([{ action: 'scroll', y: 600, seconds: 4 }]) - estimate([])
    ).toBeCloseTo(4, 1);
  });
});

describe('parseStoryboard', () => {
  test('accepts a minimal valid storyboard and applies defaults', () => {
    const parsed = parseStoryboard(storyboard());

    expect(parsed.slug).toBe('teacher-loop');
    expect(parsed.persona).toBe('teacher');
    expect(parsed.viewport).toEqual({ width: 1440, height: 900 });
    expect(parsed.scenes[0].screenshot).toBe(true);
    expect(parsed.scenes[0].hold).toBeGreaterThan(0);
  });

  test('rejects a storyboard with no scenes', () => {
    const result = safeParseStoryboard(storyboard({ scenes: [] }));

    expect(result.success).toBe(false);
  });

  test('rejects more scenes than the render budget allows', () => {
    const scenes = Array.from({ length: 13 }, (_, index) =>
      scene({ id: `scene-${index}` })
    );

    expect(safeParseStoryboard(storyboard({ scenes })).success).toBe(false);
  });

  test('rejects duplicate scene ids so screenshots cannot collide', () => {
    const result = safeParseStoryboard(
      storyboard({ scenes: [scene(), scene()] })
    );

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('unique');
  });
});

describe('route allowlist', () => {
  test('every allowlisted route is an app-relative path', () => {
    for (const route of ALLOWED_ROUTES) {
      expect(route.startsWith('/')).toBe(true);
    }
  });

  test('rejects an off-allowlist internal route', () => {
    const result = safeParseStoryboard(
      storyboard({ scenes: [scene({ goto: '/app/admin/organizations' })] })
    );

    expect(result.success).toBe(false);
  });

  test('rejects navigation to an external origin', () => {
    for (const goto of [
      'https://example.com',
      'http://localhost:3000/app',
      '//example.com',
      'javascript:alert(1)',
    ]) {
      expect(
        safeParseStoryboard(storyboard({ scenes: [scene({ goto })] })).success
      ).toBe(false);
    }
  });

  test('rejects a route that only looks allowlisted', () => {
    const result = safeParseStoryboard(
      storyboard({ scenes: [scene({ goto: '/app/my-classes/../../etc' })] })
    );

    expect(result.success).toBe(false);
  });

  test('allows a goto step to an allowlisted route', () => {
    const parsed = parseStoryboard(
      storyboard({
        scenes: [
          scene({ steps: [{ action: 'goto', path: '/app/student-work' }] }),
        ],
      })
    );

    expect(parsed.scenes[0].steps?.[0]).toMatchObject({
      path: '/app/student-work',
    });
  });
});

describe('step allowlist', () => {
  test('rejects an unknown action', () => {
    const result = safeParseStoryboard(
      storyboard({
        scenes: [scene({ steps: [{ action: 'evaluate', script: 'x' }] })],
      })
    );

    expect(result.success).toBe(false);
  });

  test('rejects narration, which phase three owns', () => {
    const result = safeParseStoryboard(
      storyboard({
        scenes: [scene({ steps: [{ action: 'narrate', text: 'hi' }] })],
      })
    );

    expect(result.success).toBe(false);
  });

  test('requires a target for steps that need one', () => {
    const result = safeParseStoryboard(
      storyboard({ scenes: [scene({ steps: [{ action: 'click' }] })] })
    );

    expect(result.success).toBe(false);
  });

  test('accepts role, text, and css targets', () => {
    const parsed = parseStoryboard(
      storyboard({
        scenes: [
          scene({
            steps: [
              { action: 'click', role: 'link', name: 'graded' },
              { action: 'hover', text: 'Overall grade' },
              { action: 'scrollTo', selector: '.ProseMirror' },
            ],
          }),
        ],
      })
    );

    expect(parsed.scenes[0].steps).toHaveLength(3);
  });

  // Detail pages are reachable only by clicking, so a clip that wants to open
  // on one has to film the walk there. Marking the opening scene keeps that
  // navigation out of the delivered clip without letting a storyboard address
  // a record by id.
  test('lets a scene declare where the delivered clip opens', () => {
    const parsed = parseStoryboard(
      storyboard({
        scenes: [
          scene({ id: 'walk-there' }),
          scene({ id: 'the-shot', startsClip: true }),
        ],
      })
    );

    expect(parsed.scenes[0].startsClip).toBe(false);
    expect(parsed.scenes[1].startsClip).toBe(true);
  });

  test('accepts a scene that pushes in on one element', () => {
    const parsed = parseStoryboard(
      storyboard({
        scenes: [
          scene({ focus: { text: 'Overall Feedback', scale: 1.8 } }),
        ],
      })
    );

    expect(parsed.scenes[0].focus).toMatchObject({
      text: 'Overall Feedback',
      scale: 1.8,
    });
  });

  test('rejects a push-in with nothing to aim at', () => {
    const result = safeParseStoryboard(
      storyboard({ scenes: [scene({ focus: { scale: 1.5 } })] })
    );

    expect(result.success).toBe(false);
  });

  // Past roughly 2x the surrounding context is gone and the clip stops
  // reading as the product.
  test('rejects a push-in past what still shows the product', () => {
    const result = safeParseStoryboard(
      storyboard({
        scenes: [scene({ focus: { text: 'Overall Feedback', scale: 6 } })],
      })
    );

    expect(result.success).toBe(false);
  });

  // Dropdown menus portal their items to the end of the document, so a text
  // match resolves to page copy higher up and the click times out on
  // something inert. Without this role a storyboard cannot name a menu entry
  // at all — which is exactly how a generated "open New, pick Assignment"
  // clip burned its whole retry budget.
  test('accepts a menu item target so portaled menus are filmable', () => {
    const parsed = parseStoryboard(
      storyboard({
        scenes: [
          scene({
            steps: [
              { action: 'click', role: 'button', name: 'New' },
              { action: 'click', role: 'menuitem', name: 'Assignment' },
            ],
          }),
        ],
      })
    );

    expect(parsed.scenes[0].steps[1]).toMatchObject({
      role: 'menuitem',
      name: 'Assignment',
    });
  });

  test('rejects a selector carrying script content', () => {
    const result = safeParseStoryboard(
      storyboard({
        scenes: [
          scene({
            steps: [{ action: 'click', selector: '<script>alert(1)</script>' }],
          }),
        ],
      })
    );

    expect(result.success).toBe(false);
  });

  test('rejects a key outside the allowlist', () => {
    expect(
      safeParseStoryboard(
        storyboard({
          scenes: [scene({ steps: [{ action: 'press', key: 'F12' }] })],
        })
      ).success
    ).toBe(false);

    expect(
      safeParseStoryboard(
        storyboard({
          scenes: [scene({ steps: [{ action: 'press', key: 'Enter' }] })],
        })
      ).success
    ).toBe(true);
  });

  test('caps typed text so a storyboard cannot write an essay', () => {
    const result = safeParseStoryboard(
      storyboard({
        scenes: [
          scene({
            steps: [
              {
                action: 'type',
                selector: '.ProseMirror',
                text: 'x'.repeat(1001),
              },
            ],
          }),
        ],
      })
    );

    expect(result.success).toBe(false);
  });
});

describe('personas', () => {
  test('rejects a persona outside the seeded demo set', () => {
    expect(safeParseStoryboard(storyboard({ persona: 'root' })).success).toBe(
      false
    );
    expect(
      safeParseStoryboard(storyboard({ persona: 'dev.admin@yawp.local' }))
        .success
    ).toBe(false);
  });

  test('accepts every seeded demo persona', () => {
    for (const persona of MARKETING_PERSONAS) {
      expect(safeParseStoryboard(storyboard({ persona })).success).toBe(true);
    }
  });

  test('rejects a login step to an unknown persona', () => {
    const result = safeParseStoryboard(
      storyboard({
        scenes: [scene({ steps: [{ action: 'login', persona: 'root' }] })],
      })
    );

    expect(result.success).toBe(false);
  });
});

describe('render budget', () => {
  test('estimates seconds from holds, waits, and typing', () => {
    const parsed = parseStoryboard(
      storyboard({
        scenes: [
          scene({ hold: 2, steps: [{ action: 'wait', seconds: 3 }] }),
          scene({ id: 'second', goto: '/app/my-classes', hold: 1 }),
        ],
      })
    );

    const seconds = estimateRenderSeconds(parsed);

    expect(seconds).toBeGreaterThanOrEqual(6);
    expect(seconds).toBeLessThan(60);
  });

  test('rejects a storyboard that would run past the render cap', () => {
    const scenes = Array.from({ length: 10 }, (_, index) =>
      scene({
        id: `scene-${index}`,
        hold: 30,
        steps: [{ action: 'wait', seconds: 30 }],
      })
    );

    expect(safeParseStoryboard(storyboard({ scenes })).success).toBe(false);
  });

  test('rejects a single wait longer than the per-step cap', () => {
    const result = safeParseStoryboard(
      storyboard({
        scenes: [scene({ steps: [{ action: 'wait', seconds: 120 }] })],
      })
    );

    expect(result.success).toBe(false);
  });
});

describe('viewport', () => {
  test('accepts the named presets only', () => {
    expect(
      safeParseStoryboard(storyboard({ viewport: 'desktop' })).success
    ).toBe(true);
    expect(
      safeParseStoryboard(storyboard({ viewport: 'mobile' })).success
    ).toBe(true);
    expect(
      safeParseStoryboard(
        storyboard({ viewport: { width: 5000, height: 5000 } })
      ).success
    ).toBe(false);
  });

  test('resolves a preset name to concrete pixels', () => {
    const parsed = parseStoryboard(storyboard({ viewport: 'mobile' }));

    expect(parsed.viewport.width).toBeLessThan(500);
    expect(parsed.viewport.height).toBeGreaterThan(500);
  });
});
