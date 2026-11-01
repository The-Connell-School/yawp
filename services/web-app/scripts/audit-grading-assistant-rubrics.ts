/**
 * Read-only: is there a current rubric on every assignment type the Grading
 * Assistant grades?
 *
 * For Thesis-Driven Essay, Pre-Writing, Thesis Statement, Class Starter and
 * Exit Ticket in whichever database DATABASE_URL points at, prints where each
 * type's rubric comes from (library, its own, or built-in), its scale and
 * bands, how many assignments are pinned to a rubric revision, and anything
 * that needs fixing. Writes nothing.
 *
 *   bun scripts/audit-grading-assistant-rubrics.ts
 *   bun scripts/audit-grading-assistant-rubrics.ts --json
 *
 * Exits 1 when a type is missing or a check needs action, so it can gate a
 * release checklist.
 */
import { prisma } from '../app/utils/db.server';
import { resolveAssignmentTypeGradingConfig } from '../app/domain/assignment-types/assignment-type-grading-config.server';
import {
  auditGradingAssistantRubric,
  GRADING_ASSISTANT_AUDIT_TYPES,
  type AuditFinding,
} from '../app/domain/assignment-types/grading-assistant-rubric-audit';
import { summarizeGradingRubric } from '../app/domain/assignment-types/grading-rubric-summary';
import { isThesisDrivenEssayTitle } from '../app/domain/assignment-types/thesis-driven-essay';

type Report = {
  type: string;
  assignmentTypeId: string | null;
  title: string | null;
  owner: string | null;
  rubric: string | null;
  scale: string | null;
  categories: Array<{ label: string; weightPercent: number; levels: string[] }>;
  assignments: { total: number; pinned: number; unpinned: number };
  findings: AuditFinding[];
};

async function rowsFor(kind: string | null) {
  const rows = await prisma.assignmentType.findMany({
    where: kind ? { kind, archivedAt: null } : { kind: null, archivedAt: null },
    select: {
      id: true,
      title: true,
      kind: true,
      ownerOrg: { select: { name: true } },
      rubric: {
        select: { title: true, currentRevisionId: true },
      },
    },
    orderBy: { position: 'asc' },
  });
  return kind ? rows : rows.filter((row) => isThesisDrivenEssayTitle(row.title));
}

async function audit(): Promise<Report[]> {
  const reports: Report[] = [];
  for (const type of GRADING_ASSISTANT_AUDIT_TYPES) {
    const rows = await rowsFor(type.kind);
    if (rows.length === 0) {
      reports.push({
        type: type.name,
        assignmentTypeId: null,
        title: null,
        owner: null,
        rubric: null,
        scale: null,
        categories: [],
        assignments: { total: 0, pinned: 0, unpinned: 0 },
        findings: [
          {
            code: 'missing',
            level: 'action',
            message: `No active ${type.name} assignment type in this database.`,
          },
        ],
      });
      continue;
    }

    for (const row of rows) {
      const resolved = await resolveAssignmentTypeGradingConfig({
        assignmentTypeId: row.id,
        assignmentTypeKind: row.kind,
        assignmentTypeTitle: row.title,
      });
      const libraryRubricTitle = row.rubric?.title ?? null;
      const summary = summarizeGradingRubric(resolved, { libraryRubricTitle });
      const [total, unpinned] = await Promise.all([
        prisma.assignment.count({ where: { assignmentTypeId: row.id } }),
        prisma.assignment.count({
          where: { assignmentTypeId: row.id, rubricRevisionId: null },
        }),
      ]);
      reports.push({
        type: type.name,
        assignmentTypeId: row.id,
        title: row.title,
        owner: row.ownerOrg?.name ?? null,
        rubric: summary.sourceText,
        scale: summary.scaleText,
        categories: summary.categories.map(({ label, weightPercent, levels }) => ({
          label,
          weightPercent,
          levels,
        })),
        assignments: { total, pinned: total - unpinned, unpinned },
        findings: auditGradingAssistantRubric(
          type,
          {
            source: resolved.source,
            label: resolved.label,
            scoringType: resolved.scoringType,
            minScore: resolved.minScore,
            maxScore: resolved.maxScore,
            step: resolved.step,
            rubricCategories: resolved.rubricCategories,
            rubricIncomplete: resolved.rubricIncomplete,
          },
          {
            libraryRubricTitle,
            libraryRubricHasCurrentRevision: row.rubric
              ? row.rubric.currentRevisionId != null
              : null,
          }
        ),
      });
    }
  }
  return reports;
}

function printReport(reports: Report[]) {
  for (const report of reports) {
    const status = report.findings.some((finding) => finding.level === 'action')
      ? 'NEEDS ACTION'
      : 'OK';
    console.log(`\n${report.type}: ${status}`);
    if (report.assignmentTypeId) {
      console.log(
        `  ${report.title} (${report.assignmentTypeId})${report.owner ? ` — ${report.owner}` : ''}`
      );
      console.log(`  Rubric: ${report.rubric}`);
      console.log(`  Scale:  ${report.scale}`);
      for (const category of report.categories) {
        console.log(
          `  - ${category.label} · ${category.weightPercent}%${category.levels.length ? `: ${category.levels.join(' | ')}` : ''}`
        );
      }
      console.log(
        `  Assignments: ${report.assignments.total} (${report.assignments.pinned} pinned to a rubric revision, ${report.assignments.unpinned} grade from the live rubric)`
      );
    }
    for (const finding of report.findings) {
      console.log(`  [${finding.level}] ${finding.message}`);
    }
  }
}

try {
  const reports = await audit();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(reports, null, 2));
  } else {
    printReport(reports);
  }
  const needsAction = reports.some((report) =>
    report.findings.some((finding) => finding.level === 'action')
  );
  process.exitCode = needsAction ? 1 : 0;
} finally {
  await prisma.$disconnect();
}
