# Essay Grading System - Developer Handoff Documentation

**Branch:** `claude/essay-grading-tool-dsYol`
**Status:** Backend Complete, UI Components Pending
**Created:** December 2024

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [What Was Built](#what-was-built)
3. [Architecture & Design Decisions](#architecture--design-decisions)
4. [Database Schema](#database-schema)
5. [API Endpoints](#api-endpoints)
6. [Frontend Integration](#frontend-integration)
7. [What Still Needs to Be Built](#what-still-needs-to-be-built)
8. [Step-by-Step Implementation Guide](#step-by-step-implementation-guide)
9. [Testing Checklist](#testing-checklist)
10. [Deployment Notes](#deployment-notes)

---

## 🎯 Overview

This PR implements an **AI-powered essay grading system** that allows teachers to grade student essays using a rubric-based approach with interactive, color-coded highlights and Socratic feedback.

### Key Features

- **5-Category Rubric:** Thesis, Organization, Evidence, Voice, Grammar
- **AI-Generated Feedback:** Uses Claude to provide Socratic, thought-provoking feedback
- **Interactive Highlights:** Color-coded highlights in the essay that show specific feedback on click
- **Flexible Grading:** Teachers can grade selected categories (not required to grade all 5)
- **Self-Assessment:** Students can grade their own work using the same system
- **Multiple Grades:** One essay can have both teacher and student grades

### User Flow

1. Teacher opens a student's document
2. Clicks "Grade Essay" button
3. **Step 1:** Selects which rubric categories to grade (or "Use Full Rubric")
4. **Step 2:** AI generates suggested scores and feedback for selected categories
5. Teacher can edit AI suggestions before saving
6. On save, highlights are applied to the essay
7. Student (and teacher) can view the graded essay with interactive highlights

---

## ✅ What Was Built

### 1. Database Schema (Prisma)

**Location:** `/packages/prisma/schema.prisma`

Three new models added:

```prisma
model EssayGrade {
  id              String               @id @default(cuid())
  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @default(now())
  documentId      String
  graderProfileId String
  graderType      String               // "teacher" or "student"
  essayHtml       String               // Snapshot of essay at grading time
  essayText       String               // Plain text version
  overallFeedback String?              // General comments
  categoryScores  EssayCategoryScore[]
  highlights      EssayHighlight[]
  // ... relations
}

model EssayCategoryScore {
  id           String     @id @default(cuid())
  essayGradeId String
  category     String     // "thesis", "organization", "evidence", "voice", "grammar"
  score        Int        // 1-4 scale
  feedback     String     // Category-specific feedback
  // ... relations
}

model EssayHighlight {
  id           String     @id @default(cuid())
  essayGradeId String
  highlightId  String     // UUID for TipTap mark
  category     String     // Same categories as above
  content      String     // The highlighted text
  feedback     String     // Specific feedback for this highlight
  position     Int        // Sort order in document
  // ... relations
}
```

**Relations added:**
- `Document.essayGrades` (one-to-many)
- `Profile.gradesGiven` (one-to-many, named relation)

### 2. API Endpoints

#### **POST /api/domain/grade-essay**
Generate AI-powered grading feedback.

**Location:** `/services/web-app/app/routes/api.domain.grade-essay/route.ts`

**Request:**
```typescript
{
  documentId: string
  essayText: string
  essayHtml: string
  categories: Array<'thesis' | 'organization' | 'evidence' | 'voice' | 'grammar'>
  graderType?: 'teacher' | 'student'
}
```

**Response:**
```typescript
{
  categoryFeedback: {
    thesis?: {
      score: 1-4
      feedback: string
      highlights: Array<{text: string, feedback: string}>
    }
    // ... other selected categories
  }
  overallFeedback: string
}
```

**Features:**
- Uses Claude API with Socratic teaching prompts
- Only generates feedback for selected categories
- Returns structured JSON with scores and highlights
- Validates permissions (teacher or document owner only)

---

#### **POST /api/model/essay-grade**
Create a new essay grade.

**Location:** `/services/web-app/app/routes/api.model.essay-grade/route.ts`

**Request:**
```typescript
{
  documentId: string
  graderType: 'teacher' | 'student'
  essayHtml: string
  essayText: string
  categoryScores: Array<{
    category: string
    score: number
    feedback: string
  }>
  highlights: Array<{
    highlightId: string
    category: string
    content: string
    feedback: string
    position: number
  }>
  overallFeedback?: string
}
```

**Response:** Full EssayGrade object with relations

**Features:**
- Creates grade with all related scores and highlights in single transaction
- Validates permissions (teachers for teacher grades, students for self-assessment)
- Returns complete grade with grader profile info

---

#### **GET /api/model/essay-grade/:id**
Fetch a specific grade.

**Location:** `/services/web-app/app/routes/api.model.essay-grade.$id/route.ts`

**Response:** Full grade with all category scores, highlights, and grader info

**Permissions:** Grader, document owner, or teacher of student can view

---

#### **PUT /api/model/essay-grade/:id**
Update an existing grade.

**Request:** Same as create (partial update supported)

**Permissions:** Only the grader who created it can update

---

#### **DELETE /api/model/essay-grade/:id**
Delete a grade.

**Permissions:** Only the grader who created it can delete

---

### 3. Rubric Configuration

**Location:** `/services/web-app/app/utils/essay-grading/rubric-categories.ts`

Defines the 5 rubric categories with associated colors:

```typescript
export const RUBRIC_CATEGORIES = {
  thesis: {
    label: 'Thesis and Content',
    color: 'blue',
    bgClass: 'bg-blue-100',
    borderClass: 'border-blue-400',
    description: 'Clear argument, main idea, and relevance of content'
  },
  organization: {
    label: 'Organization and Structure',
    color: 'purple',
    bgClass: 'bg-purple-100',
    borderClass: 'border-purple-400',
    description: 'Introduction, body, conclusion flow, and transitions'
  },
  evidence: {
    label: 'Evidence and Support',
    color: 'green',
    bgClass: 'bg-green-100',
    borderClass: 'border-green-400',
    description: 'Use of examples, quotes, reasoning, and analysis'
  },
  voice: {
    label: 'Voice and Style',
    color: 'orange',
    bgClass: 'bg-orange-100',
    borderClass: 'border-orange-400',
    description: 'Appropriate tone, word choice, and sentence variety'
  },
  grammar: {
    label: 'Grammar and Mechanics',
    color: 'red',
    bgClass: 'bg-red-100',
    borderClass: 'border-red-400',
    description: 'Sentence structure, punctuation, and spelling'
  }
}

// Helper functions
export function calculateOverallScore(scores: Array<{score: number}>): number
export function getScoreLabel(score: number): string // Returns "Needs Improvement", "Developing", "Proficient", or "Exemplary"
```

**Category Order:** Always display in this order: Thesis → Organization → Evidence → Voice → Grammar

---

### 4. AI Prompt System

**Location:** `/services/web-app/app/utils/essay-grading/ai-prompts.ts`

**Key Functions:**

```typescript
// The system prompt used for Claude API
export const GRADING_SYSTEM_PROMPT: string

// Builds the user prompt with essay text and selected categories
export function buildGradingPrompt(essayText: string, categories: RubricCategoryId[]): string

// Parses AI response JSON
export function parseAIGradingResponse(responseText: string): AIGradingResponse
```

**Socratic Approach:**
The AI is instructed to use a Socratic teaching method:
- Ask questions that guide students to discover improvements
- Encourage critical thinking about writing choices
- Examples:
  - ✅ "How might breaking this sentence into two improve clarity?"
  - ❌ "This sentence is too long"

---

### 5. Highlight Text Matching

**Location:** `/services/web-app/app/utils/essay-grading/highlight-generator.ts`

**Key Functions:**

```typescript
// Find a text snippet in the essay (uses fuzzy matching)
export function findTextPosition(essayText: string, snippetText: string): TextPosition | null

// Convert AI highlights to database format with positions
export function generateHighlights(
  essayText: string,
  aiHighlights: AIHighlight[],
  category: RubricCategoryId,
  gradeId: string
): Highlight[]

// Generate all highlights from AI response
export function generateAllHighlights(
  essayText: string,
  aiResponse: Record<string, {...}>,
  gradeId: string
): Highlight[]
```

**How it works:**
1. AI returns exact quotes from essay
2. `findTextPosition` uses exact matching first, then normalized (lowercase, collapsed whitespace) matching
3. Returns start/end positions in the original text
4. If text can't be found, logs warning and skips that highlight

---

### 6. Zod Schemas

**Location:** `/services/web-app/app/utils/schemas/essay-grade.ts`

All validation schemas for forms and API requests:

```typescript
export const RubricSelectionSchema          // Step 1 form
export const GenerateGradingFeedbackSchema  // AI feedback request
export const CreateEssayGradeSchema         // Create grade request
export const UpdateEssayGradeSchema         // Update grade request
export const AIGradingResponseSchema        // Validates AI response structure
```

Usage with RVF:
```typescript
import { parseFormData, validationError } from '@rvf/react-router';
import { CreateEssayGradeSchema } from '~/utils/schemas/essay-grade';

const { error, data } = await parseFormData(request, CreateEssayGradeSchema);
if (error) return validationError(error);
```

---

### 7. TipTap Extensions

**Location:** `/services/web-app/app/routes/app_.documents_.$id/editor/extensions/essay-highlight.ts`

**EssayHighlight Mark:**
Custom TipTap mark that adds color-coded highlights to essay text.

**Attributes:**
- `highlightId` - UUID for this highlight
- `category` - Which rubric category (determines color)
- `gradeId` - Which grade this highlight belongs to

**Commands:**
```typescript
editor.commands.setEssayHighlight(highlightId, category, gradeId)
editor.commands.unsetEssayHighlight()
editor.commands.removeHighlight(highlightId)
```

**EssayHighlightExtension Plugin:**
ProseMirror plugin that handles interactions:

**Events dispatched:**
- `essay-highlight-hover` - On mouseover
- `essay-highlight-unhover` - On mouseout
- `essay-highlight-click` - On click

**Event detail format:**
```typescript
{
  highlightId: string
  category: string
  gradeId: string
}
```

**Integration:**
Already added to `/services/web-app/app/routes/app_.documents_.$id/editor/index.tsx`

---

### 8. CSS Styling

**Location:** `/services/web-app/app/app.css`

Added styles:
```css
.essay-highlight {
  position: relative;
  transition: all 0.2s ease;
}

.essay-highlight:hover {
  filter: brightness(0.9);
}

.essay-highlight.focused {
  filter: brightness(0.85);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
```

**Note:** Category-specific colors are applied via Tailwind classes from `RUBRIC_CATEGORIES` (e.g., `bg-blue-100`, `border-blue-400`)

---

## 🏗️ Architecture & Design Decisions

### Why Store Essay Snapshots?

**Problem:** Student might edit essay after it's graded, breaking highlight positions.

**Solution:** Store `essayHtml` and `essayText` with each grade.

**Benefits:**
- Highlights always align with the text that was graded
- Can show "before/after" comparison
- Grading history is preserved even if essay changes

### Why Separate EssayCategoryScore and EssayHighlight?

**Design:**
- **EssayCategoryScore:** Overall category-level feedback and score
- **EssayHighlight:** Specific in-text feedback

**Reasoning:**
- One category can have multiple highlights (3-5 per category)
- Category score/feedback is shown in summary view
- Highlights are shown inline when viewing the essay
- Clean separation of concerns

### Why Custom TipTap Extension Instead of Using Existing Comment System?

**Differences:**
- Comments are user-created, highlights are system-generated
- Highlights are category-specific (need different colors)
- Multiple grades can have overlapping highlights on same text
- Highlights are read-only (can't be edited inline)
- Different interaction patterns (click to see feedback panel vs inline editing)

### Permission Model

**Who can create grades:**
- **Teacher grade:** Teacher must be associated with student's class
- **Student grade:** Student must own the document

**Who can view grades:**
- Grader who created it
- Document owner (student)
- Teachers of the student

**Who can edit/delete:**
- Only the grader who created it

---

## 💾 Database Schema

### Running the Migration

**IMPORTANT:** The migration hasn't been run yet! You need to:

```bash
cd /home/user/yawp-2.0/packages/prisma
bun prisma migrate dev --name add_essay_grading
```

This will:
1. Create the three new tables
2. Add relations to existing `Document` and `Profile` tables
3. Create indexes for performance

### Schema Diagram

```
Document (existing)
  └── essayGrades (1:many) → EssayGrade
                                ├── categoryScores (1:many) → EssayCategoryScore
                                └── highlights (1:many) → EssayHighlight

Profile (existing)
  └── gradesGiven (1:many) → EssayGrade
```

### Sample Queries

**Get all grades for a document:**
```typescript
const grades = await prisma.essayGrade.findMany({
  where: { documentId },
  include: {
    categoryScores: { orderBy: { category: 'asc' } },
    highlights: { orderBy: { position: 'asc' } },
    graderProfile: {
      include: { user: { select: { name: true } } }
    }
  },
  orderBy: { createdAt: 'desc' }
});
```

**Get a specific grade:**
```typescript
const grade = await prisma.essayGrade.findUnique({
  where: { id: gradeId },
  include: {
    categoryScores: true,
    highlights: true,
    graderProfile: { include: { user: true } }
  }
});
```

---

## 🚧 What Still Needs to Be Built

### Priority 1: Grading Dialog (Critical Path)

**File to create:** `/services/web-app/app/routes/app_.documents_.$id/grading/grading-dialog.tsx`

**Purpose:** Two-step modal for grading essays

**Tech stack:**
- Use existing `Dialog` component from `/components/ui/dialog.tsx`
- RVF for form handling
- React state for step management

**Steps:**
1. **Step 1: Rubric Selection**
   - Checkboxes for each of 5 categories
   - "Use Full Rubric" checkbox (selects all)
   - Validation: At least 1 category required
   - "Next" button

2. **Step 2: Scoring & Feedback**
   - Call `/api/domain/grade-essay` on mount to get AI suggestions
   - Show loading spinner while AI generates
   - For each selected category:
     - Score selector (1-4 radio buttons)
     - Feedback textarea (pre-filled with AI suggestion, editable)
   - Overall feedback textarea
   - "Save Grade" button
   - "Back" button to return to step 1

**State management:**
```typescript
const [step, setStep] = useState(1)
const [selectedCategories, setSelectedCategories] = useState<RubricCategoryId[]>([])
const [aiFeedback, setAiFeedback] = useState<AIGradingResponse | null>(null)
const [isGenerating, setIsGenerating] = useState(false)
```

---

### Priority 2: UI Integration Points

#### A. "Grade Essay" Button

**File to modify:** `/services/web-app/app/routes/app_.documents_.$id/route.tsx`

**Where:** Add button to navbar (near existing buttons)

**Visibility:** Only show if:
- Current user is a teacher
- Viewing a student's document
- `isViewingAsTeacher === true` (this check already exists around line 171)

**Example:**
```tsx
{isViewingAsTeacher && (
  <Button onClick={() => setGradingDialogOpen(true)}>
    <GraduationCap className="mr-2 h-4 w-4" />
    Grade Essay
  </Button>
)}
```

#### B. Grade Badge on Document List

**File to modify:** `/services/web-app/app/routes/app.students.$studentId/route.tsx` (or wherever documents are listed)

**Purpose:** Show visual indicator if essay has been graded

**Example:**
```tsx
{document.essayGrades && document.essayGrades.length > 0 && (
  <Badge variant="success">Graded</Badge>
)}
```

**Note:** You'll need to include `essayGrades` in the document query:
```typescript
documents: {
  include: {
    essayGrades: {
      select: { id: true, graderType: true },
      orderBy: { createdAt: 'desc' }
    }
  }
}
```

---

### Priority 3: Viewing Graded Essays

#### A. Graded Essay View Component

**File to create:** `/services/web-app/app/routes/app_.documents_.$id/grading/graded-view.tsx`

**Purpose:** Display a completed grade with scores and interactive highlights

**Features:**
- Show grade metadata (grader name, date, type)
- Display category scores in rubric order
- Show overall score (calculated average)
- Load graded essay snapshot with highlights applied
- Link to feedback panel

**Layout:**
```
┌─────────────────────────────────┐
│ Graded by: Ms. Smith            │
│ Date: Dec 20, 2024              │
│ Type: Teacher Grade             │
├─────────────────────────────────┤
│ Overall Score: 3.2 (Proficient) │
├─────────────────────────────────┤
│ Thesis: 3/4 (Proficient)        │
│ Organization: 4/4 (Exemplary)   │
│ Evidence: 3/4 (Proficient)      │
│ Voice: 3/4 (Proficient)         │
│ Grammar: 3/4 (Proficient)       │
├─────────────────────────────────┤
│ Overall Feedback:                │
│ "Great work! Your thesis is..."  │
└─────────────────────────────────┘

[Essay with colored highlights below]
```

**Applying highlights to editor:**
```typescript
// For each highlight in the grade
grade.highlights.forEach(highlight => {
  editor.commands.setEssayHighlight(
    highlight.highlightId,
    highlight.category,
    grade.id
  );
});
```

**Challenge:** Finding text positions in TipTap
- Option 1: Store character positions, use `editor.state.doc.resolve(pos)`
- Option 2: Use TipTap's search functionality
- Option 3: Load the graded `essayHtml` directly (simplest)

**Recommended:** Load the graded `essayHtml` snapshot directly and apply marks programmatically.

#### B. Highlight Feedback Panel

**File to create:** `/services/web-app/app/routes/app_.documents_.$id/grading/highlight-feedback-panel.tsx`

**Purpose:** Show feedback when user clicks a highlight

**Location:** Below the editor (similar to comments panel)

**Features:**
- Listen for `essay-highlight-click` events
- Fetch highlight data for clicked `highlightId`
- Display:
  - Category badge (with category color)
  - Quoted text that was highlighted
  - Specific feedback for this highlight
- "X" button to close
- Instruction text when no highlight selected: "Click a highlighted section to see feedback"

**Example:**
```tsx
const [activeHighlight, setActiveHighlight] = useState<EssayHighlight | null>(null);

useEffect(() => {
  const handleClick = (e: Event) => {
    const { highlightId } = (e as CustomEvent).detail;
    const highlight = grade.highlights.find(h => h.highlightId === highlightId);
    setActiveHighlight(highlight || null);
  };

  window.addEventListener('essay-highlight-click', handleClick);
  return () => window.removeEventListener('essay-highlight-click', handleClick);
}, [grade]);

return (
  <div className="border-t p-4">
    {activeHighlight ? (
      <>
        <Badge className={RUBRIC_CATEGORIES[activeHighlight.category].bgClass}>
          {RUBRIC_CATEGORIES[activeHighlight.category].label}
        </Badge>
        <blockquote className="my-2 border-l-4 pl-4 italic">
          "{activeHighlight.content}"
        </blockquote>
        <p>{activeHighlight.feedback}</p>
      </>
    ) : (
      <p className="text-muted-foreground">
        Click a highlighted section to see feedback
      </p>
    )}
  </div>
);
```

---

## 📝 Step-by-Step Implementation Guide

### Step 1: Run Database Migration

```bash
cd /home/user/yawp-2.0/packages/prisma
bun prisma migrate dev --name add_essay_grading
bun prisma generate
```

Verify tables were created:
```bash
bun prisma studio
```

### Step 2: Test API Endpoints

Create a simple test file or use an API client (Postman, Bruno, etc.):

**Test AI feedback generation:**
```bash
curl -X POST http://localhost:3000/api/domain/grade-essay \
  -H "Content-Type: application/json" \
  -H "Cookie: your-session-cookie" \
  -d '{
    "documentId": "some-doc-id",
    "essayText": "This is a sample essay...",
    "essayHtml": "<p>This is a sample essay...</p>",
    "categories": ["thesis", "organization"]
  }'
```

Expected response: JSON with category scores and highlights

**Test grade creation:**
```bash
curl -X POST http://localhost:3000/api/model/essay-grade \
  -H "Content-Type: application/json" \
  -H "Cookie: your-session-cookie" \
  -d '{
    "documentId": "...",
    "graderType": "teacher",
    "essayHtml": "...",
    "essayText": "...",
    "categoryScores": [...],
    "highlights": [...]
  }'
```

### Step 3: Build Step 1 - Rubric Selection

**Create:** `/services/web-app/app/routes/app_.documents_.$id/grading/step-1-rubric-selection.tsx`

**Pattern to follow:** Look at existing form components in the codebase

**Key imports:**
```typescript
import { useForm } from '@rvf/react-router';
import { FormCheckbox } from '~/components/rvf-forms/form-checkbox';
import { RubricSelectionSchema } from '~/utils/schemas/essay-grade';
import { RUBRIC_CATEGORIES, RUBRIC_CATEGORY_IDS } from '~/utils/essay-grading/rubric-categories';
```

**Form structure:**
```tsx
export function Step1RubricSelection({ onNext }: { onNext: (categories: string[]) => void }) {
  const form = useForm({
    schema: RubricSelectionSchema,
    defaultValues: {},
    onSubmit: (data) => {
      const selected = RUBRIC_CATEGORY_IDS.filter(cat => data[cat] === 'on');
      if (data.useFullRubric === 'on') {
        onNext(RUBRIC_CATEGORY_IDS);
      } else {
        onNext(selected);
      }
    }
  });

  return (
    <form {...form.getFormProps()}>
      <div className="space-y-4">
        {RUBRIC_CATEGORY_IDS.map(categoryId => (
          <FormCheckbox
            key={categoryId}
            scope={form.scope(categoryId)}
            label={RUBRIC_CATEGORIES[categoryId].label}
            description={RUBRIC_CATEGORIES[categoryId].description}
          />
        ))}

        <Separator />

        <FormCheckbox
          scope={form.scope('useFullRubric')}
          label="Use Full Rubric"
          description="Select all categories"
        />
      </div>

      <Button type="submit" className="mt-4">
        Next
      </Button>
    </form>
  );
}
```

### Step 4: Build Step 2 - Scoring Interface

**Create:** `/services/web-app/app/routes/app_.documents_.$id/grading/step-2-scoring.tsx`

**Key features:**
- Fetch AI feedback on component mount
- Show loading state while generating
- Display editable forms for each selected category

**Pattern:**
```tsx
export function Step2Scoring({
  documentId,
  essayText,
  essayHtml,
  categories,
  onBack,
  onSave
}: Step2Props) {
  const [aiFeedback, setAiFeedback] = useState<AIGradingResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function generateFeedback() {
      setIsLoading(true);
      try {
        const response = await fetch('/api/domain/grade-essay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentId,
            essayText,
            essayHtml,
            categories
          })
        });

        if (!response.ok) throw new Error('Failed to generate feedback');

        const data = await response.json();
        setAiFeedback(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }

    generateFeedback();
  }, [documentId, essayText, essayHtml, categories]);

  if (isLoading) {
    return <div>Generating AI feedback... <Spinner /></div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  // Render scoring form with AI suggestions pre-filled
  return (
    <div>
      {categories.map(category => (
        <CategoryScoreInput
          key={category}
          category={category}
          defaultScore={aiFeedback?.categoryFeedback[category]?.score}
          defaultFeedback={aiFeedback?.categoryFeedback[category]?.feedback}
        />
      ))}

      <Textarea
        label="Overall Feedback"
        defaultValue={aiFeedback?.overallFeedback}
      />

      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button onClick={handleSave}>Save Grade</Button>
      </div>
    </div>
  );
}
```

**Save handler:**
```typescript
async function handleSave() {
  // 1. Collect form data (scores, feedback)
  // 2. Generate highlights from AI response
  const highlights = generateAllHighlights(
    essayText,
    aiFeedback.categoryFeedback,
    'temp-grade-id' // Will be replaced by server
  );

  // 3. Call API to save grade
  const response = await fetch('/api/model/essay-grade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      documentId,
      graderType: 'teacher',
      essayHtml,
      essayText,
      categoryScores,
      highlights,
      overallFeedback
    })
  });

  const grade = await response.json();

  // 4. Apply highlights to editor
  // (You'll need to pass editor instance or use a callback)
  onSave(grade);
}
```

### Step 5: Create Main Grading Dialog

**Create:** `/services/web-app/app/routes/app_.documents_.$id/grading/grading-dialog.tsx`

**Combines Step 1 and Step 2:**
```tsx
export function GradingDialog({
  open,
  onOpenChange,
  documentId,
  essayText,
  essayHtml,
  onGradeCreated
}: GradingDialogProps) {
  const [step, setStep] = useState(1);
  const [selectedCategories, setSelectedCategories] = useState<RubricCategoryId[]>([]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Grade Essay</DialogTitle>
          <DialogDescription>
            {step === 1 ? 'Select rubric categories to grade' : 'Review and adjust AI-generated feedback'}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <Step1RubricSelection
            onNext={(categories) => {
              setSelectedCategories(categories);
              setStep(2);
            }}
          />
        )}

        {step === 2 && (
          <Step2Scoring
            documentId={documentId}
            essayText={essayText}
            essayHtml={essayHtml}
            categories={selectedCategories}
            onBack={() => setStep(1)}
            onSave={(grade) => {
              onGradeCreated(grade);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
```

### Step 6: Add "Grade Essay" Button

**Modify:** `/services/web-app/app/routes/app_.documents_.$id/route.tsx`

**Add state:**
```tsx
const [gradingDialogOpen, setGradingDialogOpen] = useState(false);
```

**Add button to navbar:**
```tsx
{isViewingAsTeacher && (
  <Button onClick={() => setGradingDialogOpen(true)}>
    Grade Essay
  </Button>
)}
```

**Add dialog:**
```tsx
<GradingDialog
  open={gradingDialogOpen}
  onOpenChange={setGradingDialogOpen}
  documentId={document.id}
  essayText={document.text || ''}
  essayHtml={document.html || ''}
  onGradeCreated={(grade) => {
    // Refresh page or update state
    // Consider using React Router's revalidate
  }}
/>
```

### Step 7: Build Graded Essay View

**Create:** `/services/web-app/app/routes/app_.documents_.$id/grading/graded-view.tsx`

**Show grade selector if multiple grades:**
```tsx
{document.essayGrades.length > 1 && (
  <Select value={selectedGradeId} onValueChange={setSelectedGradeId}>
    {document.essayGrades.map(grade => (
      <SelectItem key={grade.id} value={grade.id}>
        {grade.graderType === 'teacher' ? 'Teacher Grade' : 'Self-Assessment'}
        {' - '}
        {formatDate(grade.createdAt)}
      </SelectItem>
    ))}
  </Select>
)}
```

**Display scores:**
```tsx
const selectedGrade = document.essayGrades.find(g => g.id === selectedGradeId);

<div className="space-y-2">
  <div className="text-lg font-semibold">
    Overall Score: {calculateOverallScore(selectedGrade.categoryScores)} / 4
  </div>

  {selectedGrade.categoryScores.map(score => (
    <div key={score.category} className="flex items-center gap-2">
      <Badge className={RUBRIC_CATEGORIES[score.category].bgClass}>
        {RUBRIC_CATEGORIES[score.category].label}
      </Badge>
      <span>{score.score}/4</span>
      <span className="text-muted-foreground">
        ({getScoreLabel(score.score)})
      </span>
    </div>
  ))}
</div>
```

**Apply highlights to editor:**

You'll need to modify the editor to accept and display existing highlights. This is the trickiest part.

**Option 1: Modify HTML before loading**
```typescript
// Before passing essayHtml to editor, inject highlight marks
function injectHighlights(html: string, highlights: EssayHighlight[]): string {
  // Parse HTML, find positions, wrap text in <span> tags with data attributes
  // This is complex - consider using a library like `cheerio` or `jsdom`
}
```

**Option 2: Use TipTap commands after editor loads**
```typescript
useEffect(() => {
  if (!editor || !selectedGrade) return;

  selectedGrade.highlights.forEach(highlight => {
    // Find text position in editor
    const pos = findTextInEditor(editor, highlight.content);
    if (pos) {
      editor.commands.setEssayHighlight(
        highlight.highlightId,
        highlight.category,
        selectedGrade.id
      );
    }
  });
}, [editor, selectedGrade]);
```

**Recommendation:** Option 2 is cleaner but requires a robust text search. Option 1 is more reliable but more complex.

### Step 8: Build Highlight Feedback Panel

See detailed example in "Priority 3: Viewing Graded Essays" section above.

### Step 9: Add Grade Badge to Document List

**Modify:** Where documents are listed (likely in student view or teacher's student list)

**In loader, include grades:**
```typescript
const documents = await prisma.document.findMany({
  where: { profileId: studentProfileId },
  include: {
    essayGrades: {
      select: { id: true, graderType: true },
      take: 1,
      orderBy: { createdAt: 'desc' }
    }
  }
});
```

**In UI:**
```tsx
{document.essayGrades && document.essayGrades.length > 0 && (
  <Badge variant="success">
    <Check className="mr-1 h-3 w-3" />
    Graded
  </Badge>
)}
```

---

## ✅ Testing Checklist

### Unit Tests

- [ ] API endpoint permission checks
- [ ] Zod schema validation
- [ ] Highlight text matching (fuzzy matching edge cases)
- [ ] Score calculation (overall average)
- [ ] AI prompt parsing (malformed JSON handling)

### Integration Tests

- [ ] Full grading workflow (API calls in sequence)
- [ ] Multiple grades on same document
- [ ] Teacher grade vs student self-assessment
- [ ] Highlight application to editor
- [ ] Grade update/delete operations

### E2E Tests (Playwright recommended)

- [ ] Teacher can grade student essay
- [ ] Step 1: Category selection validates
- [ ] Step 2: AI generates feedback
- [ ] Step 2: Teacher can edit AI suggestions
- [ ] Save creates grade in database
- [ ] Highlights appear in editor
- [ ] Click highlight shows feedback panel
- [ ] Student can view graded essay
- [ ] Student can create self-assessment
- [ ] Multiple grades display correctly
- [ ] Permissions enforce correctly (student can't grade other students)

### Manual Testing

- [ ] Mobile: Touch interaction with highlights
- [ ] Mobile: Dialog is responsive
- [ ] Long essays: Performance with many highlights
- [ ] Edge case: Empty essay
- [ ] Edge case: Essay with special characters
- [ ] Edge case: Very long essay (>10,000 words)
- [ ] AI failure: Graceful error handling
- [ ] Network failure: Retry logic

---

## 🚀 Deployment Notes

### Pre-Deployment Checklist

- [ ] Run database migration on production database
- [ ] Set `ANTHROPIC_API_KEY` environment variable
- [ ] Test AI API connection in production environment
- [ ] Run all tests in CI/CD pipeline
- [ ] Code review completed
- [ ] UI components built and tested
- [ ] Performance testing (especially AI API latency)

### Migration Steps

**1. Database Migration (Production)**

```bash
# On production server or via remote migration script
cd /home/user/yawp-2.0/packages/prisma
bun prisma migrate deploy
```

**2. Environment Variables**

Ensure these are set in production:
```env
ANTHROPIC_API_KEY=sk-ant-xxx
AI_MODEL=claude-3-5-sonnet-20240620
```

**3. Monitor AI API Usage**

- Claude API has rate limits and costs per token
- Monitor usage in Anthropic dashboard
- Consider implementing request throttling if needed
- Average essay grading uses ~2000-4000 tokens

**4. Feature Flag (Optional)**

Consider adding a feature flag to gradually roll out:

```typescript
// In settings table or environment variable
const ESSAY_GRADING_ENABLED = process.env.ESSAY_GRADING_ENABLED === 'true';

// In UI
{ESSAY_GRADING_ENABLED && isViewingAsTeacher && (
  <Button>Grade Essay</Button>
)}
```

### Rollback Plan

If issues arise post-deployment:

**1. Disable UI (fastest)**
```typescript
// Set environment variable
ESSAY_GRADING_ENABLED=false
```

**2. Rollback database migration**
```bash
bun prisma migrate rollback
```

**Note:** Rollback will delete all grading data! Only do this if absolutely necessary.

**3. Rollback code**
```bash
git revert <commit-hash>
git push
```

---

## 📞 Questions & Support

### Common Issues

**Q: AI API returns invalid JSON**
- Check the prompt in `ai-prompts.ts`
- Validate AI response structure before parsing
- Log raw response for debugging

**Q: Highlights don't appear in editor**
- Verify `EssayHighlight` extension is in editor's extensions array
- Check browser console for TipTap errors
- Ensure CSS classes are being applied

**Q: Text matching fails**
- AI might not quote text exactly
- Increase fuzzy matching tolerance
- Log failed matches for debugging

**Q: Permission errors**
- Verify teacher-student relationship in database
- Check profile associations
- Ensure session is valid

### Contact

For questions about this implementation, contact:
- Original developer: [Your contact info]
- Project repository: https://github.com/The-Connell-School/yawp-2.0
- Branch: `claude/essay-grading-tool-dsYol`

---

## 📚 Additional Resources

- **React Router v7 Docs:** https://reactrouter.com/
- **TipTap Docs:** https://tiptap.dev/
- **RVF (React Validation Forms):** https://www.rvf-js.io/
- **Prisma Docs:** https://www.prisma.io/docs
- **Anthropic Claude API:** https://docs.anthropic.com/

---

**Last Updated:** December 20, 2024
**Status:** Backend Complete, UI Pending
**Estimated Time to Complete UI:** 8-12 hours for experienced React developer
