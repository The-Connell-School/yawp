import { describe, expect, test } from 'bun:test';
import {
  combineSectionInsights,
  type SectionInsightInput,
} from './combine-section-insights';

type CategorySpec = {
  key: string;
  label: string;
  status: 'strength' | 'mixed' | 'gap';
  summary?: string;
};

function section(
  classId: string,
  options: {
    label?: string;
    submissionCount?: number;
    gradedCount?: number;
    categories?: CategorySpec[];
    nextSteps?: { title: string; detail: string; rubricCategory: string }[];
    overview?: string;
    noSummary?: boolean;
  } = {}
): SectionInsightInput {
  const {
    label = `Class ${classId}`,
    submissionCount = 10,
    gradedCount = submissionCount,
    categories = [],
    nextSteps = [],
    overview = `Overview for ${classId}.`,
    noSummary = false,
  } = options;

  return {
    classId,
    classAssignmentId: `ca-${classId}`,
    label,
    gradedCount,
    insight: noSummary
      ? null
      : {
          status: 'ready',
          submissionCount,
          generatedAt: '2026-08-01T00:00:00.000Z',
          summary: {
            overview,
            categories: categories.map((category) => ({
              summary: `${category.label} summary.`,
              ...category,
            })),
            nextSteps,
          },
        },
  };
}

