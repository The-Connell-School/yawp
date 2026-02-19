# Writing Lessons Feature - Implementation Plan

## Overview

A new course called "Quick Writing Lessons" that provides targeted mini-lessons on 10 core writing skills. Students can self-select topics or receive teacher-assigned lessons. AI generates lessons and evaluates practice exercises.

## User Stories

### Students
- Browse all 10 writing topics from a landing page with categories
- Search for topics or ask "What do you need help with?"
- See priority alert when teacher has assigned a lesson
- Complete lessons: read content, do practice exercises
- Get AI feedback on exercises (escalating detail on repeated mistakes)
- Unlimited attempts on exercises

### Teachers (via Teacher's Lounge)
- Generate AI-powered lessons by selecting topic + grade level
- Preview lessons as students would see them
- Edit/customize lessons before saving
- Save lessons to private library
- Assign lessons to classes or specific students with optional due date

---

## Database Schema (Prisma)

Add to `packages/prisma/schema.prisma`:

```prisma
// ============================================
// WRITING LESSONS
// ============================================

model WritingLesson {
  id          String   @id @default(cuid())
  createdAt   DateTime @default(now()) @db.Timestamptz(6)
  updatedAt   DateTime @default(now()) @db.Timestamptz(6)

  // Core content
  topic       WritingLessonTopic
  title       String
  gradeLevel  String   @default("high-school") // "middle-school", "high-school", "college"
  content     String   // Full lesson markdown (hook, rule, examples, tip, exercises)

  // Parsed exercise data for AI evaluation
  exercises   Json     // Array of { prompt: string, instruction: string, expectedFix?: string }

  // Ownership
  teacherProfileId String?
  teacherProfile   TeacherProfile? @relation(fields: [teacherProfileId], references: [id], onDelete: SetNull)
  isTemplate       Boolean @default(false) // System-provided template lessons

  // Relations
  assignments WritingLessonAssignment[]
  sessions    WritingLessonSession[]
}

enum WritingLessonTopic {
  WORDINESS
  TRANSITIONS
  COMMA_OXFORD
  COMMA_SPLICES
  COMMA_INTRODUCTORY
  COMMA_CLAUSES
  PASSIVE_VOICE
  PARALLEL_CONSTRUCTION
  SUBJECT_VERB_AGREEMENT
  PRONOUN_AGREEMENT
}

model WritingLessonAssignment {
  id          String    @id @default(cuid())
  createdAt   DateTime  @default(now()) @db.Timestamptz(6)

  // What's assigned
  lessonId    String
  lesson      WritingLesson @relation(fields: [lessonId], references: [id], onDelete: Cascade)

  // Who assigned it
  teacherProfileId String
  teacherProfile   TeacherProfile @relation(fields: [teacherProfileId], references: [id], onDelete: Cascade)

  // Who it's assigned to (one of these)
  classId           String?
  class             Class?          @relation(fields: [classId], references: [id], onDelete: Cascade)
  studentProfileId  String?
  studentProfile    StudentProfile? @relation(fields: [studentProfileId], references: [id], onDelete: Cascade)

  // Optional due date
  dueAt       DateTime? @db.Timestamptz(6)

  @@index([classId])
  @@index([studentProfileId])
}

model WritingLessonSession {
  id          String   @id @default(cuid())
  createdAt   DateTime @default(now()) @db.Timestamptz(6)
  updatedAt   DateTime @default(now()) @db.Timestamptz(6)
  completedAt DateTime? @db.Timestamptz(6)

  // What lesson
  lessonId    String
  lesson      WritingLesson @relation(fields: [lessonId], references: [id], onDelete: Cascade)

  // Who's doing it
  studentProfileId String
  studentProfile   StudentProfile @relation(fields: [studentProfileId], references: [id], onDelete: Cascade)

  // Optional: personalized with student's own document
  sourceDocumentId String?
  sourceDocument   Document? @relation(fields: [sourceDocumentId], references: [id], onDelete: SetNull)

  // Exercise attempts
  attempts    WritingLessonAttempt[]

  @@unique([lessonId, studentProfileId])
}

model WritingLessonAttempt {
  id          String   @id @default(cuid())
  createdAt   DateTime @default(now()) @db.Timestamptz(6)

  sessionId   String
  session     WritingLessonSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  exerciseIndex Int      // Which exercise (0-indexed)
  response      String   // Student's answer
  isCorrect     Boolean
  feedback      String   // AI-generated feedback
  attemptNumber Int      // 1st, 2nd, 3rd attempt, etc.

  @@index([sessionId, exerciseIndex])
}
```

