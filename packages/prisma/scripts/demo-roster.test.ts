import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildDemoRoster,
  DEMO_ROSTER_ASSIGNMENTS,
  DEMO_ROSTER_STUDENTS,
  type DemoRosterPlan,
  type DemoWorkPlan,
} from './local-dev/demo-roster';
import { rubricKeys } from '../../../services/web-app/app/domain/grading/rubric.ts';
import {
  computeWeightedPercentage,
  letterFromPercent,
} from '../../../services/web-app/app/domain/grading/gradeMath.ts';

const NOW = new Date('2026-05-14T15:00:00.000Z');

function build(): DemoRosterPlan {
  return buildDemoRoster({ now: NOW });
}

function releasedWork(plan: DemoRosterPlan): DemoWorkPlan[] {
  return plan.work.filter((entry) => entry.state === 'released');
}

function workByStudent(plan: DemoRosterPlan, studentKey: string) {
  return plan.work
    .filter((entry) => entry.studentKey === studentKey)
    .sort((a, b) => {
      const left = a.submittedAt?.getTime() ?? 0;
      const right = b.submittedAt?.getTime() ?? 0;
      return left - right;
    });
}

describe('demo roster students', () => {
  test('fills both demo classes with a full-size roster', () => {
    const primary = DEMO_ROSTER_STUDENTS.filter(
      (student) => student.classKey === 'primary'
    );
    const secondary = DEMO_ROSTER_STUDENTS.filter(
      (student) => student.classKey === 'secondary'
    );

    expect(primary.length).toBeGreaterThanOrEqual(20);
    expect(secondary.length).toBeGreaterThanOrEqual(15);
  });

  test('gives every roster student a unique key, name, and dev email', () => {
    const keys = new Set(DEMO_ROSTER_STUDENTS.map((student) => student.key));
    const names = new Set(DEMO_ROSTER_STUDENTS.map((student) => student.name));
    const emails = new Set(
      DEMO_ROSTER_STUDENTS.map((student) => student.email)
    );

    expect(keys.size).toBe(DEMO_ROSTER_STUDENTS.length);
    expect(names.size).toBe(DEMO_ROSTER_STUDENTS.length);
    expect(emails.size).toBe(DEMO_ROSTER_STUDENTS.length);
    expect(
      DEMO_ROSTER_STUDENTS.every((student) =>
        student.email.endsWith('@yawp.local')
      )
    ).toBe(true);
  });

  test('spreads students across every growth arc so reports differ', () => {
    const arcs = new Set(DEMO_ROSTER_STUDENTS.map((student) => student.arc));

    expect(arcs.has('rising')).toBe(true);
    expect(arcs.has('slipping')).toBe(true);
    expect(arcs.has('struggling')).toBe(true);
    expect(arcs.has('steady-high')).toBe(true);
    expect(arcs.size).toBeGreaterThanOrEqual(5);
  });
});

describe('demo roster assignments', () => {
  test('gives each class a semester of assignments', () => {
    const primary = DEMO_ROSTER_ASSIGNMENTS.filter(
      (assignment) => assignment.classKey === 'primary'
    );
    const secondary = DEMO_ROSTER_ASSIGNMENTS.filter(
      (assignment) => assignment.classKey === 'secondary'
    );

    expect(primary.length).toBeGreaterThanOrEqual(5);
    expect(secondary.length).toBeGreaterThanOrEqual(4);
  });

  test('dates assignments in the past, oldest first, within the school year', () => {
    const plan = build();

    for (const classKey of ['primary', 'secondary'] as const) {
      const assignments = plan.assignments.filter(
        (assignment) => assignment.classKey === classKey
      );
      const timestamps = assignments.map((assignment) =>
        assignment.assignedAt.getTime()
      );

      expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
      expect(Math.max(...timestamps)).toBeLessThan(NOW.getTime());
      expect(NOW.getTime() - Math.min(...timestamps)).toBeLessThan(
        400 * 24 * 60 * 60 * 1000
      );
    }
  });

  test('leaves each class a live grading queue and an unreleased batch', () => {
    for (const classKey of ['primary', 'secondary'] as const) {
      const assignments = DEMO_ROSTER_ASSIGNMENTS.filter(
        (assignment) => assignment.classKey === classKey
      );

      expect(
        assignments.some(
          (assignment) => assignment.state === 'awaiting-grading'
        )
      ).toBe(true);
      expect(
        assignments.filter((assignment) => assignment.state === 'released')
          .length
      ).toBeGreaterThanOrEqual(3);
    }

    expect(
      DEMO_ROSTER_ASSIGNMENTS.some(
        (assignment) => assignment.state === 'graded-unreleased'
      )
    ).toBe(true);
  });

  test('newest assignment in a class is the one still being graded', () => {
    const plan = build();

    for (const classKey of ['primary', 'secondary'] as const) {
      const assignments = plan.assignments.filter(
        (assignment) => assignment.classKey === classKey
      );
      const newest = assignments[assignments.length - 1];

      expect(newest?.state).toBe('awaiting-grading');
    }
  });
});

