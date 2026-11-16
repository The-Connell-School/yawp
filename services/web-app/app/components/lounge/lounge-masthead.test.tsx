import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { LoungeMasthead } from './lounge-masthead';

test('Faculty Lounge heading uses Fraunces and Community is the only tab', () => {
  const html = renderToStaticMarkup(
    <StaticRouter location="/app/lounge">
      <LoungeMasthead />
    </StaticRouter>
  );
  expect(html).toContain('faculty-lounge-heading');
  expect(html).toContain('Faculty Lounge');
  expect(html).toContain('>Community<');
  expect(html).not.toContain('Trainings');
  expect(html).not.toContain('lounge-serif');
});
