import { describe, expect, test } from 'bun:test';
import { buildLtiPostcheckReport } from './lti-launch-pilot-postcheck';

const cleanInput = {
  missingTables: [],
  missingTriggers: [],
  defaultGateIncorrect: false,
  registrationTenantMismatches: [],
  courseTenantMismatches: [],
  identityTenantMismatches: [],
  invalidDigestRows: [],
  outstandingDisabledArtifacts: [],
  counts: { registrations: 1 },
};

describe('LTI launch pilot postcheck report', () => {
  test('passes only when every release invariant is clean', () => {
    expect(buildLtiPostcheckReport(cleanInput)).toEqual({
      ok: true,
      counts: { registrations: 1 },
      blockers: [],
    });
  });

  test('reports tenant, trigger, digest, and disablement blockers', () => {
    const report = buildLtiPostcheckReport({
      ...cleanInput,
      missingTriggers: ['tenant-trigger'],
      courseTenantMismatches: ['mapping-1'],
      invalidDigestRows: ['identity-1'],
      outstandingDisabledArtifacts: ['pending-1'],
    });

    expect(report.ok).toBe(false);
    expect(report.blockers.map(({ kind }) => kind)).toEqual([
      'missing_trigger',
      'course_tenant_mismatch',
      'invalid_digest_length',
      'outstanding_disabled_artifact',
    ]);
  });
});
