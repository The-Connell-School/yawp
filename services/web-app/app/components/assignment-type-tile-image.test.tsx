import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssignmentTypeTileImage } from './assignment-type-tile-image';

test('assignment-type tile image shows no hover tooltip', () => {
  const html = renderToStaticMarkup(
    <AssignmentTypeTileImage
      imageId="img-1"
      alt="Scratchy ink drawing of a dog in a beret"
    />
  );
  expect(html).toContain('src="/api/image/course/img-1"');
  expect(html).not.toContain('title=');
});

test('assignment-type tile image keeps its alt text for screen readers', () => {
  const html = renderToStaticMarkup(
    <AssignmentTypeTileImage
      imageId="img-1"
      alt="Scratchy ink drawing of a dog in a beret"
    />
  );
  expect(html).toContain('alt="Scratchy ink drawing of a dog in a beret"');
});
