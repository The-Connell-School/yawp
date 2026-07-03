/* eslint-disable no-console */
/**
 * POST-MIGRATION ONLY - validates the assignment type inheritance and
 * assignment-type-owned grading assistant cutover.
 *
 * Run after prisma migrate deploy:
 *   cd packages/prisma && DATABASE_URL=... bun run scripts/assignment-type-release-gate.ts
 *
 * Fresh empty migration databases are allowed. For production snapshot rehearsals,
 * set ASSIGNMENT_TYPE_RELEASE_GATE_REQUIRE_DATA=true or pass --require-data.
 */
import pg from 'pg';

export type ColumnRef = {
  tableName: string;
  columnName: string;
};

export type DefaultMismatch = ColumnRef & {
  expectedDefault: string;
  actualDefault: string | null;
};

export type AssignmentTypeReleaseGateInput = {
  requiredTablesMissing: string[];
  removedTablesPresent: string[];
  requiredColumnsMissing: ColumnRef[];
  removedColumnsPresent: ColumnRef[];
  requiredIndexesMissing: string[];
  requiredConstraintsMissing: string[];
  nullableRequiredColumns: ColumnRef[];
  defaultMismatches: DefaultMismatch[];
  data: {
    orphanOrganizationAssignmentTypeRows: number;
    orphanSchoolAssignmentTypeRows: number;
    orphanTeacherAssignmentTypeRows: number;
    orphanSubmissionGradingRuns: number;
    gradingRunsWithAssignmentTypeMissingSnapshots: number;
    assignmentTypeCount: number;
    assignmentTypesWithOwnedRubricConfig: number;
    organizationAssignmentTypeRows: number;
    schoolCustomizedCount: number;
    teacherCustomizedCount: number;
    schoolAssignmentTypeRows: number;
    teacherAssignmentTypeRows: number;
  };
};

type ReleaseGateOptions = {
  requireData?: boolean;
};

type ReleaseGateIssue = {
  kind: string;
  row: Record<string, unknown>;
};

type ColumnExpectation = ColumnRef & {
  requiredNotNull?: boolean;
  defaultIncludes?: string;
};

const REQUIRED_TABLES = [
  'AssignmentType',
  'OrganizationAssignmentType',
  'SchoolAssignmentType',
  'TeacherAssignmentType',
  'SubmissionGradingAssistantRun',
] as const;

const REMOVED_TABLES = [
  'FeatureAccessTarget',
  'GradingAssistantTemplate',
  'AssignmentTypeGradingAssistant',
] as const;

const REQUIRED_COLUMNS: ColumnExpectation[] = [
  {
    tableName: 'School',
    columnName: 'assignmentTypesCustomized',
    requiredNotNull: true,
    defaultIncludes: 'false',
  },
  {
    tableName: 'OrgMembership',
    columnName: 'assignmentTypesCustomized',
    requiredNotNull: true,
    defaultIncludes: 'false',
  },
  { tableName: 'AssignmentType', columnName: 'ownerOrgId' },
  { tableName: 'AssignmentType', columnName: 'ownerMembershipId' },
  { tableName: 'AssignmentType', columnName: 'scoringScaleJson' },
  { tableName: 'AssignmentType', columnName: 'rubricJson' },
  { tableName: 'AssignmentType', columnName: 'gradingPromptConfigJson' },
  { tableName: 'AssignmentType', columnName: 'gradingOutputSchemaJson' },
  { tableName: 'AssignmentType', columnName: 'gradingCalibrationNotes' },
  {
    tableName: 'AssignmentType',
    columnName: 'gradingAssistantVersion',
    requiredNotNull: true,
    defaultIncludes: '1',
  },
  {
    tableName: 'AssignmentType',
    columnName: 'gradingAssistantSourceTemplateId',
  },
  {
    tableName: 'AssignmentType',
    columnName: 'gradingAssistantSourceTemplateSlug',
  },
  { tableName: 'AssignmentModule', columnName: 'rubricAlignmentJson' },
  {
    tableName: 'SubmissionGradingAssistantRun',
    columnName: 'assignmentTypeId',
  },
  {
    tableName: 'SubmissionGradingAssistantRun',
    columnName: 'assignmentTypeGradingVersion',
  },
  {
    tableName: 'SubmissionGradingAssistantRun',
    columnName: 'assignmentTypeRubricSnapshot',
  },
  {
    tableName: 'SubmissionGradingAssistantRun',
    columnName: 'assignmentTypePromptConfigSnapshot',
  },
];

