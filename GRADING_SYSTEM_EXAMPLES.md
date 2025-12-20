# Essay Grading System - Code Examples

This document provides copy-paste ready code examples for implementing the essay grading UI.

---

## 📋 Table of Contents

1. [API Usage Examples](#api-usage-examples)
2. [Form Components](#form-components)
3. [Grading Dialog](#grading-dialog)
4. [Viewing Grades](#viewing-grades)
5. [Highlight Interactions](#highlight-interactions)
6. [Utility Usage](#utility-usage)

---

## 🔌 API Usage Examples

### Example 1: Generate AI Feedback

```typescript
// In your Step 2 component
async function generateAIFeedback(
  documentId: string,
  essayText: string,
  essayHtml: string,
  categories: RubricCategoryId[]
) {
  try {
    const response = await fetch('/api/domain/grade-essay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId,
        essayText,
        essayHtml,
        categories,
        graderType: 'teacher'
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to generate feedback');
    }

    const data = await response.json();
    return data; // { categoryFeedback: {...}, overallFeedback: "..." }
  } catch (error) {
    console.error('AI feedback error:', error);
    throw error;
  }
}
```

### Example 2: Save Essay Grade

```typescript
import { generateAllHighlights } from '~/utils/essay-grading/highlight-generator';
import { v4 as uuidv4 } from 'uuid';

async function saveEssayGrade(
  documentId: string,
  essayText: string,
  essayHtml: string,
  categoryScores: Array<{ category: string; score: number; feedback: string }>,
  aiFeedback: AIGradingResponse,
  overallFeedback: string
) {
  // Generate highlights from AI response
  const tempGradeId = uuidv4(); // Temporary ID for highlight generation
  const highlights = generateAllHighlights(
    essayText,
    aiFeedback.categories,
    tempGradeId
  );

  try {
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

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to save grade');
    }

    const grade = await response.json();
    return grade;
  } catch (error) {
    console.error('Save grade error:', error);
    throw error;
  }
}
```

### Example 3: Fetch a Grade

```typescript
async function fetchGrade(gradeId: string) {
  try {
    const response = await fetch(`/api/model/essay-grade/${gradeId}`);

    if (!response.ok) {
      throw new Error('Failed to fetch grade');
    }

    const grade = await response.json();
    return grade; // Includes categoryScores, highlights, graderProfile
  } catch (error) {
    console.error('Fetch grade error:', error);
    throw error;
  }
}
```

### Example 4: Update a Grade

```typescript
async function updateGrade(
  gradeId: string,
  categoryScores: Array<{ category: string; score: number; feedback: string }>,
  overallFeedback: string
) {
  try {
    const response = await fetch(`/api/model/essay-grade/${gradeId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categoryScores,
        overallFeedback
      })
    });

    if (!response.ok) {
      throw new Error('Failed to update grade');
    }

    const updatedGrade = await response.json();
    return updatedGrade;
  } catch (error) {
    console.error('Update grade error:', error);
    throw error;
  }
}
```

### Example 5: Delete a Grade

```typescript
async function deleteGrade(gradeId: string) {
  try {
    const response = await fetch(`/api/model/essay-grade/${gradeId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error('Failed to delete grade');
    }

    // Returns 204 No Content on success
    return true;
  } catch (error) {
    console.error('Delete grade error:', error);
    throw error;
  }
}
```

---

## 📝 Form Components

### Step 1: Rubric Selection Component

```typescript
// File: app/routes/app_.documents_.$id/grading/step-1-rubric-selection.tsx

import { useForm } from '@rvf/react-router';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Separator } from '~/components/ui/separator';
import { RubricSelectionSchema } from '~/utils/schemas/essay-grade';
import {
  RUBRIC_CATEGORIES,
  RUBRIC_CATEGORY_IDS,
  type RubricCategoryId
} from '~/utils/essay-grading/rubric-categories';

interface Step1Props {
  onNext: (categories: RubricCategoryId[]) => void;
}

export function Step1RubricSelection({ onNext }: Step1Props) {
  const form = useForm({
    schema: RubricSelectionSchema,
    defaultValues: {},
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const data = Object.fromEntries(formData);

    // Extract selected categories
    const selectedCategories: RubricCategoryId[] = [];

    if (data.useFullRubric === 'on') {
      onNext([...RUBRIC_CATEGORY_IDS]);
      return;
    }

    RUBRIC_CATEGORY_IDS.forEach(categoryId => {
      if (data[categoryId] === 'on') {
        selectedCategories.push(categoryId);
      }
    });

    if (selectedCategories.length === 0) {
      alert('Please select at least one category');
      return;
    }

    onNext(selectedCategories);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Select Rubric Categories</h3>
        <p className="text-sm text-muted-foreground">
          Choose which aspects of the essay you'd like to grade
        </p>

        <div className="space-y-4">
          {RUBRIC_CATEGORY_IDS.map(categoryId => {
            const category = RUBRIC_CATEGORIES[categoryId];
            return (
              <div key={categoryId} className="flex items-start space-x-3">
                <Checkbox
                  id={categoryId}
                  name={categoryId}
                  className="mt-1"
                />
                <div className="flex-1">
                  <label
                    htmlFor={categoryId}
                    className="text-sm font-medium leading-none cursor-pointer"
                  >
                    {category.label}
                  </label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {category.description}
                  </p>
                </div>
                <div className={`w-3 h-3 rounded-full ${category.bgClass} ${category.borderClass} border-2 mt-1`} />
              </div>
            );
          })}
        </div>

        <Separator />

        <div className="flex items-start space-x-3">
          <Checkbox
            id="useFullRubric"
            name="useFullRubric"
            className="mt-1"
          />
          <div className="flex-1">
            <label
              htmlFor="useFullRubric"
              className="text-sm font-medium leading-none cursor-pointer"
            >
              Use Full Rubric
            </label>
            <p className="text-sm text-muted-foreground mt-1">
              Grade all five categories
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit">
          Next: Review AI Feedback
        </Button>
      </div>
    </form>
  );
}
```

### Step 2: Scoring Interface Component

```typescript
// File: app/routes/app_.documents_.$id/grading/step-2-scoring.tsx

import { useState, useEffect } from 'react';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '~/components/ui/radio-group';
import { Label } from '~/components/ui/label';
import { Badge } from '~/components/ui/badge';
import { Loader2 } from 'lucide-react';
import {
  RUBRIC_CATEGORIES,
  SCORE_LABELS,
  type RubricCategoryId
} from '~/utils/essay-grading/rubric-categories';
import type { AIGradingResponse } from '~/utils/schemas/essay-grade';
import { toast } from 'sonner';

interface Step2Props {
  documentId: string;
  essayText: string;
  essayHtml: string;
  categories: RubricCategoryId[];
  onBack: () => void;
  onSave: (grade: any) => void;
}

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
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [scores, setScores] = useState<Record<string, number>>({});
  const [feedbacks, setFeedbacks] = useState<Record<string, string>>({});
  const [overallFeedback, setOverallFeedback] = useState('');

  // Generate AI feedback on mount
  useEffect(() => {
    async function generateFeedback() {
      setIsLoading(true);
      setError(null);

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

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to generate feedback');
        }

        const data = await response.json();
        setAiFeedback(data);

        // Pre-fill form with AI suggestions
        const initialScores: Record<string, number> = {};
        const initialFeedbacks: Record<string, string> = {};

        categories.forEach(category => {
          if (data.categoryFeedback[category]) {
            initialScores[category] = data.categoryFeedback[category].score;
            initialFeedbacks[category] = data.categoryFeedback[category].feedback;
          }
        });

        setScores(initialScores);
        setFeedbacks(initialFeedbacks);
        setOverallFeedback(data.overallFeedback);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        toast.error('Failed to generate AI feedback');
      } finally {
        setIsLoading(false);
      }
    }

    generateFeedback();
  }, [documentId, essayText, essayHtml, categories]);

  const handleSave = async () => {
    setIsSaving(true);

    try {
      // Build category scores array
      const categoryScores = categories.map(category => ({
        category,
        score: scores[category],
        feedback: feedbacks[category]
      }));

      // Generate highlights
      const { generateAllHighlights } = await import('~/utils/essay-grading/highlight-generator');
      const highlights = generateAllHighlights(
        essayText,
        aiFeedback!.categoryFeedback,
        'temp-id'
      );

      // Save grade
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

      if (!response.ok) {
        throw new Error('Failed to save grade');
      }

      const grade = await response.json();
      toast.success('Grade saved successfully!');
      onSave(grade);
    } catch (err) {
      toast.error('Failed to save grade');
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-sm text-muted-foreground">
          Generating AI feedback... This may take a moment.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive mb-4">{error}</p>
        <Button onClick={onBack} variant="outline">
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Review and Adjust Scores</h3>
        <p className="text-sm text-muted-foreground">
          AI has generated suggested scores and feedback. You can edit them before saving.
        </p>
      </div>

      {/* Category Scores */}
      <div className="space-y-6">
        {categories.map(category => {
          const categoryConfig = RUBRIC_CATEGORIES[category];

          return (
            <div key={category} className="space-y-3 p-4 border rounded-lg">
              <div className="flex items-center gap-2">
                <Badge className={categoryConfig.bgClass}>
                  {categoryConfig.label}
                </Badge>
              </div>

              <div className="space-y-2">
                <Label>Score (1-4)</Label>
                <RadioGroup
                  value={scores[category]?.toString()}
                  onValueChange={(value) => setScores({ ...scores, [category]: parseInt(value) })}
                  className="flex gap-4"
                >
                  {[1, 2, 3, 4].map(score => (
                    <div key={score} className="flex items-center space-x-2">
                      <RadioGroupItem value={score.toString()} id={`${category}-${score}`} />
                      <Label htmlFor={`${category}-${score}`} className="font-normal">
                        {score} - {SCORE_LABELS[score as keyof typeof SCORE_LABELS]}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label>Feedback</Label>
                <Textarea
                  value={feedbacks[category] || ''}
                  onChange={(e) => setFeedbacks({ ...feedbacks, [category]: e.target.value })}
                  rows={4}
                  placeholder="Category-specific feedback..."
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Overall Feedback */}
      <div className="space-y-2">
        <Label>Overall Feedback</Label>
        <Textarea
          value={overallFeedback}
          onChange={(e) => setOverallFeedback(e.target.value)}
          rows={4}
          placeholder="General comments about the essay..."
        />
      </div>

      {/* Actions */}
      <div className="flex justify-between">
        <Button onClick={onBack} variant="outline">
          Back
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Grade
        </Button>
      </div>
    </div>
  );
}
```

---

## 💬 Grading Dialog

### Main Dialog Component

```typescript
// File: app/routes/app_.documents_.$id/grading/grading-dialog.tsx

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Step1RubricSelection } from './step-1-rubric-selection';
import { Step2Scoring } from './step-2-scoring';
import type { RubricCategoryId } from '~/utils/essay-grading/rubric-categories';

interface GradingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  essayText: string;
  essayHtml: string;
  onGradeCreated: (grade: any) => void;
}

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

  const handleNext = (categories: RubricCategoryId[]) => {
    setSelectedCategories(categories);
    setStep(2);
  };

  const handleBack = () => {
    setStep(1);
  };

  const handleSave = (grade: any) => {
    onGradeCreated(grade);
    onOpenChange(false);
    // Reset for next use
    setStep(1);
    setSelectedCategories([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Grade Essay</DialogTitle>
          <DialogDescription>
            {step === 1
              ? 'Select which rubric categories you would like to grade'
              : 'Review AI-generated feedback and adjust as needed'}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          {step === 1 && (
            <Step1RubricSelection onNext={handleNext} />
          )}

          {step === 2 && (
            <Step2Scoring
              documentId={documentId}
              essayText={essayText}
              essayHtml={essayHtml}
              categories={selectedCategories}
              onBack={handleBack}
              onSave={handleSave}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

### Integrating into Document Route

```typescript
// File: app/routes/app_.documents_.$id/route.tsx

// Add imports
import { GradingDialog } from './grading/grading-dialog';
import { useState } from 'react';
import { useRevalidator } from 'react-router';

// In component
export default function DocumentRoute() {
  const data = useLoaderData<typeof loader>();
  const [gradingDialogOpen, setGradingDialogOpen] = useState(false);
  const revalidator = useRevalidator();

  // ... existing code ...

  return (
    <>
      {/* Existing navbar */}
      <div className="navbar">
        {/* ... other buttons ... */}

        {/* Add Grade Essay button - only for teachers */}
        {isViewingAsTeacher && (
          <Button onClick={() => setGradingDialogOpen(true)}>
            <GraduationCap className="mr-2 h-4 w-4" />
            Grade Essay
          </Button>
        )}
      </div>

      {/* Existing content */}
      <div className="content">
        {/* ... */}
      </div>

      {/* Add Grading Dialog */}
      <GradingDialog
        open={gradingDialogOpen}
        onOpenChange={setGradingDialogOpen}
        documentId={data.document.id}
        essayText={data.document.text || ''}
        essayHtml={data.document.html || ''}
        onGradeCreated={(grade) => {
          // Revalidate to fetch updated document with grades
          revalidator.revalidate();
        }}
      />
    </>
  );
}
```

---

## 👁️ Viewing Grades

### Graded Essay View Component

```typescript
// File: app/routes/app_.documents_.$id/grading/graded-view.tsx

import { useState } from 'react';
import { Badge } from '~/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import {
  RUBRIC_CATEGORIES,
  calculateOverallScore,
  getScoreLabel
} from '~/utils/essay-grading/rubric-categories';
import { formatDistanceToNow } from 'date-fns';

interface GradedViewProps {
  grades: Array<{
    id: string;
    createdAt: string;
    graderType: string;
    overallFeedback: string | null;
    categoryScores: Array<{
      category: string;
      score: number;
      feedback: string;
    }>;
    graderProfile: {
      user: {
        name: string | null;
      };
    };
  }>;
  onSelectGrade: (gradeId: string) => void;
}

export function GradedView({ grades, onSelectGrade }: GradedViewProps) {
  const [selectedGradeId, setSelectedGradeId] = useState(grades[0]?.id);

  const selectedGrade = grades.find(g => g.id === selectedGradeId);

  if (!selectedGrade) {
    return <div>No grades found</div>;
  }

  const overallScore = calculateOverallScore(selectedGrade.categoryScores);

  return (
    <div className="space-y-6 p-6 border rounded-lg">
      {/* Grade Selector */}
      {grades.length > 1 && (
        <Select
          value={selectedGradeId}
          onValueChange={(value) => {
            setSelectedGradeId(value);
            onSelectGrade(value);
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {grades.map(grade => (
              <SelectItem key={grade.id} value={grade.id}>
                {grade.graderType === 'teacher' ? 'Teacher Grade' : 'Self-Assessment'}
                {' - '}
                {formatDistanceToNow(new Date(grade.createdAt), { addSuffix: true })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Grade Metadata */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Graded by: {selectedGrade.graderProfile.user.name || 'Unknown'}
        </span>
        <span>
          {formatDistanceToNow(new Date(selectedGrade.createdAt), { addSuffix: true })}
        </span>
      </div>

      {/* Overall Score */}
      <div className="text-center py-4 bg-muted/50 rounded-lg">
        <div className="text-3xl font-bold">{overallScore.toFixed(1)}/4</div>
        <div className="text-sm text-muted-foreground mt-1">
          {getScoreLabel(overallScore)}
        </div>
      </div>

      {/* Category Scores */}
      <div className="space-y-3">
        <h4 className="font-semibold">Category Scores</h4>
        {selectedGrade.categoryScores.map(score => {
          const category = RUBRIC_CATEGORIES[score.category as keyof typeof RUBRIC_CATEGORIES];

          return (
            <div key={score.category} className="flex items-center justify-between p-3 border rounded">
              <div className="flex items-center gap-2">
                <Badge className={category.bgClass}>
                  {category.label}
                </Badge>
              </div>
              <div className="text-right">
                <div className="font-semibold">{score.score}/4</div>
                <div className="text-xs text-muted-foreground">
                  {getScoreLabel(score.score)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Overall Feedback */}
      {selectedGrade.overallFeedback && (
        <div className="space-y-2">
          <h4 className="font-semibold">Overall Feedback</h4>
          <p className="text-sm p-4 bg-muted/50 rounded-lg">
            {selectedGrade.overallFeedback}
          </p>
        </div>
      )}
    </div>
  );
}
```

---

## 🎯 Highlight Interactions

### Applying Highlights to Editor

```typescript
// In your graded view component or wherever you display the essay

import { useEffect } from 'react';
import type { Editor } from '@tiptap/react';

function applyHighlightsToEditor(
  editor: Editor | null,
  grade: {
    id: string;
    highlights: Array<{
      highlightId: string;
      category: string;
      content: string;
      position: number;
    }>;
  }
) {
  if (!editor || !grade) return;

  // Clear existing highlights first
  editor.chain().focus().unsetEssayHighlight().run();

  // Apply each highlight
  grade.highlights.forEach(highlight => {
    // Find the text in the editor
    const { state } = editor;
    const { doc } = state;

    // Simple approach: Search for text
    const text = highlight.content;
    let found = false;

    doc.descendants((node, pos) => {
      if (found) return false;
      if (!node.isText) return;

      const index = node.text?.indexOf(text);
      if (index !== undefined && index >= 0) {
        const from = pos + index;
        const to = from + text.length;

        editor
          .chain()
          .setTextSelection({ from, to })
          .setEssayHighlight(highlight.highlightId, highlight.category, grade.id)
          .run();

        found = true;
        return false;
      }
    });
  });
}

// Usage in component
export function GradedEssayEditor({ editor, selectedGrade }: Props) {
  useEffect(() => {
    applyHighlightsToEditor(editor, selectedGrade);
  }, [editor, selectedGrade]);

  return <EditorContent editor={editor} />;
}
```

### Highlight Feedback Panel

```typescript
// File: app/routes/app_.documents_.$id/grading/highlight-feedback-panel.tsx

import { useState, useEffect } from 'react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { X } from 'lucide-react';
import { RUBRIC_CATEGORIES } from '~/utils/essay-grading/rubric-categories';

interface HighlightFeedbackPanelProps {
  grade: {
    highlights: Array<{
      highlightId: string;
      category: string;
      content: string;
      feedback: string;
    }>;
  } | null;
}

export function HighlightFeedbackPanel({ grade }: HighlightFeedbackPanelProps) {
  const [activeHighlight, setActiveHighlight] = useState<{
    highlightId: string;
    category: string;
    content: string;
    feedback: string;
  } | null>(null);

  useEffect(() => {
    const handleClick = (e: Event) => {
      const { highlightId } = (e as CustomEvent).detail;

      if (!grade) return;

      const highlight = grade.highlights.find(h => h.highlightId === highlightId);
      setActiveHighlight(highlight || null);
    };

    window.addEventListener('essay-highlight-click', handleClick as EventListener);

    return () => {
      window.removeEventListener('essay-highlight-click', handleClick as EventListener);
    };
  }, [grade]);

  if (!activeHighlight) {
    return (
      <div className="border-t p-6 text-center text-muted-foreground">
        Click a highlighted section in the essay to see detailed feedback
      </div>
    );
  }

  const categoryConfig = RUBRIC_CATEGORIES[activeHighlight.category as keyof typeof RUBRIC_CATEGORIES];

  return (
    <div className="border-t p-6 space-y-4">
      <div className="flex items-start justify-between">
        <Badge className={categoryConfig.bgClass}>
          {categoryConfig.label}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setActiveHighlight(null)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <blockquote className="border-l-4 pl-4 italic text-muted-foreground" style={{ borderColor: `var(--${categoryConfig.color})` }}>
        "{activeHighlight.content}"
      </blockquote>

      <div className="text-sm">
        <p className="font-semibold mb-2">Feedback:</p>
        <p>{activeHighlight.feedback}</p>
      </div>
    </div>
  );
}
```

---

## 🛠️ Utility Usage

### Calculate Overall Score

```typescript
import { calculateOverallScore, getScoreLabel } from '~/utils/essay-grading/rubric-categories';

const categoryScores = [
  { category: 'thesis', score: 3 },
  { category: 'organization', score: 4 },
  { category: 'evidence', score: 3 }
];

const overallScore = calculateOverallScore(categoryScores);
// Returns: 3.3

const label = getScoreLabel(overallScore);
// Returns: "Proficient"
```

### Generate Highlights from AI Response

```typescript
import { generateAllHighlights } from '~/utils/essay-grading/highlight-generator';

const essayText = "This is the student's essay text...";
const aiFeedback = {
  thesis: {
    score: 3,
    feedback: "Good thesis...",
    highlights: [
      { text: "This is the student's", feedback: "Consider making this more specific" }
    ]
  }
  // ... other categories
};

const highlights = generateAllHighlights(essayText, aiFeedback, gradeId);
// Returns array of Highlight objects with positions
```

### Using Rubric Categories

```typescript
import { RUBRIC_CATEGORIES, RUBRIC_CATEGORY_IDS } from '~/utils/essay-grading/rubric-categories';

// Iterate over all categories in order
RUBRIC_CATEGORY_IDS.forEach(categoryId => {
  const category = RUBRIC_CATEGORIES[categoryId];
  console.log(category.label); // "Thesis and Content"
  console.log(category.bgClass); // "bg-blue-100"
});

// Get specific category
const thesisCategory = RUBRIC_CATEGORIES.thesis;
```

---

## 📊 Loading Grades in Routes

### Document Loader with Grades

```typescript
// In app/routes/app_.documents_.$id/route.tsx

import type { LoaderFunctionArgs } from 'react-router';
import { data } from 'react-router';
import { prisma } from '~/utils/db.server';
import { requireUserId } from '~/utils/auth.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);

  const document = await prisma.document.findUnique({
    where: { id: params.id },
    include: {
      profile: {
        include: {
          user: true,
          studentProfile: true,
          teacherProfile: true
        }
      },
      essayGrades: {
        include: {
          categoryScores: {
            orderBy: { category: 'asc' }
          },
          highlights: {
            orderBy: { position: 'asc' }
          },
          graderProfile: {
            include: {
              user: {
                select: { name: true }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  if (!document) {
    throw new Response('Not Found', { status: 404 });
  }

  return data({ document });
}
```

---

## 🎨 Grade Badge in Lists

```typescript
// In any document list view

import { Badge } from '~/components/ui/badge';
import { Check } from 'lucide-react';

// In the component rendering documents
{documents.map(document => (
  <div key={document.id} className="flex items-center gap-2">
    <span>{document.title}</span>

    {/* Show badge if graded */}
    {document.essayGrades && document.essayGrades.length > 0 && (
      <Badge variant="success" className="text-xs">
        <Check className="mr-1 h-3 w-3" />
        Graded
      </Badge>
    )}
  </div>
))}
```

---

## 🔧 Error Handling Pattern

```typescript
import { toast } from 'sonner';

async function handleAPICall() {
  try {
    const response = await fetch('/api/model/essay-grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Request failed');
    }

    const result = await response.json();
    toast.success('Success!');
    return result;
  } catch (error) {
    console.error('API Error:', error);
    toast.error(error instanceof Error ? error.message : 'An error occurred');
    throw error;
  }
}
```

---

**Last Updated:** December 20, 2024

These examples should give you everything you need to implement the UI! Copy, paste, and adjust to fit your specific needs.
