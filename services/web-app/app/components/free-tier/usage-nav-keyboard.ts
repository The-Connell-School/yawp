export function handleUsageNavPopoverKeyDown(
  event: { key: string; shiftKey: boolean; preventDefault: () => void },
  input: {
    open: boolean;
    focusTalkToUs: () => void;
    closePopover: () => void;
    refocusTrigger: () => void;
  }
) {
  if (event.key === 'Escape') {
    event.preventDefault();
    input.closePopover();
    input.refocusTrigger();
    return;
  }
  if (event.key === 'Tab' && !event.shiftKey && input.open) {
    event.preventDefault();
    input.focusTalkToUs();
  }
}
