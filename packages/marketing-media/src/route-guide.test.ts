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
