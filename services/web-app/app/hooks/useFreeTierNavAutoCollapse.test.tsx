import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useFreeTierNavCollapseEffect } from './useFreeTierNavAutoCollapse';

let root: Root | null = null;

function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
}

function mount(options: {
  navExpanded: boolean;
  navPreferenceExplicit: boolean;
  submit: ReturnType<typeof mock>;
}) {
  function Harness() {
    useFreeTierNavCollapseEffect({
      enabled: true,
      navExpanded: options.navExpanded,
      navPreferenceExplicit: options.navPreferenceExplicit,
      fetcherState: 'idle',
      submit: options.submit,
    });
    return null;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(Harness));
  });
}

function resizeTo(width: number) {
  act(() => {
    setWidth(width);
    window.dispatchEvent(new Event('resize'));
  });
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

describe('useFreeTierNavCollapseEffect', () => {
  test('does not collapse on load when the teacher already chose expanded', () => {
    const submit = mock(() => {});
    setWidth(1100);
    mount({ navExpanded: true, navPreferenceExplicit: true, submit });
    expect(submit).not.toHaveBeenCalled();
  });

  test('still collapses on load in the narrow band when nothing is saved', () => {
    const submit = mock(() => {});
    setWidth(1100);
    mount({ navExpanded: true, navPreferenceExplicit: false, submit });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith(
      { state: 'collapsed' },
      { method: 'POST', action: '/api/preferences/nav' }
    );
  });

  test('collapses when the viewport enters the narrow band after an explicit expand', () => {
    const submit = mock(() => {});
    setWidth(1400);
    mount({ navExpanded: true, navPreferenceExplicit: true, submit });
    expect(submit).not.toHaveBeenCalled();

    resizeTo(1100);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith(
      { state: 'collapsed' },
      { method: 'POST', action: '/api/preferences/nav' }
    );
  });

  test('does not collapse again on a later resize that stays in the band', () => {
    const submit = mock(() => {});
    setWidth(1400);
    mount({ navExpanded: true, navPreferenceExplicit: true, submit });
    resizeTo(1100);
    submit.mockClear();
    resizeTo(1000);
    expect(submit).not.toHaveBeenCalled();
  });
});
