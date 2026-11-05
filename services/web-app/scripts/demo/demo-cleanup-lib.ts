import type { PrismaClient } from '@app/prisma';
import {
  classifyOrganization,
  classifyUser,
  isOneLineSubmittedText,
  isSubstantiveAuthoredText,
  type CleanupDecision,
  type DemoCleanupOrgSnapshot,
  type DemoCleanupUserSnapshot,
} from './demo-cleanup-keep';

export type DemoCleanupPlan = {
  users: Array<DemoCleanupUserSnapshot & { decision: CleanupDecision }>;
  organizations: Array<DemoCleanupOrgSnapshot & { decision: CleanupDecision }>;
};

export function parseDemoCleanupArgs(args: string[]) {
  let mode: 'dry-run' | 'apply' | 'inventory' = 'dry-run';
  let outputPath: string | undefined;
  for (const arg of args) {
    if (arg === '--dry-run') mode = 'dry-run';
    else if (arg === '--apply') mode = 'apply';
    else if (arg === '--inventory') mode = 'inventory';
    else if (arg.startsWith('--output=')) outputPath = arg.slice('--output='.length);
    else if (arg === '--output') throw new Error('--output requires =path form.');
    else throw new Error(
      'Usage: bun scripts/demo/demo-db-cleanup.ts [--inventory|--dry-run|--apply] [--output=path]'
    );
  }
  return { mode, outputPath };
}

export async function loadDemoCleanupSnapshots(
  prisma: PrismaClient
): Promise<{ users: DemoCleanupUserSnapshot[]; organizations: DemoCleanupOrgSnapshot[] }> {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      simulatedForClassId: true,
      isAdmin: true,
      isSuperAdmin: true,
      memberships: {
        select: {
          id: true,
          organizationId: true,
          role: true,
          isOrgOwner: true,
          isActive: true,
        },
      },
    },
  });

  const documents = await prisma.document.findMany({
    where: { deletedAt: null, archivedAt: null },
    select: {
      membershipId: true,
      text: true,
      submissions: {
        where: { unsubmittedAt: null, archivedAt: null },
        select: { text: true },
      },
    },
  });

  const docsByMembership = new Map<
    string,
    Array<{ text: string | null; submissions: Array<{ text: string | null }> }>
  >();
  for (const doc of documents) {
    if (!doc.membershipId) continue;
    const bucket = docsByMembership.get(doc.membershipId) ?? [];
    bucket.push({ text: doc.text, submissions: doc.submissions });
    docsByMembership.set(doc.membershipId, bucket);
  }

  const userSnapshots: DemoCleanupUserSnapshot[] = users.map((user) => {
    const membershipIds = user.memberships.map((membership) => membership.id);
    const relatedDocs = membershipIds.flatMap(
      (membershipId) => docsByMembership.get(membershipId) ?? []
    );
    let substantiveDocuments = 0;
    let oneLineSubmittedDocuments = 0;
    let submittedDocuments = 0;
    for (const doc of relatedDocs) {
      if (isSubstantiveAuthoredText(doc.text)) substantiveDocuments += 1;
      for (const submission of doc.submissions) {
        submittedDocuments += 1;
        if (isOneLineSubmittedText(submission.text ?? doc.text)) {
          oneLineSubmittedDocuments += 1;
        }
      }
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      simulatedForClassId: user.simulatedForClassId,
      isAdmin: user.isAdmin,
      isSuperAdmin: user.isSuperAdmin,
      memberships: user.memberships,
      documentStats: {
        totalDocuments: relatedDocs.length,
        substantiveDocuments,
        oneLineSubmittedDocuments,
        submittedDocuments,
      },
    };
  });

  const organizations = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      plan: true,
      previewSeatCode: true,
      memberships: { select: { userId: true } },
    },
    orderBy: { name: 'asc' },
  });

  const orgSnapshots: DemoCleanupOrgSnapshot[] = organizations.map((org) => ({
    id: org.id,
    name: org.name,
    plan: org.plan,
    previewSeatCode: org.previewSeatCode,
    memberUserIds: [...new Set(org.memberships.map((membership) => membership.userId))],
  }));

  return { users: userSnapshots, organizations: orgSnapshots };
}

