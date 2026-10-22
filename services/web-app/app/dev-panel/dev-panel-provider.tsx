import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  clearDevPanelState,
  readDevPanelState,
  writeDevPanelState,
} from './dev-panel-storage';
import type { DevPanelEnvBadge, DevPanelPersistedState } from './dev-panel-types';
import { DEV_PANEL_DEFAULT_STATE } from './dev-panel-types';

type DevPanelContextValue = {
  state: DevPanelPersistedState;
  envBadge: DevPanelEnvBadge;
  unlocked: boolean;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  setOrg: (orgId: string | null) => void;
  toggleSection: (sectionId: string) => void;
  openSubSheet: (sheet: DevPanelPersistedState['subSheet']) => void;
  closeSubSheet: () => void;
  updateForms: (forms: Partial<DevPanelPersistedState['forms']>) => void;
  setScroll: (scroll: DevPanelPersistedState['scroll']) => void;
  clearFeedbackForm: () => void;
  previewAccessSeatLabel: string | null;
  setPreviewAccessSeatLabel: (label: string | null) => void;
  previewAccessGateEnabled: boolean;
};

const DevPanelContext = createContext<DevPanelContextValue | null>(null);

export function useDevPanel() {
  const value = useContext(DevPanelContext);
  if (!value) throw new Error('Dev panel context missing');
  return value;
}

export function DevPanelProvider({
  children,
  envBadge,
  previewAccessSeatLabel: initialSeatLabel,
  previewAccessGateEnabled,
}: {
  children: ReactNode;
  envBadge: DevPanelEnvBadge;
  previewAccessSeatLabel: string | null;
  previewAccessGateEnabled: boolean;
}) {
  const [state, setState] = useState<DevPanelPersistedState>(() => {
    if (typeof window === 'undefined') return { ...DEV_PANEL_DEFAULT_STATE };
    const restored = readDevPanelState(window.localStorage);
    return { ...restored, restored: restored.open };
  });
  const [seatLabel, setSeatLabel] = useState(initialSeatLabel);
  const unlocked = !previewAccessGateEnabled || Boolean(seatLabel);
  const persistTimer = useRef<number | null>(null);

  const persist = useCallback((next: DevPanelPersistedState) => {
    setState(next);
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      writeDevPanelState(window.localStorage, next);
    }, 0);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('yawp-dev-panel-open', state.open);
    root.classList.toggle('yawp-dev-panel-restored', Boolean(state.restored));
    if (!state.open) root.classList.remove('yawp-dev-panel-closing');
  }, [state.open, state.restored]);

  useEffect(() => {
    writeDevPanelState(window.localStorage, state);
  }, [state]);

  const openPanel = useCallback(() => {
    persist({ ...state, open: true, restored: false });
  }, [persist, state]);

  const closePanel = useCallback(() => {
    document.documentElement.classList.add('yawp-dev-panel-closing');
    window.setTimeout(() => {
      clearDevPanelState(window.localStorage);
      document.documentElement.classList.remove(
        'yawp-dev-panel-open',
        'yawp-dev-panel-restored',
        'yawp-dev-panel-closing'
      );
      setState({ ...DEV_PANEL_DEFAULT_STATE });
    }, 150);
  }, []);

  const togglePanel = useCallback(() => {
    if (state.open) closePanel();
    else openPanel();
  }, [closePanel, openPanel, state.open]);

  const value = useMemo<DevPanelContextValue>(
    () => ({
      state,
      envBadge,
      unlocked,
      openPanel,
      closePanel,
      togglePanel,
      setOrg: (orgId) => persist({ ...state, org: orgId }),
      toggleSection: (sectionId) => {
        const openSections = state.openSections.includes(sectionId)
          ? state.openSections.filter((id) => id !== sectionId)
          : [...state.openSections, sectionId];
        persist({ ...state, openSections });
      },
      openSubSheet: (sheet) => persist({ ...state, subSheet: sheet, restored: false }),
      closeSubSheet: () => persist({ ...state, subSheet: null }),
      updateForms: (forms) =>
        persist({ ...state, forms: { ...state.forms, ...forms } }),
      setScroll: (scroll) => persist({ ...state, scroll }),
      clearFeedbackForm: () =>
        persist({
          ...state,
          forms: { ...state.forms, feedbackNote: '' },
        }),
      previewAccessSeatLabel: seatLabel,
      setPreviewAccessSeatLabel: setSeatLabel,
      previewAccessGateEnabled,
    }),
    [
      closePanel,
      envBadge,
      openPanel,
      persist,
      previewAccessGateEnabled,
      seatLabel,
      state,
      togglePanel,
      unlocked,
    ]
  );

  return (
    <DevPanelContext.Provider value={value}>{children}</DevPanelContext.Provider>
  );
}