describe('buildDemoRoster', () => {
  test('is deterministic for a given clock', () => {
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });

  test('only produces work for students in the assignment class', () => {
    const plan = build();
    const studentClass = new Map(
      plan.students.map((student) => [student.key, student.classKey])
    );
    const assignmentClass = new Map(
      plan.assignments.map((assignment) => [
        assignment.key,
        assignment.classKey,
      ])
    );

    for (const entry of plan.work) {
      expect(studentClass.has(entry.studentKey)).toBe(true);
      expect(assignmentClass.has(entry.assignmentKey)).toBe(true);
      expect(studentClass.get(entry.studentKey)).toBe(
        assignmentClass.get(entry.assignmentKey)!
      );
    }
  });

  test('gives every student enough released history for a growth report', () => {
    const plan = build();

    for (const student of plan.students) {
      const released = workByStudent(plan, student.key).filter(
        (entry) => entry.state === 'released'
      );
      expect(released.length).toBeGreaterThanOrEqual(3);
    }
  });

  test('scores every graded submission on all five rubric skills', () => {
    const plan = build();
    const graded = plan.work.filter(
      (entry) => entry.state === 'graded' || entry.state === 'released'
    );

    expect(graded.length).toBeGreaterThanOrEqual(100);

    for (const entry of graded) {
      expect(entry.rubricScores).not.toBeNull();
      for (const key of rubricKeys) {
        const value = entry.rubricScores![key];
        expect(value).toBeDefined();
        expect(value.score).toBeGreaterThanOrEqual(1);
        expect(value.score).toBeLessThanOrEqual(5);
        expect(Number.isInteger(value.score)).toBe(true);
      }
    }
  });

  test('derives percentages and letters from the rubric with app grade math', () => {
    const plan = build();

    for (const entry of plan.work) {
      if (entry.state !== 'graded' && entry.state !== 'released') continue;
      const expected = computeWeightedPercentage(entry.rubricScores);
      expect(entry.numericPercentage).toBe(expected);
      expect(entry.letterGrade).toBe(letterFromPercent(expected!));
    }
  });

  test('releases grades only on released assignments', () => {
    const plan = build();
    const stateByAssignment = new Map(
      plan.assignments.map((assignment) => [assignment.key, assignment.state])
    );

    for (const entry of plan.work) {
      const assignmentState = stateByAssignment.get(entry.assignmentKey);
      if (entry.state === 'released') {
        expect(assignmentState).toBe('released');
        expect(entry.releasedAt).toBeInstanceOf(Date);
        expect(entry.gradedAt).toBeInstanceOf(Date);
      }
      if (entry.state === 'graded') {
        expect(assignmentState).toBe('graded-unreleased');
        expect(entry.releasedAt).toBeNull();
        expect(entry.gradedAt).toBeInstanceOf(Date);
      }
      if (entry.state === 'submitted') {
        expect(entry.gradedAt).toBeNull();
        expect(entry.releasedAt).toBeNull();
        expect(entry.submittedAt).toBeInstanceOf(Date);
      }
      if (entry.state === 'in-progress') {
        expect(entry.submittedAt).toBeNull();
      }
    }
  });

  test('leaves a real grading queue of ungraded submissions', () => {
    const plan = build();
    const submitted = plan.work.filter((entry) => entry.state === 'submitted');
    const drafts = plan.work.filter((entry) => entry.state === 'in-progress');

    expect(submitted.length).toBeGreaterThanOrEqual(20);
    expect(drafts.length).toBeGreaterThanOrEqual(3);
  });

  test('moves grades over time so growth reports have a real trend', () => {
    const plan = build();
    const deltas = plan.students.map((student) => {
      const released = workByStudent(plan, student.key).filter(
        (entry) => entry.state === 'released'
      );
      const first = released[0]?.numericPercentage ?? 0;
      const latest = released[released.length - 1]?.numericPercentage ?? 0;
      return latest - first;
    });

    expect(Math.max(...deltas)).toBeGreaterThanOrEqual(10);
    expect(Math.min(...deltas)).toBeLessThanOrEqual(-10);
  });

  test('spreads a class-wide range of rubric levels on a single assignment', () => {
    const plan = build();
    const byAssignment = new Map<string, DemoWorkPlan[]>();
    for (const entry of releasedWork(plan)) {
      const bucket = byAssignment.get(entry.assignmentKey) ?? [];
      bucket.push(entry);
      byAssignment.set(entry.assignmentKey, bucket);
    }

    for (const [, entries] of byAssignment) {
      const scores = entries.flatMap((entry) =>
        rubricKeys.map((key) => entry.rubricScores![key].score)
      );
      expect(Math.min(...scores)).toBeLessThanOrEqual(2);
      expect(Math.max(...scores)).toBeGreaterThanOrEqual(4);
    }
  });

  test('gives each class its own weakest and strongest writing skill', () => {
    const plan = build();
    const studentClass = new Map(
      plan.students.map((student) => [student.key, student.classKey])
    );

    const averages = (classKey: string) => {
      const totals = new Map<string, number[]>();
      for (const entry of releasedWork(plan)) {
        if (studentClass.get(entry.studentKey) !== classKey) continue;
        for (const key of rubricKeys) {
          const bucket = totals.get(key) ?? [];
          bucket.push(entry.rubricScores![key].score);
          totals.set(key, bucket);
        }
      }
      return [...totals.entries()]
        .map(([key, scores]) => ({
          key,
          average:
            scores.reduce((sum, value) => sum + value, 0) / scores.length,
        }))
        .sort((a, b) => a.average - b.average);
    };

    const primary = averages('primary');
    const secondary = averages('secondary');

    // A class-wide gap the teacher can actually act on: the weakest skill has
    // to sit clearly below the strongest, or "what is my class worst at?" has
    // no answer.
    expect(
      primary[primary.length - 1].average - primary[0].average
    ).toBeGreaterThan(0.3);
    expect(
      secondary[secondary.length - 1].average - secondary[0].average
    ).toBeGreaterThan(0.3);

    // And the two classes need different profiles, so switching classes in the
    // Reporter or Class Summary tells a different story.
    expect(primary[0].key).not.toBe(secondary[0].key);
  });

  test('writes distinct, substantial essays for every piece of work', () => {
    const plan = build();
    const bodies = new Set<string>();

    for (const entry of plan.work) {
      if (entry.state === 'in-progress') continue;
      expect(entry.text.length).toBeGreaterThanOrEqual(400);
      expect(entry.html.startsWith('<p>')).toBe(true);
      bodies.add(entry.text);
    }

    const gradeable = plan.work.filter(
      (entry) => entry.state !== 'in-progress'
    );
    expect(bodies.size).toBe(gradeable.length);
  });

  test('grounds teacher feedback in the essay the student actually wrote', () => {
    const plan = build();
    const graded = plan.work.filter(
      (entry) => entry.state === 'graded' || entry.state === 'released'
    );
    const withComments = graded.filter(
      (entry) => entry.inlineComments.length > 0
    );

    expect(withComments.length / graded.length).toBeGreaterThan(0.5);

    for (const entry of graded) {
      expect(entry.overallComment).toBeTruthy();
      for (const comment of entry.inlineComments) {
        expect(entry.text).toContain(comment.excerpt);
        expect(comment.content.length).toBeGreaterThan(10);
      }
    }
  });

  test('proposes growth plans for students the reports flag', () => {
    const plan = build();

    expect(plan.growthPlans.length).toBeGreaterThanOrEqual(2);

    const studentKeys = new Set(plan.students.map((student) => student.key));
    for (const growthPlan of plan.growthPlans) {
      expect(studentKeys.has(growthPlan.studentKey)).toBe(true);
      expect(growthPlan.targetSkills.length).toBeGreaterThan(0);
      expect(
        growthPlan.targetSkills.every((skill) =>
          (rubricKeys as string[]).includes(skill)
        )
      ).toBe(true);
      expect(growthPlan.body.length).toBeGreaterThan(100);
      expect(growthPlan.baseline.averagePercentage).toBeGreaterThan(0);
    }
  });
});

describe('demo roster seeding wiring', () => {
  test('the local dev synthetic seed installs the demo roster', () => {
    const source = readFileSync(
      join(import.meta.dirname, 'local-dev/seed-synthetic-data.ts'),
      'utf8'
    );

    expect(source).toContain('seedDemoRoster');
  });

  test('preview deploys ship the demo roster modules with the seed', () => {
    const deploy = readFileSync(
      join(import.meta.dirname, '../../../scripts/preview/deploy.sh'),
      'utf8'
    );

    expect(deploy).toContain(
      'packages/prisma/scripts/local-dev/demo-roster.ts'
    );
    expect(deploy).toContain(
      'packages/prisma/scripts/local-dev/seed-demo-roster.ts'
    );
  });
});
