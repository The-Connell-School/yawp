export const DEV_PANEL_STORAGE_KEY = 'yawp-dev-panel';

export type DevPanelSubSheet =
  | 'free-tier-states'
  | 'give-feedback'
  | 'class-simulation'
  | null;

export type DevPanelPersistedForms = {
  feedbackNote?: string;
  throwawaySwitch?: boolean;
  selectedStateId?: string | null;
  /** Last state the environment was jumped into (shows the Current pill). */
  activeStateId?: string | null;
  blackboardRole?: 'teacher' | 'student';
  simulationClassId?: string | null;
  simulationStudentCount?: number;
  /** Opens the class simulation flyout straight to clear confirmation. */
  simulationOpenAction?: 'clear-confirm' | null;
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
  openSections: ['blackboard', 'tester-tools'],
  org: null,
  subSheet: null,
  scroll: {},
  forms: {
    throwawaySwitch: true,
    blackboardRole: 'teacher',
    simulationStudentCount: 20,
  },
};

export type DevPanelEnvBadge = 'Demo' | 'Dev';
