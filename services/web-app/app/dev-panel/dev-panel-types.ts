export const DEV_PANEL_STORAGE_KEY = 'yawp-dev-panel';

export type DevPanelSubSheet =
  | 'free-tier-states'
  | 'give-feedback'
  | 'class-simulation'
  | null;

export type DevPanelFeedbackType = 'bug' | 'idea' | 'copy';

export type DevPanelPersistedForms = {
  feedbackNote?: string;
  feedbackType?: DevPanelFeedbackType;
  feedbackAttachScreenshot?: boolean;
  throwawaySwitch?: boolean;
  selectedStateId?: string | null;
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
  openSections: [],
  org: null,
  subSheet: null,
  scroll: {},
  forms: {
    throwawaySwitch: true,
    simulationStudentCount: 20,
    feedbackType: 'bug',
    feedbackAttachScreenshot: true,
  },
};

export type DevPanelEnvBadge = 'Demo' | 'Dev';
