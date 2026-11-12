import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { FreeAssignmentTiles } from './free-account-usage';

test('FreeAssignmentTiles without usage uses the same carousel chrome for licensed teachers', () => {
  const html = renderToStaticMarkup(
    <StaticRouter location="/app">
      <FreeAssignmentTiles
        types={[
          {
            id: 'type-1',
            title: 'Class Starter',
            kind: 'class_starter',
            imageId: 'img-starter',
          },
        ]}
        onCreate={() => {}}
      />
    </StaticRouter>
  );
  expect(html).toContain('data-testid="teacher-assignments-grid"');
  expect(html).toContain('free-tier-assignment-carousel-track');
  expect(html).not.toContain('Unlimited with free tier');
});

test('FreeAssignmentTiles plus control targets new assignment, not assignment type page', () => {
  const html = renderToStaticMarkup(
    <StaticRouter location="/app">
      <FreeAssignmentTiles
        types={[
          {
            id: 'type-thesis',
            title: 'Thesis Essay',
            kind: 'thesis_statement',
            imageId: 'img-thesis',
          },
        ]}
        onCreate={() => {}}
      />
    </StaticRouter>
  );
  expect(html).toContain('href="/app/assignment-types/type-thesis"');
  expect(html).toContain('data-testid="dashboard-assignment-tile-create"');
  expect(html).toContain('aria-label="New Thesis Essay assignment"');
});
