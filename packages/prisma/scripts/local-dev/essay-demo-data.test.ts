import { describe, expect, test } from 'bun:test';

import { selectClassModels } from '../../../../services/web-app/app/domain/assignment-insights/select-class-models.ts';
import {
  computeWeightedPercentage,
  letterFromPercent,
} from '../../../../services/web-app/app/domain/grading/gradeMath.ts';
import {
  ESSAY_DEMO_COHORT,
  ESSAY_DEMO_RUBRIC_KEYS,
  type EssayDemoAssignment,
} from './essay-demo-data.ts';
import {
  ESSAY_DEMO_ASSIGNMENTS,
  essayDemoBody,
  essayDemoLetter,
  essayDemoPercentage,
} from './seed-essay-demo.ts';
import { ROMEO_AND_JULIET_ESSAY } from './essay-demo-romeo-juliet.ts';
import { SCHOOL_START_ESSAY } from './essay-demo-school-start.ts';

/**
 * The essay demo is there to show the class summary — and its models to teach
 * from — on work that looks like a real class handed it in. Both halves are
 * easy to lose in an edit: a shortened essay, or a score nudged so the class
 * is no longer weakest where the essays were written to be weak. So they are
 * asserted here rather than trusted.
 */

const cohortKeys = new Set(ESSAY_DEMO_COHORT.map((student) => student.key));

function wordCount(paragraphs: string[]) {
  return paragraphs.join(' ').split(/\s+/).filter(Boolean).length;
}

function modelsFor(assignment: EssayDemoAssignment) {
  return selectClassModels(
    assignment.submissions.flatMap((submission) => {
      if (!submission.grade) return [];
      const name = ESSAY_DEMO_COHORT.find(
        (student) => student.key === submission.studentKey
      )?.name;
      return [
        {
          submissionId: submission.studentKey,
          studentName: name,
          href: `/app/submissions/${submission.studentKey}`,
          text: essayDemoBody(submission.paragraphs).text,
          rubricScores: Object.fromEntries(
            ESSAY_DEMO_RUBRIC_KEYS.map((key) => [
              key,
              { score: submission.grade!.scores[key] },
            ])
          ),
        },
      ];
    })
  );
}

describe('essay demo data', () => {
  test.each(ESSAY_DEMO_ASSIGNMENTS.map((a) => [a.title, a] as const))(
    '%s is a full class set from the cohort',
    (_title, assignment) => {
      const keys = assignment.submissions.map((s) => s.studentKey);
      expect(new Set(keys).size).toBe(keys.length);
      for (const key of keys) expect(cohortKeys.has(key)).toBe(true);
      expect(keys.length).toBeGreaterThanOrEqual(8);
      expect(
        assignment.submissions.filter((s) => s.grade).length
      ).toBeGreaterThanOrEqual(8);
    }
  );

  test.each(ESSAY_DEMO_ASSIGNMENTS.map((a) => [a.title, a] as const))(
    '%s has real essays, not a couple of sentences',
    (_title, assignment) => {
      const counts = assignment.submissions.map((s) => wordCount(s.paragraphs));
      const thin = assignment.submissions
        .filter((s) => wordCount(s.paragraphs) < 280 || s.paragraphs.length < 4)
        .map((s) => s.studentKey);
      expect(thin).toEqual([]);
      const average = counts.reduce((sum, n) => sum + n, 0) / counts.length;
      expect(average).toBeGreaterThanOrEqual(420);
    }
  );

  test('every grade is a full one-to-five rubric with anchored comments', () => {
    for (const assignment of ESSAY_DEMO_ASSIGNMENTS) {
      for (const submission of assignment.submissions) {
        const grade = submission.grade;
        if (!grade) continue;
        const text = essayDemoBody(submission.paragraphs).text;
        for (const key of ESSAY_DEMO_RUBRIC_KEYS) {
          expect(Number.isInteger(grade.scores[key])).toBe(true);
          expect(grade.scores[key]).toBeGreaterThanOrEqual(1);
          expect(grade.scores[key]).toBeLessThanOrEqual(5);
          expect(grade.comments[key].trim().length).toBeGreaterThan(0);
        }
        expect(grade.overallComment.trim().length).toBeGreaterThan(0);
        // An inline comment whose excerpt is not in the essay has nowhere to
        // anchor and is silently dropped from the margin.
        const unanchored = grade.inlineComments
          .filter((comment) => !text.includes(comment.excerpt))
          .map((comment) => `${submission.studentKey}: ${comment.excerpt}`);
        expect(unanchored).toEqual([]);
      }
    }
  });

  test('records the same percentage and letter grading would', () => {
    for (const assignment of ESSAY_DEMO_ASSIGNMENTS) {
      for (const submission of assignment.submissions) {
        if (!submission.grade) continue;
        const rubricScores = Object.fromEntries(
          ESSAY_DEMO_RUBRIC_KEYS.map((key) => [
            key,
            { score: submission.grade!.scores[key] },
          ])
        );
        const percent = essayDemoPercentage(submission.grade);
        expect(percent).toBe(computeWeightedPercentage(rubricScores)!);
        expect(essayDemoLetter(percent)).toBe(letterFromPercent(percent));
      }
    }
  });

  test('escapes essay text into paragraphs of HTML', () => {
    expect(essayDemoBody(['A & B', '"<i>"'])).toEqual({
      text: 'A & B\n\n"<i>"',
      html: '<p>A &amp; B</p><p>&quot;&lt;i&gt;&quot;</p>',
    });
  });
});

describe('models to teach from, on the essay demo', () => {
  test('Romeo and Juliet: evidence and organization, each with a model and a near miss', () => {
    const models = modelsFor(ROMEO_AND_JULIET_ESSAY);
    expect(
      models?.focuses.map((focus) => ({
        category: focus.category,
        exemplar: focus.exemplar?.studentName,
        instructive: focus.instructive?.studentName,
      }))
    ).toEqual([
      {
        category: 'evidence_and_support',
        exemplar: 'Maya Okafor',
        instructive: 'Daniel Reyes',
      },
      {
        category: 'organization_and_structure',
        exemplar: 'Priya Nair',
        instructive: 'Hannah Liu',
      },
    ]);
  });

  test('school start time: thesis and voice, each with a model and a near miss', () => {
    const models = modelsFor(SCHOOL_START_ESSAY);
    expect(
      models?.focuses
        .map((focus) => ({
          category: focus.category,
          exemplar: focus.exemplar?.studentName,
          instructive: focus.instructive?.studentName,
        }))
        .sort((a, b) => a.category.localeCompare(b.category))
    ).toEqual([
      {
        category: 'thesis_and_content',
        exemplar: 'Aaliyah Brooks',
        instructive: 'Marcus Bell',
      },
      {
        category: 'voice_and_style',
        exemplar: 'Sofia Marquez',
        instructive: 'Maya Okafor',
      },
    ]);
  });
});