const REMOVED_COLUMNS: ColumnRef[] = [
  { tableName: 'AssignmentType', columnName: 'ownerTeacherId' },
  { tableName: 'SubmissionGradingAssistantRun', columnName: 'gradingAssistantTemplateId' },
  { tableName: 'SubmissionGradingAssistantRun', columnName: 'templateVersion' },
  { tableName: 'Assignment', columnName: 'tutorContext' },
];

const REQUIRED_INDEXES = [
  'OrganizationAssignmentType_assignmentTypeId_idx',
  'SchoolAssignmentType_assignmentTypeId_idx',
  'TeacherAssignmentType_assignmentTypeId_idx',
  'SubmissionGradingAssistantRun_assignmentTypeId_idx',
] as const;

const REQUIRED_CONSTRAINTS = [
  'OrganizationAssignmentType_pkey',
  'OrganizationAssignmentType_organizationId_fkey',
  'OrganizationAssignmentType_assignmentTypeId_fkey',
  'SchoolAssignmentType_pkey',
  'SchoolAssignmentType_schoolId_fkey',
  'SchoolAssignmentType_assignmentTypeId_fkey',
  'TeacherAssignmentType_pkey',
  'TeacherAssignmentType_membershipId_fkey',
  'TeacherAssignmentType_assignmentTypeId_fkey',
] as const;

function columnKey(column: ColumnRef) {
  return `${column.tableName}.${column.columnName}`;
}

function defaultMatches(actual: string | null, expected: string) {
  return Boolean(actual?.toLowerCase().includes(expected.toLowerCase()));
}

function pushIssue(
  issues: ReleaseGateIssue[],
  kind: string,
  row: Record<string, unknown>
) {
  issues.push({ kind, row });
}

export function buildAssignmentTypeReleaseGateReport(
  input: AssignmentTypeReleaseGateInput,
  options: ReleaseGateOptions = {}
) {
  const blockers: ReleaseGateIssue[] = [];
  const warnings: ReleaseGateIssue[] = [];

  for (const tableName of input.requiredTablesMissing) {
    pushIssue(blockers, 'missing_required_table', { tableName });
  }
  for (const tableName of input.removedTablesPresent) {
    pushIssue(blockers, 'removed_table_present', { tableName });
  }
  for (const row of input.requiredColumnsMissing) {
    pushIssue(blockers, 'missing_required_column', row);
  }
  for (const row of input.removedColumnsPresent) {
    pushIssue(blockers, 'removed_column_present', row);
  }
  for (const indexName of input.requiredIndexesMissing) {
    pushIssue(blockers, 'missing_required_index', { indexName });
  }
  for (const constraintName of input.requiredConstraintsMissing) {
    pushIssue(blockers, 'missing_required_constraint', { constraintName });
  }
  for (const row of input.nullableRequiredColumns) {
    pushIssue(blockers, 'required_column_nullable', row);
  }
  for (const row of input.defaultMismatches) {
    pushIssue(blockers, 'column_default_mismatch', row);
  }

  const dataBlockers: Array<[number, string]> = [
    [
      input.data.orphanOrganizationAssignmentTypeRows,
      'orphan_organization_assignment_type',
    ],
    [input.data.orphanSchoolAssignmentTypeRows, 'orphan_school_assignment_type'],
    [input.data.orphanTeacherAssignmentTypeRows, 'orphan_teacher_assignment_type'],
    [
      input.data.orphanSubmissionGradingRuns,
      'orphan_submission_grading_run_assignment_type',
    ],
    [
      input.data.gradingRunsWithAssignmentTypeMissingSnapshots,
      'grading_run_missing_assignment_type_snapshots',
    ],
  ];

  for (const [count, kind] of dataBlockers) {
    if (count > 0) pushIssue(blockers, kind, { count });
  }

  const requiredDataPresenceIssues: Array<[number, string]> = [
    [input.data.assignmentTypeCount, 'missing_assignment_type_data'],
    [
      input.data.organizationAssignmentTypeRows,
      'missing_org_assignment_type_data',
    ],
  ];

  for (const [count, kind] of requiredDataPresenceIssues) {
    if (count === 0) {
      pushIssue(options.requireData ? blockers : warnings, kind, { count });
    }
  }

  if (input.data.assignmentTypesWithOwnedRubricConfig === 0) {
    pushIssue(warnings, 'missing_owned_rubric_config_data', { count: 0 });
  }

  return {
    ok: blockers.length === 0,
    requireData: Boolean(options.requireData),
    counts: input.data,
    blockers,
    warnings,
  };
}

