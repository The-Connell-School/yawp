import { describe, expect, test } from 'bun:test';
import { ALLOWED_ROUTES } from './storyboard';
import { ROUTE_GUIDE, describeRoutesForPrompt } from './route-guide';

describe('ROUTE_GUIDE', () => {
  // The generator can only be trusted to click things when it is told what
  // exists. A route with no guide entry sends the model back to inventing
  // selectors, which is exactly the failure this guide exists to end.
  test('covers every allowed route and nothing else', () => {
    expect(Object.keys(ROUTE_GUIDE).sort()).toEqual([...ALLOWED_ROUTES].sort());
    for (const entry of Object.values(ROUTE_GUIDE)) {
      expect(entry.trim().length).toBeGreaterThan(20);
    }
  });

  test('the prompt text names every route', () => {
    const text = describeRoutesForPrompt();
    for (const route of ALLOWED_ROUTES) {
      expect(text).toContain(`${route} `);
    }
  });

  // Spot-check the anchors that real seeded demos depend on, so a rewrite of
  // the guide cannot silently drop the targets storyboards are steered toward.
  test('describes the interactive anchors storyboards rely on', () => {
    const text = describeRoutesForPrompt();
    expect(text).toContain('New Assignment');
    expect(text).toContain('Prompt Library');
    expect(text).toContain('Daily Pages - week 2');
    expect(text).toContain('English 10 - Period 3');
    expect(text).toContain('.ProseMirror');
    expect(text).toContain('/app/my-documents');
    expect(text).toContain('Graded civic essay');
  });

  // The generator reached for {"text": "Assignment"} to pick a dropdown entry
  // and clicked inert page copy instead, because the menu is portaled to the
  // end of the document. The guide has to name the role and say why.
  test('steers menu clicks at the role rather than the text', () => {
    const text = describeRoutesForPrompt();
    expect(text).toContain('menuitem');
    expect(text).toMatch(/portal/i);
  });
});

describe('coverage of the real teacher navigation', () => {
  // The model can only film what the allow-list contains. Every destination in
  // the signed-in teacher navigation is a feature somebody will ask for a demo
  // of, so a missing one is not a gap in the guide — it is a brief the studio
  // silently cannot answer, and it answers with something adjacent instead.
  test('every teacher nav destination is filmable', () => {
    for (const route of [
      '/app',
      '/app/my-classes',
      '/app/assignments',
      '/app/documents',
      '/app/teacher-trainings',
      '/app/reporter',
    ] as const) {
      expect(ALLOWED_ROUTES).toContain(route);
    }
  });

  // /app/student-work now redirects to /app/documents. Existing storyboards
  // still name it, so it stays allowed, but the guide has to send new ones to
  // the canonical path — a redirect mid-capture races the scene's waitFor.
  test('sends new storyboards to the canonical documents route', () => {
    expect(ALLOWED_ROUTES).toContain('/app/student-work');
    expect(ROUTE_GUIDE['/app/student-work']).toMatch(/redirect/i);
    expect(ROUTE_GUIDE['/app/student-work']).toContain('/app/documents');
  });

  test('names what each new surface actually offers', () => {
    // Written from the running seeded app, not from the components.
    expect(ROUTE_GUIDE['/app/reporter']).toContain('Ask Yawp Reporter');
    expect(ROUTE_GUIDE['/app/reporter']).toContain('Grade report for a class');
    expect(ROUTE_GUIDE['/app/assignments']).toContain('New Assignment');
    expect(ROUTE_GUIDE['/app/assignments']).toContain('Daily Pages - week 2');
    expect(ROUTE_GUIDE['/app/documents']).toContain('Needs Grading');
  });
});