export function buildDemoCleanupPlan(input: {
  users: DemoCleanupUserSnapshot[];
  organizations: DemoCleanupOrgSnapshot[];
}): DemoCleanupPlan {
  const userDecisions = new Map<string, CleanupDecision>();
  const users = input.users.map((user) => {
    const decision = classifyUser(user);
    userDecisions.set(user.id, decision);
    return { ...user, decision };
  });
  const organizations = input.organizations.map((org) => ({
    ...org,
    decision: classifyOrganization(org, userDecisions),
  }));
  return { users, organizations };
}

export function formatInventoryMarkdown(plan: DemoCleanupPlan, generatedAt = new Date()) {
  const lines: string[] = [];
  lines.push('# PKG-02 · Demo database inventory');
  lines.push('');
  lines.push(`Generated: ${generatedAt.toISOString()}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  const deleteUsers = plan.users.filter((user) => user.decision.action === 'DELETE');
  const deleteOrgs = plan.organizations.filter((org) => org.decision.action === 'DELETE');
  lines.push(`- Organizations: ${plan.organizations.length} total, ${deleteOrgs.length} DELETE`);
  lines.push(`- Users: ${plan.users.length} total, ${deleteUsers.length} DELETE`);
  lines.push('');
  lines.push('## Organizations');
  lines.push('');
  lines.push('| Organization | Plan | Preview seat | Action | Reason |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const org of plan.organizations) {
    lines.push(
      `| ${escapeCell(org.name)} (\`${org.id}\`) | ${org.plan} | ${org.previewSeatCode ?? '—'} | **${org.decision.action}** | ${escapeCell(org.decision.reason)} |`
    );
  }
  lines.push('');
  lines.push('## Users (students and teachers)');
  lines.push('');
  lines.push(
    '| Name | Email | Docs | Submitted (one-line) | Action | Reason |'
  );
  lines.push('| --- | --- | ---: | ---: | --- | --- |');
  for (const user of plan.users.sort((a, b) =>
    (a.name ?? '').localeCompare(b.name ?? '')
  )) {
    const stats = user.documentStats;
    lines.push(
      `| ${escapeCell(user.name ?? '—')} | ${escapeCell(user.email ?? '—')} | ${stats.totalDocuments} | ${stats.oneLineSubmittedDocuments}/${stats.submittedDocuments} | **${user.decision.action}** | ${escapeCell(user.decision.reason)} |`
    );
  }
  lines.push('');
  lines.push('## Riley / Sam / Taylor check');
  lines.push('');
  for (const name of ['Riley Student', 'Sam Student', 'Taylor Student']) {
    const match = plan.users.find(
      (user) => user.name?.toLowerCase() === name.toLowerCase()
    );
    if (!match) {
      lines.push(`- **${name}**: not found in database (ASSUMPTION: verify on demo host).`);
      continue;
    }
    lines.push(
      `- **${name}**: ${match.decision.action} — ${match.documentStats.totalDocuments} docs (${match.decision.reason})`
    );
  }
  lines.push('');
  return lines.join('\n');
}

function escapeCell(value: string) {
  return value.replace(/\|/g, '\\|');
}

export function formatDryRunReport(plan: DemoCleanupPlan) {
  const deleteUsers = plan.users.filter((user) => user.decision.action === 'DELETE');
  const deleteOrgs = plan.organizations.filter((org) => org.decision.action === 'DELETE');
  const lines: string[] = [];
  lines.push('PKG-02 demo DB cleanup dry-run');
  lines.push(`Would delete ${deleteUsers.length} user(s) and ${deleteOrgs.length} organization(s).`);
  lines.push('');
  if (deleteOrgs.length) {
    lines.push('Organizations:');
    for (const org of deleteOrgs) {
      lines.push(`  - ${org.name} (${org.id}): ${org.decision.reason}`);
    }
    lines.push('');
  }
  if (deleteUsers.length) {
    lines.push('Users (first 40):');
    for (const user of deleteUsers.slice(0, 40)) {
      lines.push(
        `  - ${user.name ?? '—'} <${user.email ?? 'no-email'}>: ${user.decision.reason}`
      );
    }
    if (deleteUsers.length > 40) {
      lines.push(`  … and ${deleteUsers.length - 40} more users`);
    }
  }
  return lines.join('\n');
}
