import { useEffect, useMemo, useState } from 'react';
import { useFetcher } from 'react-router';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Button } from '~/components/ui/button';
import { Label } from '~/components/ui/label';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { toDateInputValue } from '~/utils/date-only';

type AssignmentRecord = {
  id: string;
  title: string | null;
  prompt: string;
  tutorContext: string | null;
  dueDate: Date | string | null;
  assignmentTypeId: string;
};

type AssignmentSheetProps = {
  classId: string;
  allowedAssignmentTypes: { id: string; title: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingAssignment: AssignmentRecord | null;
};

export function AssignmentSheet({
  classId,
  allowedAssignmentTypes,
  open,
  onOpenChange,
  editingAssignment,
}: AssignmentSheetProps) {
  const fetcher = useFetcher<any>();
  const extractFetcher = useFetcher<any>();
  const [title, setTitle] = useState('');
  const [assignmentTypeId, setAssignmentTypeId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [tutorContext, setTutorContext] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [promptMode, setPromptMode] = useState<'manual' | 'pdf'>('manual');
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  const isEditing = Boolean(editingAssignment?.id);
  const isSaving = fetcher.state !== 'idle';
  const isExtracting = extractFetcher.state !== 'idle';

  const formError = useMemo(() => {
    if (!fetcher.data || fetcher.data.success) return '';
    return fetcher.data.message || 'Unable to save assignment.';
  }, [fetcher.data]);

  const extractError = useMemo(() => {
    if (!extractFetcher.data || extractFetcher.data.success) return '';
    return extractFetcher.data.message || 'Unable to extract PDF content.';
  }, [extractFetcher.data]);

  useEffect(() => {
    if (!open) return;
    setTitle(editingAssignment?.title ?? '');
    setAssignmentTypeId(
      editingAssignment?.assignmentTypeId ?? allowedAssignmentTypes[0]?.id ?? ''
    );
    setPrompt(editingAssignment?.prompt ?? '');
    setTutorContext(editingAssignment?.tutorContext ?? '');
    setDueDate(toDateInputValue(editingAssignment?.dueDate));
    setPromptMode('manual');
    setPdfFile(null);
  }, [allowedAssignmentTypes, editingAssignment, open]);

  useEffect(() => {
    if (!extractFetcher.data?.success) return;

    if (typeof extractFetcher.data.title === 'string') {
      setTitle(extractFetcher.data.title);
    }
    if (typeof extractFetcher.data.prompt === 'string') {
      setPrompt(extractFetcher.data.prompt);
    }
    if (typeof extractFetcher.data.tutorContext === 'string') {
      setTutorContext(extractFetcher.data.tutorContext);
    }
  }, [extractFetcher.data]);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.success) {
      onOpenChange(false);
    }
  }, [fetcher.state, fetcher.data, onOpenChange]);

  const handleExtractPdf = () => {
    if (!pdfFile) return;
    const formData = new FormData();
    formData.append('classId', classId);
    formData.append('file', pdfFile);
    extractFetcher.submit(formData, {
      method: 'POST',
      action: '/api/domain/assignment-pdf-extract',
      encType: 'multipart/form-data',
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{isEditing ? 'Edit Assignment' : 'New Assignment'}</SheetTitle>
          <SheetDescription>
            Configure the assignment prompt, tutor context, and due date.
          </SheetDescription>
        </SheetHeader>

        <fetcher.Form method="post" className="mt-6 space-y-4">
          <input type="hidden" name="intent" value={isEditing ? 'update-assignment' : 'create-assignment'} />
          <input type="hidden" name="classId" value={classId} />
          {isEditing ? (
            <input type="hidden" name="assignmentId" value={editingAssignment?.id ?? ''} />
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="assignment-title">Title (optional)</Label>
            <Input
              id="assignment-title"
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g., Rhetorical Analysis Essay"
              disabled={isSaving}
            />
          </div>

          <div className="space-y-2">
            <Label>Assignment Type</Label>
            <Select
              value={assignmentTypeId}
              onValueChange={setAssignmentTypeId}
              disabled={isSaving}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select assignment type" />
              </SelectTrigger>
              <SelectContent>
                {allowedAssignmentTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" name="assignmentTypeId" value={assignmentTypeId} />
          </div>

          <div className="space-y-2">
            <Label>Prompt Source</Label>
            <div className="flex items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={promptMode === 'manual'}
                  onChange={() => setPromptMode('manual')}
                />
                Type manually
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={promptMode === 'pdf'}
                  onChange={() => setPromptMode('pdf')}
                />
                Upload PDF
              </label>
            </div>
          </div>

          {promptMode === 'pdf' ? (
            <div className="space-y-2 rounded-md border p-3">
              <Label htmlFor="assignment-pdf">Assignment PDF</Label>
              <Input
                id="assignment-pdf"
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null;
                  setPdfFile(nextFile);
                }}
                disabled={isExtracting || isSaving}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleExtractPdf}
                disabled={!pdfFile || isExtracting || isSaving}
              >
                {isExtracting ? 'Extracting…' : 'Extract Prompt from PDF'}
              </Button>
              {extractError ? (
                <p className="text-sm text-destructive">{extractError}</p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="assignment-prompt">Prompt</Label>
            <Textarea
              id="assignment-prompt"
              name="prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={8}
              placeholder="Paste or type the full assignment prompt for students..."
              disabled={isSaving}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="assignment-tutor-context">Tutor Context (optional)</Label>
            <Textarea
              id="assignment-tutor-context"
              name="tutorContext"
              value={tutorContext}
              onChange={(event) => setTutorContext(event.target.value)}
              rows={6}
              placeholder="Guidance for the tutor system prompt..."
              disabled={isSaving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="assignment-due-date">Due Date (optional)</Label>
            <Input
              id="assignment-due-date"
              type="date"
              name="dueDate"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              disabled={isSaving}
            />
          </div>

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

          <div className="flex items-center justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving || isExtracting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || isExtracting || !assignmentTypeId}>
              {isSaving
                ? isEditing
                  ? 'Saving...'
                  : 'Creating...'
                : isEditing
                  ? 'Save Assignment'
                  : 'Create Assignment'}
            </Button>
          </div>
        </fetcher.Form>
      </SheetContent>
    </Sheet>
  );
}
