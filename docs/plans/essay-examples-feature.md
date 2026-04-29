# Essay Examples Feature

**Status:** Planning  
**Branch:** `claude/add-essay-examples-3eekq`

---

## Purpose

Students need models, not just feedback. The tutor and grading assistant handle "what's wrong with mine" — this feature handles "what does a good one actually look like?" By surfacing real essays from real peers who scored well, students get concrete examples of what they're being asked to produce, written at their level.

---

## V1 Scope

### How it works

1. **Nomination** — When a teacher releases a grade ≥ 90%, a checkbox appears in the release dialog: "Nominate as example essay." Teacher opts in at that moment.
2. **Student consent** — When the student opens their released grade, they see a prompt: "Your teacher nominated this essay as an example for future students." Three options: **Yes / No / Decide later.** They can change their answer at any time from their profile settings.
3. **Display** — Approved essays appear in a static gallery at the bottom of the relevant module page for all students using that module, across all classes. Each example shows only the essay text and the attribution line: **"An [Nth] grade student on YAWP!"**
4. **Upvoting** — Students can upvote each example once. Upvotes sort the gallery (most helpful floats up) but don't affect eligibility.

### Identity

Attribution is grade level only: **"An 11th grade student on YAWP!"**  
No name, no city, no state. This removes PII concerns entirely while still signaling the essay was written by a real peer at a roughly comparable level.

### Scope of examples

Examples are shared across **all classes using the same module** — not limited to the student's own class. This gives a meaningful pool even early on.

### Eligibility threshold

`numericPercentage >= 90` on the Submission record.

---

## Data Model Changes

Add the following fields to the `Submission` model:

```prisma
nominatedForExample    Boolean?   @default(false)
nominatedAt            DateTime?
exampleConsent         String?    // "pending" | "approved" | "declined"
exampleConsentAt       DateTime?
exampleRevokedAt       DateTime?
```

A separate `EssayExampleUpvote` table for upvotes:

```prisma
model EssayExampleUpvote {
  id           String   @id @default(cuid())
  createdAt    DateTime @default(now())
  submissionId String
  profileId    String
  @@unique([submissionId, profileId])
}
```

---

## UX Flow

```
Teacher grades → score >= 90%
  ↓
Teacher clicks "Release Grade"
  → Release dialog shows checkbox: "Nominate as example essay"
  ↓
Student opens released grade
  → Consent prompt appears (Yes / No / Decide later)
  ↓
Student says Yes
  → Essay appears in module gallery for all students on that module
  → Student can revoke anytime from profile settings
```

---

## Legal Flag

> **Needs review before launch:** Students on YAWP! are likely under 18. Even with grade-only attribution and no name, publishing a minor's written work on the platform (even within the platform) may require parental consent depending on jurisdiction and the platform's existing terms of service. Confirm with legal/compliance before the feature goes live. The consent flow already captures the student's own opt-in — the question is whether that's sufficient for minors or whether a parent/guardian approval step is needed.

---

## Future Ideas (Post-V1)

### Enhanced essay display
Show the rubric breakdown alongside the essay — which categories scored high and what the teacher said. Turns a model essay into a teaching tool rather than just an example to admire.

### Teacher visibility
Show teachers a summary: "Emma's essay from your class is being used as an example in 14 classes." Good for morale and relationship with the teacher, zero effort for the student.

### Partial identity option
Offer students the choice of first name + grade level if they want to be credited by name. Keep grade-only as the default.

### Revocation visibility
"My Contributions" section in student profile settings where they can see all their nominated essays and toggle consent on/off.

### Nomination without threshold
Allow teachers to manually nominate essays below 90% if they see something exceptional — e.g., a deeply personal essay that demonstrates voice even if the structure isn't perfect.

### Inline comment view
Optionally surface the teacher's inline comments on the example essay (with teacher approval), showing students not just what a good essay looks like but why it's good at the sentence level.

### Cross-assignment examples
Surface examples from similar assignment types across modules, not just the exact same module — useful for skill-building (e.g., "good hooks from across all thesis-driven essays").

### Peer rating beyond upvoting
Let students mark what they found helpful about an example: "Good hook," "Clear structure," "Strong voice" — structured tags that surface richer signal than a raw upvote count.

---

## Files To Touch (Implementation)

| File | Change |
|------|--------|
| `packages/prisma/schema.prisma` | Add fields to Submission, add EssayExampleUpvote model |
| `services/web-app/app/routes/app_.submissions_.$submissionId/teacher-grading/teacher-grading-panel.tsx` | Nomination checkbox in release flow |
| `services/web-app/app/routes/app_.submissions_.$submissionId/route.tsx` | Student consent prompt on grade reveal |
| `services/web-app/app/routes/app.courses.$id/route.tsx` | Example gallery at bottom of module |
| New: `api.domain.essay-example-consent/route.ts` | Handle consent save/revoke |
| New: `api.domain.essay-example-upvote/route.ts` | Handle upvote toggle |
