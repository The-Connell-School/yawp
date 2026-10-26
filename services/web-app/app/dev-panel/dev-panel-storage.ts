import {
  DEV_PANEL_DEFAULT_STATE,
  DEV_PANEL_STORAGE_KEY,
  type DevPanelPersistedForms,
  type DevPanelPersistedState,
} from './dev-panel-types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseDevPanelState(raw: unknown): DevPanelPersistedState | null {
  if (!isRecord(raw)) return null;
  const open = raw.open === true;
  const openSections = Array.isArray(raw.openSections)
    ? raw.openSections.filter((item): item is string => typeof item === 'string')
    : DEV_PANEL_DEFAULT_STATE.openSections;
  const org = typeof raw.org === 'string' || raw.org === null ? raw.org : null;
  const subSheet =
    raw.subSheet === 'free-tier-states' ||
    raw.subSheet === 'give-feedback' ||
    raw.subSheet === 'class-simulation' ||
    raw.subSheet === null
      ? raw.subSheet
      : null;
  const scroll = isRecord(raw.scroll)
    ? {
        main:
          typeof raw.scroll.main === 'number' ? raw.scroll.main : undefined,
        sub: typeof raw.scroll.sub === 'number' ? raw.scroll.sub : undefined,
      }
    : {};
  const forms: DevPanelPersistedForms = isRecord(raw.forms)
    ? {
        feedbackNote:
          typeof raw.forms.feedbackNote === 'string'
            ? raw.forms.feedbackNote.slice(0, 2000)
            : undefined,
        throwawaySwitch:
          typeof raw.forms.throwawaySwitch === 'boolean'
            ? raw.forms.throwawaySwitch
            : true,
        selectedStateId:
          typeof raw.forms.selectedStateId === 'string' ||
          raw.forms.selectedStateId === null
            ? raw.forms.selectedStateId
            : undefined,
        activeStateId:
          typeof raw.forms.activeStateId === 'string' ||
          raw.forms.activeStateId === null
            ? raw.forms.activeStateId
            : undefined,
        blackboardRole:
          raw.forms.blackboardRole === 'teacher' ||
          raw.forms.blackboardRole === 'student'
            ? raw.forms.blackboardRole
            : 'teacher',
        simulationClassId:
          typeof raw.forms.simulationClassId === 'string' ||
          raw.forms.simulationClassId === null
            ? raw.forms.simulationClassId
            : undefined,
        simulationStudentCount:
          typeof raw.forms.simulationStudentCount === 'number'
            ? raw.forms.simulationStudentCount
            : undefined,
      }
    : DEV_PANEL_DEFAULT_STATE.forms;
  return {
    open,
    openSections,
    org,
    subSheet,
    scroll,
    forms,
  };
}

export function readDevPanelState(storage: Storage | undefined): DevPanelPersistedState {
  if (!storage) return { ...DEV_PANEL_DEFAULT_STATE };
  try {
    const raw = storage.getItem(DEV_PANEL_STORAGE_KEY);
    if (!raw) return { ...DEV_PANEL_DEFAULT_STATE };
    return parseDevPanelState(JSON.parse(raw)) ?? { ...DEV_PANEL_DEFAULT_STATE };
  } catch {
    return { ...DEV_PANEL_DEFAULT_STATE, open: false };
  }
}

export function writeDevPanelState(
  storage: Storage | undefined,
  state: DevPanelPersistedState
) {
  if (!storage) return;
  try {
    storage.setItem(DEV_PANEL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* Quota or private mode — ignore. */
  }
}

export function clearDevPanelState(storage: Storage | undefined) {
  if (!storage) return;
  try {
    storage.removeItem(DEV_PANEL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function devPanelRestoreHtmlClass(state: DevPanelPersistedState | null) {
  if (!state?.open) return '';
  return 'yawp-dev-panel-open yawp-dev-panel-restored';
}
