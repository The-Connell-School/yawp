import { FileText } from 'lucide-react';
import { useState } from 'react';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';

export function AssignmentPromptAttachment({
  assignmentId,
  fileName,
}: {
  assignmentId: string;
  fileName: string;
}) {
  const src = `/api/domain/assignment-prompt-attachment/${encodeURIComponent(
    assignmentId
  )}`;
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <FileText className="mr-2 h-4 w-4" aria-hidden />
        {fileName}
      </Button>
      <DialogContent className="h-[90vh] w-[95vw] max-w-6xl grid-rows-[auto_minmax(0,1fr)] p-4 sm:p-6">
        <DialogHeader className="pr-8">
          <DialogTitle>{fileName}</DialogTitle>
          <DialogDescription>Assignment PDF</DialogDescription>
        </DialogHeader>
        <iframe
          src={src}
          title={fileName}
          className="h-full min-h-0 w-full rounded-md border bg-white"
        />
      </DialogContent>
    </Dialog>
  );
}
