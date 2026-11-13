import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, expect, it } from 'bun:test';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import {
  ApprovalRequiredToast,
  TEACHING_ACCESS_TOAST_DESKTOP_POSITION,
} from './teaching-access-toasts';

describe('Teaching access toast positioning', () => {
  it('offsets desktop toasts above the demo feedback button region', () => {
    expect(TEACHING_ACCESS_TOAST_DESKTOP_POSITION).toContain(
      '--teaching-access-toast-bottom'
    );
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <MemoryRouter>
          <ApprovalRequiredToast mobilePinned={false} onDismiss={() => {}} />
        </MemoryRouter>
      );
    });
    const toast = container.querySelector(
      '[data-testid="teaching-access-error-toast"]'
    );
    expect(toast?.className).toContain('--teaching-access-toast-bottom');
    act(() => root.unmount());
    container.remove();
  });
});
