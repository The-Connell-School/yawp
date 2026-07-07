import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { buildApHistorySnapshot } from '~/domain/ap-history/schema';
import { ApHistoryAssignmentPanel } from './ap-history-assignment-panel';

const imageSnapshot = buildApHistorySnapshot({
  externalKey: 'apush-dbq-reconstruction',
  course: 'apush',
  essayType: 'dbq',
  prompt: 'Evaluate the extent to which Reconstruction was a turning point.',
  period: '1844-1877',
  periodNumber: 5,
  reasoningSkill: 'continuity-and-change',
  defaultTimeMode: 'untimed',
  defaultDurationMinutes: 60,
  sources: [
    {
      externalKey: 'apush-dbq-reconstruction-doc-1',
      position: 1,
      title: 'A Freedmen’s school',
      attribution: 'Library of Congress, c. 1866',
      body: 'Photograph of a Freedmen’s Bureau school.',
      caption: 'Students outside a schoolhouse.',
      mediaType: 'image',
      imageUrl: 'https://example.test/freedmens-school.jpg',
      imageAlt: 'Black students gathered outside a wooden schoolhouse',
      provenanceUrl: 'https://www.loc.gov/item/example',
    },
  ],
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(element: Parameters<Root['render']>[0]) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(element));
}

describe('ApHistoryAssignmentPanel image sources', () => {
  it('serves visual sources from our own origin first, with alt text and lazy loading', () => {
    render(<ApHistoryAssignmentPanel snapshot={imageSnapshot} />);

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe(
      '/api/image/ap-history-source/apush-dbq-reconstruction-doc-1'
    );
    expect(img?.getAttribute('alt')).toBe(
      'Black students gathered outside a wooden schoolhouse'
    );
    expect(img?.getAttribute('loading')).toBe('lazy');
    expect(container.textContent).toContain('Visual source');
  });

  it('falls back to the external URL if the self-hosted image fails', () => {
    render(<ApHistoryAssignmentPanel snapshot={imageSnapshot} />);

    act(() => {
      container.querySelector('img')?.dispatchEvent(new Event('error'));
    });

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe(
      'https://example.test/freedmens-school.jpg'
    );
  });

  it('falls back to a direct link when every image source fails to load', () => {
    render(<ApHistoryAssignmentPanel snapshot={imageSnapshot} />);

    act(() => {
      container.querySelector('img')?.dispatchEvent(new Event('error'));
    });
    act(() => {
      container.querySelector('img')?.dispatchEvent(new Event('error'));
    });

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('Image could not be loaded');
    const link = container.querySelector('a[href]');
    expect(link?.getAttribute('href')).toBe(
      'https://example.test/freedmens-school.jpg'
    );
  });
});
