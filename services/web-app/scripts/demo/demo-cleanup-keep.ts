import {
  LOCAL_DEV_ORG_ID,
  LOCAL_DEV_PERSONA_EMAILS,
  UA_PREVIEW_ORG_ID,
} from '../../../../packages/prisma/scripts/local-dev/dev-personas';
import {
  INTERN_QA_TEACHERS,
} from '../../../../packages/prisma/scripts/local-dev/ensure-intern-qa-teachers';
import {
  parseSimulatedStudentEmail,
  SIMULATION_PARTIAL_TEXT,
  SIMULATION_SUBMITTED_TEXT,
} from '../../app/dev-panel/class-simulation-mix';

export const PROTECTED_ORGANIZATION_IDS = new Set([
  LOCAL_DEV_ORG_ID,
  UA_PREVIEW_ORG_ID,
]);

export const KEEP_STUDENT_DISPLAY_NAMES = new Set([
  'riley student',
  'sam student',
  'taylor student',
]);

const INTERN_QA_EMAILS = new Set(
  INTERN_QA_TEACHERS.flatMap((teacher) => [
    teacher.preferredEmail.toLowerCase(),
    teacher.fallbackEmail.toLowerCase(),
  ])
);

const TEAM_EMAIL =
  /^(bryant|brian|kevin|bbrock)(\+[^@]*)?@(yawp\.school|brock\.software|theconnellschool\.com)$/i;
const INTERN_TESTER_EMAIL = /^bryant\+intern\d+@brock\.software$/i;
const DEV_PANEL_THROWAWAY_EMAIL =
  /^dev-panel\+[0-9a-f-]{36}@pending-[0-9a-f-]{12}\.example\.test$/i;

export type DemoCleanupUserSnapshot = {
  id: string;
  email: string | null;
  name: string | null;
  simulatedForClassId: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  memberships: Array<{
    id: string;
    organizationId: string;
    role: string;
    isOrgOwner: boolean;
    isActive: boolean;
  }>;
  documentStats: {
    totalDocuments: number;
    substantiveDocuments: number;
    oneLineSubmittedDocuments: number;
    submittedDocuments: number;
  };
};

export type DemoCleanupOrgSnapshot = {
  id: string;
  name: string;
  plan: string;
  previewSeatCode: string | null;
  memberUserIds: string[];
};

export type KeepDecision = {
  action: 'KEEP';
  reason: string;
};

export type DeleteDecision = {
  action: 'DELETE';
  reason: string;
};

export type CleanupDecision = KeepDecision | DeleteDecision;

export function normalizeDevPersonaEmail(email: string) {
  return email.toLowerCase().replace(/\.seat-\d+(?=@)/, '');
}

export function isDevPersonaEmail(email: string | null | undefined) {
  if (!email) return false;
  return LOCAL_DEV_PERSONA_EMAILS.includes(normalizeDevPersonaEmail(email));
}