async function querySet(pool: pg.Pool, sql: string, columnName: string) {
  const { rows } = await pool.query<Record<string, string>>(sql);
  return new Set(rows.map((row) => row[columnName]));
}

async function queryCount(pool: pg.Pool, sql: string) {
  const { rows } = await pool.query<{ count: string | number }>(sql);
  return Number(rows[0]?.count ?? 0);
}

export async function collectAssignmentTypeReleaseGateInput(
  pool: pg.Pool
): Promise<AssignmentTypeReleaseGateInput> {
  const tables = await querySet(
    pool,
    `
      SELECT table_name AS "tableName"
      FROM information_schema.tables
      WHERE table_schema = current_schema()
    `,
    'tableName'
  );

  const { rows: columnRows } = await pool.query<{
    tableName: string;
    columnName: string;
    isNullable: string;
    columnDefault: string | null;
  }>(`
    SELECT
      table_name AS "tableName",
      column_name AS "columnName",
      is_nullable AS "isNullable",
      column_default AS "columnDefault"
    FROM information_schema.columns
    WHERE table_schema = current_schema()
  `);
  const columns = new Map(columnRows.map((row) => [columnKey(row), row]));

  const indexes = await querySet(
    pool,
    `
      SELECT indexname AS "indexName"
      FROM pg_indexes
      WHERE schemaname = current_schema()
    `,
    'indexName'
  );
  const constraints = await querySet(
    pool,
    `
      SELECT constraint_name AS "constraintName"
      FROM information_schema.table_constraints
      WHERE table_schema = current_schema()
    `,
    'constraintName'
  );

  const requiredColumnsPresent = REQUIRED_COLUMNS.filter((column) =>
    columns.has(columnKey(column))
  );

  return {
    requiredTablesMissing: REQUIRED_TABLES.filter((table) => !tables.has(table)),
    removedTablesPresent: REMOVED_TABLES.filter((table) => tables.has(table)),
    requiredColumnsMissing: REQUIRED_COLUMNS.filter(
      (column) => !columns.has(columnKey(column))
    ),
    removedColumnsPresent: REMOVED_COLUMNS.filter((column) =>
      columns.has(columnKey(column))
    ),
    requiredIndexesMissing: REQUIRED_INDEXES.filter(
      (indexName) => !indexes.has(indexName)
    ),
    requiredConstraintsMissing: REQUIRED_CONSTRAINTS.filter(
      (constraintName) => !constraints.has(constraintName)
    ),
    nullableRequiredColumns: requiredColumnsPresent.filter((column) => {
      if (!column.requiredNotNull) return false;
      return columns.get(columnKey(column))?.isNullable !== 'NO';
    }),
    defaultMismatches: requiredColumnsPresent.flatMap((column) => {
      if (!column.defaultIncludes) return [];
      const actualDefault = columns.get(columnKey(column))?.columnDefault ?? null;
      if (defaultMatches(actualDefault, column.defaultIncludes)) return [];
      return [
        {
          tableName: column.tableName,
          columnName: column.columnName,
          expectedDefault: column.defaultIncludes,
          actualDefault,
        },
      ];
    }),
    data: await collectDataCounts(pool, tables),
  };
}

