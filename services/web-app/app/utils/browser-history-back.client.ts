import type { NavigateFunction } from 'react-router';

/** React Router tracks stack depth on `history.state.idx` (see assignment detail back). */
export function canBrowserHistoryGoBack() {
  return (
    typeof window !== 'undefined' &&
    typeof window.history.state?.idx === 'number' &&
    window.history.state.idx > 0
  );
}

export function navigateBackOr(navigate: NavigateFunction, fallbackTo: string) {
  if (canBrowserHistoryGoBack()) {
    void navigate(-1);
    return;
  }
  void navigate(fallbackTo);
}

export function handleHistoryBackClick(
  event: { preventDefault: () => void },
  navigate: NavigateFunction
) {
  if (!canBrowserHistoryGoBack()) return;
  event.preventDefault();
  void navigate(-1);
}
