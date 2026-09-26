# Product behavior change — assignment sheet grading configuration

Work: `yawp-grading-config-summary-disclosure`

## Intended workflow change

The grading block on the assignment creation and edit sheet no longer gates its
settings behind a **Customize Grading** checkbox.

Before: the block opened with a read-only **Default point value** field, a
read-only **Default grading type** box reading "By default: Step grading", a
**Rubric default: N points** hint, and a **Customize Grading** checkbox. Only
after checking that box did **Total Point Values**, **Grading Total**, and
**Scoring behavior** appear, nested two containers deep.

After: the block rests as one sentence describing the settings actually in
force — "Graded out of 100 points in steps, read at the intermediate level." — 
next to a **Change** button. Change opens a single flat panel holding **Point
value**, **Scoring behavior**, and **Grading Assistance**. Opening the panel is
the deliberate act that the checkbox used to be.

## Assertions that were removed and why

The removed specs asserted the gate itself, so they cannot survive its removal.

| Removed assertion | Replaced by |
| --- | --- |
| `Default point value` is present and `readonly` | The summary sentence states the point value; the panel exposes one editable **Point value** field |
| `Customize Grading` checkbox exists and is unchecked | `customize grading` asserted absent; the **Change** button is asserted present |
| `Default grading type` / `By default: Step grading` visible | The summary sentence states the scoring mode |
| `Rubric default: N points` visible | Removed with no replacement — see below |
| `Grading Total: N points.` visible | Removed; the summary sentence carries the total |
| Checking Customize Grading reveals `Total Point Values` | Clicking **Change** reveals **Point value** |
| Turning Customize Grading off clears `rubricTotalPoints` | An existing `rubricTotalPoints` is asserted to survive untouched |

## Deliberate capability removal

`rubricTotalPoints` rescales the rubric's own scale and the `max_score` handed
to the grading assistant. It is a different quantity from `pointValue`, which is
the gradebook denominator. The old UI set both to the same number whenever
Customize Grading was on.

This sheet no longer creates a `rubricTotalPoints` override at all. An
assignment that already has one keeps it; a newly created assignment gets
`null`, meaning the rubric keeps its authored scale.

That is intentional on two grounds. The override was never separately
controllable, so pairing it to the gradebook total was an accident of the gate
rather than a teacher decision. And syncing it is unsafe: `scoreToPercent` in
`app/domain/grading/gradeMath.ts` maps only the values 1 through 5, so
rescaling a `weighted_1_5` rubric to 100 makes the assistant return scores the
percentage calculation cannot read, yielding a null percentage and no letter
grade.

The e2e assertion `expect(created.rubricTotalPoints).toBe(25)` therefore becomes
`toBeNull()`. No path in the product sets a new override today; existing
overrides are unaffected.

## Superseded decisions

This replaces two durable Record decisions:

- "Keep the default assignment point value visible but read-only; only Customize
  Grading exposes the editable Total Point Values field."
- "Default point value and Step grading remain visible but read-only until
  Customize Grading is enabled."

## Verification

- `./bin/project test --profile unit` — 2789 pass
- `./bin/project test --profile typecheck` — pass
- `./bin/project test --profile qa-smoke` — 117 pass