export function isSubstantiveAuthoredText(text: string | null | undefined) {
  const normalized = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  if (
    normalized === SIMULATION_SUBMITTED_TEXT ||
    normalized === SIMULATION_PARTIAL_TEXT
  ) {
    return false;
  }
  const paragraphs = (text ?? '')
    .split(/\n+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (paragraphs.length >= 2 && normalized.length >= 80) return true;
  return normalized.length >= 160;
}

export function isOneLineSubmittedText(text: string | null | undefined) {
  const normalized = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return true;
  if (
    normalized === SIMULATION_SUBMITTED_TEXT ||
    normalized === SIMULATION_PARTIAL_TEXT
  ) {
    return true;
  }
  return !isSubstantiveAuthoredText(text);
}

export function classifyUser(user: DemoCleanupUserSnapshot): CleanupDecision {
  const email = user.email?.trim().toLowerCase() ?? '';
  const displayName = user.name?.trim().toLowerCase() ?? '';

  if (user.simulatedForClassId || parseSimulatedStudentEmail(email)) {
    return {
      action: 'DELETE',
      reason: 'Dev-panel simulated student (sim-*@example.test or simulatedForClassId).',
    };
  }

  if (DEV_PANEL_THROWAWAY_EMAIL.test(email)) {
    return {
      action: 'DELETE',
      reason: 'Ephemeral dev-panel free-tier throwaway account.',
    };
  }

  if (user.isAdmin || user.isSuperAdmin) {
    return { action: 'KEEP', reason: 'Platform admin account.' };
  }

  if (user.memberships.some((membership) => membership.isOrgOwner)) {
    return { action: 'KEEP', reason: 'Organization owner account.' };
  }

  if (isDevPersonaEmail(email)) {
    return { action: 'KEEP', reason: 'Local dev / demo persona (dev.*@yawp.local).' };
  }

  if (INTERN_QA_EMAILS.has(email)) {
    return { action: 'KEEP', reason: 'Intern QA teacher (Ava Crossman / Thomas Patton).' };
  }

  if (INTERN_TESTER_EMAIL.test(email)) {
    return { action: 'KEEP', reason: 'Demo intern tester account.' };
  }

  if (TEAM_EMAIL.test(email)) {
    return { action: 'KEEP', reason: 'Yawp team account (Brian/Kevin/Bryant).' };
  }

  if (KEEP_STUDENT_DISPLAY_NAMES.has(displayName)) {
    return {
      action: 'KEEP',
      reason: 'Brian demo student (Riley / Sam / Taylor Student).',
    };
  }

  if (/^jordan\b/i.test(displayName) && user.memberships.some((m) => m.role === 'TEACHER')) {
    return { action: 'KEEP', reason: 'Jordan teacher demo account.' };
  }

  if (user.documentStats.substantiveDocuments > 0) {
    return {
      action: 'KEEP',
      reason: 'Has multi-paragraph / substantive authored documents (manual review).',
    };
  }

  const isStudent = user.memberships.some((membership) => membership.role === 'STUDENT');
  if (
    isStudent &&
    user.documentStats.submittedDocuments > 0 &&
    user.documentStats.oneLineSubmittedDocuments ===
      user.documentStats.submittedDocuments
  ) {
    return {
      action: 'DELETE',
      reason: 'Student with only one-line submitted work (simulation junk).',
    };
  }

  if (
    isStudent &&
    user.documentStats.submittedDocuments === 0 &&
    user.documentStats.totalDocuments === 0
  ) {
    return {
      action: 'DELETE',
      reason: 'Student with no documents (orphaned sim roster entry).',
    };
  }

  if (isStudent) {
    return {
      action: 'KEEP',
      reason: 'Student not matching junk heuristics — flagged for Bryant review.',
    };
  }

  return {
    action: 'KEEP',
    reason: 'Teacher or staff account not matching delete heuristics.',
  };
}

export function classifyOrganization(
  org: DemoCleanupOrgSnapshot,
  userDecisions: Map<string, CleanupDecision>
): CleanupDecision {
  if (PROTECTED_ORGANIZATION_IDS.has(org.id)) {
    return { action: 'KEEP', reason: 'Protected demo org (local-dev or UA preview).' };
  }
  if (org.previewSeatCode) {
    return { action: 'KEEP', reason: 'Preview seat organization (previewSeatCode set).' };
  }

  const members = org.memberUserIds;
  if (members.length === 0) {
    return { action: 'DELETE', reason: 'Empty organization.' };
  }

  const keepMembers = members.filter(
    (userId) => userDecisions.get(userId)?.action === 'KEEP'
  );
  if (keepMembers.length === 0) {
    return {
      action: 'DELETE',
      reason: 'No KEEP members after user classification (throwaway testing org).',
    };
  }

  return {
    action: 'KEEP',
    reason: `Organization has ${keepMembers.length} KEEP member(s).`,
  };
}
