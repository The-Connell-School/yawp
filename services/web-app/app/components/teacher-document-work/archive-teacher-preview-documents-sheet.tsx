import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Button } from '~/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import type { TeacherPreviewArchiveRow } from '~/utils/teacher-document-work-utils';

export async function archiveTeacherPreviewDocuments(documentIds: string[]) {
  for (const documentId of documentIds) {
    const formData = new FormData();
    formData.set('action', 'archive');
    const response = await fetch(`/api/model/document/${documentId}`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      throw new Error(`Failed to archive preview document ${documentId}`);
    }
  }
}

type ArchiveTeacherPreviewDocumentsSheetProps = {
  documents: TeacherPreviewArchiveRow[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export function ArchiveTeacherPreviewDocumentsSheet({
  documents,
  isOpen,
  onClose,
  onSuccess,
}: ArchiveTeacherPreviewDocumentsSheetProps) {
  const [isArchiving, setIsArchiving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleArchive = async () => {
    if (documents.length === 0 || isArchiving) return;
    setIsArchiving(true);
    setErrorMessage(null);
    try {
      await archiveTeacherPreviewDocuments(documents.map((document) => document.id));
      onClose();
      onSuccess?.();
    } catch {
      setErrorMessage('Could not archive one or more preview documents. Try again.');
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setErrorMessage(null);
          onClose();
        }
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>Archive preview documents</SheetTitle>
          <SheetDescription>
            Remove your assignment previews from this class list. Student
            documents in the selection are not archived.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Assignment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((document) => (
                  <TableRow key={document.id}>
                    <TableCell className="font-medium">{document.title}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {document.assignmentTitle ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {errorMessage ? (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isArchiving}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isArchiving || documents.length === 0}
              onClick={handleArchive}
              data-testid="archive-teacher-preview-confirm"
            >
              {isArchiving ? 'Archiving…' : 'Archive preview'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
