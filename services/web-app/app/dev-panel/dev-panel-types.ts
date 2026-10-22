export const DEV_PANEL_STORAGE_KEY = 'yawp-dev-panel';

export type DevPanelSubSheet = 'free-tier-states' | 'give-feedback' | null;

export type DevPanelPersistedForms = {
  feedbackNote?: string;
  throwawaySwitch?: boolean;
  selectedStateId?: string | null;
  blackboardRole?: 'teacher' | 'student';
};

export type DevPanelPersistedState = {
  open: boolean;
  openSections: string[];
  org: string | null;
  subSheet: DevPanelSubSheet;
  scroll: { main?: number; sub?: number };
  forms: DevPanelPersistedForms;
  /** Skipped on restore — used only for open/close animation class. */
  restored?: boolean;
};

export const DEV_PANEL_DEFAULT_STATE: DevPanelPersistedState = {
  open: false,
  openSections: ['sign-in'],
  org: null,
  subSheet: null,
  scroll: {},
  forms: { throwawaySwitch: true, blackboardRole: 'teacher' },
};

export type DevPanelEnvBadge = 'Demo' | 'Dev';