describe('combineSectionInsights', () => {
  test('reports every section with its own submission count, never a single average', () => {
    const combined = combineSectionInsights([
      section('a', { label: 'Period 1', submissionCount: 24 }),
      section('b', { label: 'Period 2', submissionCount: 18 }),
    ]);

    expect(combined.totalSubmissions).toBe(42);
    expect(
      combined.sections.map((s) => [s.label, s.submissionCount])
    ).toEqual([
      ['Period 1', 24],
      ['Period 2', 18],
    ]);
    expect(combined.sections.every((s) => s.hasSummary)).toBe(true);
  });

  test('flags a section whose submission count is far below the largest section', () => {
    const combined = combineSectionInsights([
      section('a', { label: 'Period 1', submissionCount: 24 }),
      section('b', { label: 'Period 2', submissionCount: 3 }),
    ]);

    const [first, second] = combined.sections;
    expect(first.isThin).toBe(false);
    expect(second.isThin).toBe(true);
    expect(combined.hasUnevenCoverage).toBe(true);
    expect(combined.coverageWarnings.join(' ')).toContain('Period 2');
    expect(combined.coverageWarnings.join(' ')).toContain('3');
  });

  test('does not flag uneven coverage when sections are comparable', () => {
    const combined = combineSectionInsights([
      section('a', { submissionCount: 20 }),
      section('b', { submissionCount: 18 }),
    ]);

    expect(combined.hasUnevenCoverage).toBe(false);
    expect(combined.coverageWarnings).toEqual([]);
  });

  test('excludes sections with no summary from the totals and names them', () => {
    const combined = combineSectionInsights([
      section('a', { label: 'Period 1', submissionCount: 20 }),
      section('b', { label: 'Period 2', noSummary: true, gradedCount: 9 }),
    ]);

    expect(combined.totalSubmissions).toBe(20);
    expect(combined.reportingSections.map((s) => s.label)).toEqual([
      'Period 1',
    ]);
    expect(combined.missingSections.map((s) => s.label)).toEqual(['Period 2']);
    // A section with no summary is never treated as thin coverage — it is a
    // different problem, and it gets its own warning.
    expect(combined.missingSections[0].isThin).toBe(false);
    expect(combined.coverageWarnings.join(' ')).toContain(
      'no summary yet'
    );
    expect(combined.coverageWarnings.join(' ')).toContain('Period 2');
  });

  test('keeps a category status when every reporting section agrees', () => {
    const combined = combineSectionInsights([
      section('a', {
        label: 'Period 1',
        submissionCount: 20,
        categories: [{ key: 'thesis', label: 'Thesis', status: 'strength' }],
      }),
      section('b', {
        label: 'Period 2',
        submissionCount: 20,
        categories: [{ key: 'thesis', label: 'Thesis', status: 'strength' }],
      }),
    ]);

    expect(combined.categories).toHaveLength(1);
    const [thesis] = combined.categories;
    expect(thesis.key).toBe('thesis');
    expect(thesis.label).toBe('Thesis');
    expect(thesis.status).toBe('strength');
    expect(thesis.agreement).toBe('agreed');
    expect(thesis.sections.map((s) => [s.label, s.status])).toEqual([
      ['Period 1', 'strength'],
      ['Period 2', 'strength'],
    ]);
  });

  test('never resolves a disagreement into one status - it reports the split', () => {
    const combined = combineSectionInsights([
      section('a', {
        label: 'Period 1',
        submissionCount: 30,
        categories: [{ key: 'evidence', label: 'Evidence', status: 'strength' }],
      }),
      section('b', {
        label: 'Period 2',
        submissionCount: 4,
        categories: [{ key: 'evidence', label: 'Evidence', status: 'gap' }],
      }),
    ]);

    const [evidence] = combined.categories;
    // The big section does not get to speak for the small one.
    expect(evidence.agreement).toBe('split');
    expect(evidence.status).toBe('mixed');
    expect(evidence.sections.map((s) => s.status)).toEqual(['strength', 'gap']);
  });

  test('names the reporting sections that did not cover a category', () => {
    const combined = combineSectionInsights([
      section('a', {
        label: 'Period 1',
        categories: [
          { key: 'thesis', label: 'Thesis', status: 'strength' },
          { key: 'evidence', label: 'Evidence', status: 'gap' },
        ],
      }),
      section('b', {
        label: 'Period 2',
        categories: [{ key: 'thesis', label: 'Thesis', status: 'strength' }],
      }),
    ]);

    const evidence = combined.categories.find((c) => c.key === 'evidence')!;
    expect(evidence.sections.map((s) => s.label)).toEqual(['Period 1']);
    expect(evidence.notReportedBy).toEqual(['Period 2']);

    const thesis = combined.categories.find((c) => c.key === 'thesis')!;
    expect(thesis.notReportedBy).toEqual([]);
  });

  test('merges identical next steps and records which sections raised them', () => {
    const shared = {
      title: 'Model evidence integration',
      detail: 'Show a mentor paragraph that blends quote and analysis.',
      rubricCategory: 'evidence',
    };
    const combined = combineSectionInsights([
      section('a', {
        label: 'Period 1',
        nextSteps: [
          shared,
          {
            title: 'Revisit counterargument',
            detail: 'Run a quick debate.',
            rubricCategory: 'analysis',
          },
        ],
      }),
      section('b', { label: 'Period 2', nextSteps: [shared] }),
    ]);

    expect(combined.nextSteps).toHaveLength(2);
    // Shared across the most sections comes first.
    expect(combined.nextSteps[0].title).toBe('Model evidence integration');
    expect(combined.nextSteps[0].sectionLabels).toEqual([
      'Period 1',
      'Period 2',
    ]);
    expect(combined.nextSteps[1].sectionLabels).toEqual(['Period 1']);
  });

  test('handles a single section without inventing a comparison', () => {
    const combined = combineSectionInsights([
      section('a', {
        label: 'Period 1',
        submissionCount: 12,
        categories: [{ key: 'thesis', label: 'Thesis', status: 'gap' }],
      }),
    ]);

    expect(combined.totalSubmissions).toBe(12);
    expect(combined.hasUnevenCoverage).toBe(false);
    expect(combined.sections[0].isThin).toBe(false);
    expect(combined.categories[0].agreement).toBe('agreed');
  });

  test('returns an empty shape when nothing has been summarized', () => {
    const combined = combineSectionInsights([
      section('a', { noSummary: true }),
      section('b', { noSummary: true }),
    ]);

    expect(combined.totalSubmissions).toBe(0);
    expect(combined.categories).toEqual([]);
    expect(combined.nextSteps).toEqual([]);
    expect(combined.reportingSections).toEqual([]);
    expect(combined.missingSections).toHaveLength(2);
  });

  test('a section share is its portion of the combined submissions', () => {
    const combined = combineSectionInsights([
      section('a', { submissionCount: 30 }),
      section('b', { submissionCount: 10 }),
    ]);

    expect(combined.sections[0].shareOfTotal).toBeCloseTo(0.75);
    expect(combined.sections[1].shareOfTotal).toBeCloseTo(0.25);
  });
});