**Also update existing models:**

```prisma
// Add to TeacherProfile
model TeacherProfile {
  // ... existing fields ...
  writingLessons           WritingLesson[]
  writingLessonAssignments WritingLessonAssignment[]
}

// Add to StudentProfile
model StudentProfile {
  // ... existing fields ...
  writingLessonAssignments WritingLessonAssignment[]
  writingLessonSessions    WritingLessonSession[]
}

// Add to Class
model Class {
  // ... existing fields ...
  writingLessonAssignments WritingLessonAssignment[]
}

// Add to Document
model Document {
  // ... existing fields ...
  writingLessonSessions WritingLessonSession[]
}
```

---

## Routes Structure

### Student Routes

```
app.writing-lessons/
  _index/route.tsx          # Landing page: topics grid, search, assigned alerts
  $lessonId/route.tsx       # View lesson content
  $lessonId.practice/route.tsx  # Practice exercises with AI evaluation
```

### Teacher Routes (Teacher's Lounge)

```
app.teacher-courses.writing-lessons/
  _index/route.tsx          # Lesson library (teacher's saved lessons)
  new/route.tsx             # Generate new lesson (select topic, grade, generate)
  $lessonId/route.tsx       # View/edit lesson
  $lessonId.preview/route.tsx   # Preview as student
  $lessonId.assign/route.tsx    # Assign to class/students
```

### API Routes

```
api.domain.writing-lessons/
  generate/route.tsx        # POST: Generate lesson via Claude
  evaluate/route.tsx        # POST: Evaluate student's exercise answer
```

---

## AI Prompts

### Lesson Generation Prompt

Located in: `services/web-app/app/utils/writing-lessons/generateLesson.server.ts`

```typescript
const LESSON_TOPICS = {
  WORDINESS: {
    name: 'Revising for Wordiness',
    description: 'Cutting clutter, tightening sentences',
  },
  TRANSITIONS: {
    name: 'Transition Sentences',
    description: 'Connecting ideas between paragraphs',
  },
  // ... etc for all 10 topics
};

const SYSTEM_PROMPT = `You are an expert writing tutor for the YAWP! Writing Program...`
// Use the full prompt.md content here
```

### Exercise Evaluation Prompt

```typescript
const EVALUATE_SYSTEM = `You are evaluating a student's practice exercise response.

Topic: {topic}
Exercise: {exercisePrompt}
Instruction: {instruction}
Student's response: {response}
Attempt number: {attemptNumber}

Evaluate if the student correctly applied the writing skill.

Respond with JSON:
{
  "isCorrect": boolean,
  "feedback": "string - encouraging feedback appropriate to attempt number"
}

Feedback guidelines:
- Attempt 1-2 (incorrect): Brief feedback. "Not quite — [specific issue]."
- Attempt 3+ (incorrect): Detailed explanation + hint + encouragement to try again.
- Correct: Simple praise. "Nice work! You [what they did right]."
`;
```

### Personalization (Pull from Student's Document)

When a student has existing documents, optionally include one example from their writing:

```typescript
// In lesson generation, if sourceDocumentId provided:
const doc = await prisma.document.findUnique({ where: { id: sourceDocumentId } });
if (doc?.text) {
  // Add to prompt: "Include one example from the student's own writing: {doc.text}"
}
```

---

## Component Structure

### Student Landing Page (`app.writing-lessons._index`)

```tsx
// Components needed:
- TopicCard: Grid card for each of 10 topics
- AssignmentAlert: Banner showing teacher-assigned lessons
- SearchDialog: "What do you need help with?" dialogue
- TopicGrid: Responsive grid of TopicCards grouped by category

// Categories:
- Punctuation: Oxford comma, Splices, Introductory, Clauses
- Sentence Structure: Wordiness, Passive Voice, Parallel Construction
- Agreement: Subject-Verb, Pronoun
- Flow: Transitions
```