async function collectDataCounts(pool: pg.Pool, tables: Set<string>) {
  const has = (tableName: string) => tables.has(tableName);
  const safeCount = async (tableNames: string[], sql: string) => {
    if (!tableNames.every(has)) return 0;
    return queryCount(pool, sql);
  };

  return {
    orphanOrganizationAssignmentTypeRows: await safeCount(
      ['OrganizationAssignmentType', 'Organization', 'AssignmentType'],
      `
        SELECT COUNT(*)::int AS count
        FROM "OrganizationAssignmentType" join_table
        LEFT JOIN "Organization" organization
          ON organization.id = join_table."organizationId"
        LEFT JOIN "AssignmentType" assignment_type
          ON assignment_type.id = join_table."assignmentTypeId"
        WHERE organization.id IS NULL OR assignment_type.id IS NULL
      `
    ),
    orphanSchoolAssignmentTypeRows: await safeCount(
      ['SchoolAssignmentType', 'School', 'AssignmentType'],
      `
        SELECT COUNT(*)::int AS count
        FROM "SchoolAssignmentType" join_table
        LEFT JOIN "School" school
          ON school.id = join_table."schoolId"
        LEFT JOIN "AssignmentType" assignment_type
          ON assignment_type.id = join_table."assignmentTypeId"
        WHERE school.id IS NULL OR assignment_type.id IS NULL
      `
    ),
    orphanTeacherAssignmentTypeRows: await safeCount(
      ['TeacherAssignmentType', 'OrgMembership', 'AssignmentType'],
      `
        SELECT COUNT(*)::int AS count
        FROM "TeacherAssignmentType" join_table
        LEFT JOIN "OrgMembership" membership
          ON membership.id = join_table."membershipId"
        LEFT JOIN "AssignmentType" assignment_type
          ON assignment_type.id = join_table."assignmentTypeId"
        WHERE membership.id IS NULL OR assignment_type.id IS NULL
      `
    ),
    orphanSubmissionGradingRuns: await safeCount(
      ['SubmissionGradingAssistantRun', 'AssignmentType'],
      `
        SELECT COUNT(*)::int AS count
        FROM "SubmissionGradingAssistantRun" run
        LEFT JOIN "AssignmentType" assignment_type
          ON assignment_type.id = run."assignmentTypeId"
        WHERE run."assignmentTypeId" IS NOT NULL
          AND assignment_type.id IS NULL
      `
    ),
    gradingRunsWithAssignmentTypeMissingSnapshots: await safeCount(
      ['SubmissionGradingAssistantRun'],
      `
        SELECT COUNT(*)::int AS count
        FROM "SubmissionGradingAssistantRun"
        WHERE "assignmentTypeId" IS NOT NULL
          AND (
            "assignmentTypeGradingVersion" IS NULL
            OR "assignmentTypeRubricSnapshot" IS NULL
            OR "assignmentTypePromptConfigSnapshot" IS NULL
          )
      `
    ),
    assignmentTypeCount: await safeCount(
      ['AssignmentType'],
      `SELECT COUNT(*)::int AS count FROM "AssignmentType"`
    ),
    assignmentTypesWithOwnedRubricConfig: await safeCount(
      ['AssignmentType'],
      `
        SELECT COUNT(*)::int AS count
        FROM "AssignmentType"
        WHERE "scoringScaleJson" IS NOT NULL
          AND "rubricJson" IS NOT NULL
          AND "gradingPromptConfigJson" IS NOT NULL
      `
    ),
    organizationAssignmentTypeRows: await safeCount(
      ['OrganizationAssignmentType'],
      `SELECT COUNT(*)::int AS count FROM "OrganizationAssignmentType"`
    ),
    schoolCustomizedCount: await safeCount(
      ['School'],
      `
        SELECT COUNT(*)::int AS count
        FROM "School"
        WHERE "assignmentTypesCustomized" = true
      `
    ),
    teacherCustomizedCount: await safeCount(
      ['OrgMembership'],
      `
        SELECT COUNT(*)::int AS count
        FROM "OrgMembership"
        WHERE "assignmentTypesCustomized" = true
      `
    ),
    schoolAssignmentTypeRows: await safeCount(
      ['SchoolAssignmentType'],
      `SELECT COUNT(*)::int AS count FROM "SchoolAssignmentType"`
    ),
    teacherAssignmentTypeRows: await safeCount(
      ['TeacherAssignmentType'],
      `SELECT COUNT(*)::int AS count FROM "TeacherAssignmentType"`
    ),
  };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.trim()) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const requireData =
    process.argv.includes('--require-data') ||
    process.env.ASSIGNMENT_TYPE_RELEASE_GATE_REQUIRE_DATA === 'true';
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    const input = await collectAssignmentTypeReleaseGateInput(pool);
    const report = buildAssignmentTypeReleaseGateReport(input, { requireData });
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exit(1);
  } finally {
    await pool.end();
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
