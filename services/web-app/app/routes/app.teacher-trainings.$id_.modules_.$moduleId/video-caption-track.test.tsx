import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it } from 'bun:test';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { VideoCaptionTrack } from './video-caption-track';

function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(element);
  });

  return root;
}

function cleanup(root: Root | null) {
  if (!root) return;
  act(() => {
    root.unmount();
  });
  document.body.innerHTML = '';
}

describe('VideoCaptionTrack', () => {
  let root: Root | null = null;

  afterEach(() => {
    cleanup(root);
    root = null;
  });

  it('renders a default English caption track when one is supplied', () => {
    root = render(
      <video>
        <VideoCaptionTrack
          track={{
            src: '/api/teacher-training-module-resource/captions',
            label: 'English captions',
            srcLang: 'en',
          }}
        />
      </video>
    );

    const track = document.querySelector('track[kind="captions"]');
    expect(track?.getAttribute('src')).toBe(
      '/api/teacher-training-module-resource/captions'
    );
    expect(track?.getAttribute('label')).toBe('English captions');
    expect(track?.getAttribute('srclang')).toBe('en');
    expect(track?.hasAttribute('default')).toBe(true);
  });
});
