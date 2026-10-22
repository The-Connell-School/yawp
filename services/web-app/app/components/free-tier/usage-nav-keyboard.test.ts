import { describe, expect, mock, test } from 'bun:test';
import { handleUsageNavPopoverKeyDown } from '~/components/free-tier/usage-nav-keyboard';

describe('handleUsageNavPopoverKeyDown', () => {
  test('Tab moves focus to Talk to us when popover is open', () => {
    const focusTalkToUs = mock(() => {});
    const preventDefault = mock(() => {});
    handleUsageNavPopoverKeyDown(
      { key: 'Tab', shiftKey: false, preventDefault },
      {
        open: true,
        focusTalkToUs,
        closePopover: () => {},
        refocusTrigger: () => {},
      }
    );
    expect(preventDefault).toHaveBeenCalled();
    expect(focusTalkToUs).toHaveBeenCalled();
  });

  test('Escape closes popover and refocuses trigger', () => {
    const closePopover = mock(() => {});
    const refocusTrigger = mock(() => {});
    const preventDefault = mock(() => {});
    handleUsageNavPopoverKeyDown(
      { key: 'Escape', shiftKey: false, preventDefault },
      {
        open: true,
        focusTalkToUs: () => {},
        closePopover,
        refocusTrigger,
      }
    );
    expect(preventDefault).toHaveBeenCalled();
    expect(closePopover).toHaveBeenCalled();
    expect(refocusTrigger).toHaveBeenCalled();
  });
});