### Lesson View (`app.writing-lessons.$lessonId`)

```tsx
// Render lesson markdown with sections:
- "Why This Matters" (hook)
- "The Rule" (explanation)
- "See It In Action" (examples with before/after)
- "Quick Tip"
- Button: "Start Practice" -> navigates to practice route
```

### Practice Interface (`app.writing-lessons.$lessonId.practice`)

```tsx
// Components:
- ExerciseCard: Shows exercise prompt + instruction + textarea
- FeedbackDisplay: Shows AI feedback after submission
- ProgressIndicator: Shows which exercise (1 of 5), attempts, etc.
- CompletionSummary: Shows when all exercises done

// Flow:
1. Show exercise 1
2. Student types answer, clicks "Check Answer"
3. API call to evaluate
4. Show feedback
5. If correct, show "Next Exercise" button
6. If incorrect, show feedback + "Try Again" button
7. After all exercises, show summary + option to redo or go back
```

### Teacher Lesson Generator (`app.teacher-courses.writing-lessons.new`)

```tsx
// Form:
- TopicSelect: Dropdown of 10 topics
- GradeLevelSelect: Middle school / High school / College
- CustomFocus (optional): Text input for specific angle
- Button: "Generate Lesson"

// After generation:
- LessonPreview: Rendered markdown
- EditableLesson: Markdown editor for customization
- Buttons: "Save to Library" / "Save & Assign"
```

---

## Implementation Order

### Phase 1: Database & Core Infrastructure
1. Add Prisma schema changes
2. Run migration
3. Create AI utility functions (generateLesson, evaluateExercise)
4. Create shared types and constants for topics

### Phase 2: Student Experience
1. Landing page with topic grid
2. Lesson view route
3. Practice interface with AI evaluation
4. Session tracking (progress, attempts)

### Phase 3: Teacher Experience
1. Lesson library page
2. Generate new lesson page
3. Edit/preview functionality
4. Assignment flow (class or student, due date)

### Phase 4: Integration & Polish
1. Assignment alerts on student landing page
2. Personalization from student documents
3. Search/help dialogue
4. Mobile responsiveness

---

## File Checklist

### Database
- [ ] `packages/prisma/schema.prisma` - Add new models
- [ ] Run `bunx prisma migrate dev --name add-writing-lessons`

### Utils (Server)
- [ ] `app/utils/writing-lessons/topics.ts` - Topic definitions
- [ ] `app/utils/writing-lessons/generateLesson.server.ts` - AI generation
- [ ] `app/utils/writing-lessons/evaluateExercise.server.ts` - AI evaluation
- [ ] `app/utils/writing-lessons/parseLesson.ts` - Parse markdown to structured data

### Routes (Student)
- [ ] `app/routes/app.writing-lessons._index/route.tsx`
- [ ] `app/routes/app.writing-lessons.$lessonId/route.tsx`
- [ ] `app/routes/app.writing-lessons.$lessonId.practice/route.tsx`

### Routes (Teacher)
- [ ] `app/routes/app.teacher-courses.writing-lessons._index/route.tsx`
- [ ] `app/routes/app.teacher-courses.writing-lessons.new/route.tsx`
- [ ] `app/routes/app.teacher-courses.writing-lessons.$lessonId/route.tsx`
- [ ] `app/routes/app.teacher-courses.writing-lessons.$lessonId.assign/route.tsx`

### Routes (API)
- [ ] `app/routes/api.domain.writing-lessons.generate/route.tsx`
- [ ] `app/routes/api.domain.writing-lessons.evaluate/route.tsx`

### Components
- [ ] `app/components/writing-lessons/topic-card.tsx`
- [ ] `app/components/writing-lessons/topic-grid.tsx`
- [ ] `app/components/writing-lessons/lesson-content.tsx`
- [ ] `app/components/writing-lessons/exercise-card.tsx`
- [ ] `app/components/writing-lessons/feedback-display.tsx`
- [ ] `app/components/writing-lessons/assignment-alert.tsx`
