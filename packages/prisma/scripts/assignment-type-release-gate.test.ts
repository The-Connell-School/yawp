import { describe, expect, test } from 'bun:test';
import {
  buildAssignmentTypeReleaseGatePoolConfig,
  buildAssignmentTypeReleaseGateReport,
  type AssignmentTypeReleaseGateInput,
} from './assignment-type-release-gate';

function goodInput(
  overrides: Partial<AssignmentTypeReleaseGateInput> = {}
): AssignmentTypeReleaseGateInput {
  return {
    requiredTablesMissing: [],
    removedTablesPresent: [],
    requiredColumnsMissing: [],
    removedColumnsPresent: [],
    requiredIndexesMissing: [],
    requiredConstraintsMissing: [],
    nullableRequiredColumns: [],
    defaultMismatches: [],
    data: {
      orphanOrganizationAssignmentTypeRows: 0,
      orphanSchoolAssignmentTypeRows: 0,
      orphanTeacherAssignmentTypeRows: 0,
      orphanSubmissionGradingRuns: 0,
      gradingRunsWithAssignmentTypeMissingSnapshots: 0,
      assignmentTypeCount: 6,
      assignmentTypesWithOwnedRubricConfig: 4,
      organizationAssignmentTypeRows: 6,
      schoolCustomizedCount: 1,
      teacherCustomizedCount: 1,
      schoolAssignmentTypeRows: 2,
      teacherAssignmentTypeRows: 2,
    },
    ...overrides,
  };
}

describe('assignment type release gate', () => {
  test('uses TLS when running through the production migration tunnel', () => {
    expect(
      buildAssignmentTypeReleaseGatePoolConfig(
        'postgresql://yawp:secret@localhost:3306/yawp',
        { REMOTE_MIGRATE_TUNNEL: '1' }
      )
    ).toEqual({
      connectionString: 'postgresql://yawp:secret@localhost:3306/yawp',
      ssl: { rejectUnauthorized: false },
    });
  });

  test('keeps local migration validation non-TLS', () => {
    expect(
      buildAssignmentTypeReleaseGatePoolConfig(
        'postgresql://postgres:postgres@127.0.0.1:5432/yawp_migration_ci',
        {}
      )
    ).toEqual({
      connectionString:
        'postgresql://postgres:postgres@127.0.0.1:5432/yawp_migration_ci',
    });
  });

  test('passes when schema and data invariants hold', () => {
    const report = buildAssignmentTypeReleaseGateReport(goodInput());

    expect(report.ok).toBe(true);
    expect(report.blockers).toEqual([]);
  });

  test('blocks missing new schema and old schema leftovers', () => {
    const report = buildAssignmentTypeReleaseGateReport(
      goodInput({
        requiredTablesMissing: ['TeacherAssignmentType'],
        removedTablesPresent: ['GradingAssistantTemplate'],
        requiredColumnsMissing: [
          { tableName: 'AssignmentType', columnName: 'rubricJson' },
        ],
        removedColumnsPresent: [
          { tableName: 'Assignment', columnName: 'tutorContext' },
        ],
        requiredIndexesMissing: [
          'SubmissionGradingAssistantRun_assignmentTypeId_idx',
        ],
        requiredConstraintsMissing: [
          'TeacherAssignmentType_membershipId_fkey',
        ],
        nullableRequiredColumns: [
          { tableName: 'School', columnName: 'assignmentTypesCustomized' },
        ],
        defaultMismatches: [
          {
            tableName: 'AssignmentType',
            columnName: 'gradingAssistantVersion',
            expectedDefault: '1',
            actualDefault: null,
          },
        ],
      })
    );

    expect(report.ok).toBe(false);
    expect(report.blockers.map((blocker) => blocker.kind)).toEqual([
      'missing_required_table',
      'removed_table_present',
      'missing_required_column',
      'removed_column_present',
      'missing_required_index',
      'missing_required_constraint',
      'required_column_nullable',
      'column_default_mismatch',
    ]);
  });

  test('blocks post-migration data integrity violations', () => {
    const report = buildAssignmentTypeReleaseGateReport(
      goodInput({
        data: {
          ...goodInput().data,
          orphanOrganizationAssignmentTypeRows: 1,
          orphanSchoolAssignmentTypeRows: 2,
          orphanTeacherAssignmentTypeRows: 3,
          orphanSubmissionGradingRuns: 4,
          gradingRunsWithAssignmentTypeMissingSnapshots: 5,
        },
      })
    );

    expect(report.ok).toBe(false);
    expect(report.blockers.map((blocker) => blocker.kind)).toEqual([
      'orphan_organization_assignment_type',
      'orphan_school_assignment_type',
      'orphan_teacher_assignment_type',
      'orphan_submission_grading_run_assignment_type',
      'grading_run_missing_assignment_type_snapshots',
    ]);
  });

  test('does not block production snapshots that still use default rubric fallback', () => {
    const input = goodInput({
      data: {
        ...goodInput().data,
        assignmentTypeCount: 9,
        assignmentTypesWithOwnedRubricConfig: 0,
        organizationAssignmentTypeRows: 46,
        schoolCustomizedCount: 0,
        teacherCustomizedCount: 0,
        schoolAssignmentTypeRows: 0,
        teacherAssignmentTypeRows: 0,
      },
    });

    const report = buildAssignmentTypeReleaseGateReport(input, {
      requireData: true,
    });

    expect(report.ok).toBe(true);
    expect(report.blockers).toEqual([]);
    expect(report.warnings.map((warning) => warning.kind)).toEqual([
      'missing_owned_rubric_config_data',
    ]);
  });

  test('warns for empty fresh databases unless data is required', () => {
    const input = goodInput({
      data: {
        ...goodInput().data,
        assignmentTypeCount: 0,
        assignmentTypesWithOwnedRubricConfig: 0,
        organizationAssignmentTypeRows: 0,
      },
    });

    expect(buildAssignmentTypeReleaseGateReport(input).ok).toBe(true);
    expect(buildAssignmentTypeReleaseGateReport(input).warnings).toHaveLength(3);

    const strictReport = buildAssignmentTypeReleaseGateReport(input, {
      requireData: true,
    });
    expect(strictReport.ok).toBe(false);
    expect(strictReport.blockers.map((blocker) => blocker.kind)).toEqual([
      'missing_assignment_type_data',
      'missing_org_assignment_type_data',
    ]);
    expect(strictReport.warnings.map((warning) => warning.kind)).toEqual([
      'missing_owned_rubric_config_data',
    ]);
  });
});
