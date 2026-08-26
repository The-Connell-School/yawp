import { type Editor } from '@tiptap/react';
import { ImagePlusIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Tooltip } from '~/components/ui/tooltip';
import {
  DOCUMENT_IMAGE_ALLOWED_CONTENT_TYPES,
  DOCUMENT_IMAGE_MAX_BYTES,
  normalizeAltText,
  validateDocumentImageUpload,
} from '~/domain/document-images/document-images';
import { cn } from '~/utils/misc';
import { COMMAND_STYLE } from './commands';
import { uploadDocumentImage } from './upload-document-image';

const ACCEPT = DOCUMENT_IMAGE_ALLOWED_CONTENT_TYPES.join(',');
const MAX_MB = Math.round(DOCUMENT_IMAGE_MAX_BYTES / (1024 * 1024));

type Props = {
  editor: Editor;
  documentId: string;
};

/**
 * "Add image" for report-style assignments.
 *
 * The alt text field is required and comes *before* the upload: GBA 300 grades
 * whether a graphic communicates, and a figure with no description communicates
 * nothing to a screen-reader user or to a teacher reading the outline view.
 */
export function DocumentImageButton({ editor, documentId }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [altText, setAltText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setAltText('');
    setError(null);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    if (!picked) return;

    // Check locally first so an 8 MB rejection doesn't cost an 8 MB upload.
    const validation = validateDocumentImageUpload({
      contentType: picked.type,
      byteSize: picked.size,
      // Alt text is collected in the dialog; only the file matters here.
      altText: 'placeholder',
    });

    if (!validation.ok) {
      setError(validation.message);
      setFile(null);
      setPreviewUrl(null);
      setOpen(true);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    setError(null);
    setFile(picked);
    setPreviewUrl(URL.createObjectURL(picked));
    setAltText(picked.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' '));
    setOpen(true);
  }

  async function onInsert() {
    if (!file) return;
    const description = normalizeAltText(altText);
    if (!description) {
      setError('Describe the image so screen-reader users know what it shows.');
      return;
    }

    setBusy(true);
    setError(null);

    const result = await uploadDocumentImage({ documentId, file, altText: description });

    if (!result.ok) {
      setError(result.message);
      setBusy(false);
      return;
    }

    editor
      .chain()
      .focus()
      .insertDocumentImage({ src: result.image.src, alt: result.image.altText })
      .run();

    setOpen(false);
    reset();
  }

  return (
    <>
      <Tooltip text="Add image (or paste / drag one in)" delayDuration={300}>
        <div
          data-testid="editor-add-image"
          role="button"
          tabIndex={0}
          aria-label="Add image"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          className={cn(COMMAND_STYLE)}
        >
          <ImagePlusIcon className="h-5 w-5" />
        </div>
      </Tooltip>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        data-testid="editor-image-file-input"
        onChange={onPick}
      />

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add an image</DialogTitle>
            <DialogDescription>
              Charts, graphs, photos, and logos you made elsewhere. PNG, JPEG, GIF, or
              WebP, up to {MAX_MB} MB. You can also paste a screenshot or drag an image
              straight into your report.
            </DialogDescription>
          </DialogHeader>

          {previewUrl ? (
            <img
              src={previewUrl}
              alt=""
              data-testid="editor-image-preview"
              className="max-h-56 w-full rounded-md border object-contain"
            />
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="document-image-alt">Describe this image</Label>
            <Input
              id="document-image-alt"
              value={altText}
              placeholder="Ten-year revenue for the global market"
              onChange={(event) => setAltText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void onInsert();
                }
              }}
            />
            <p className="text-muted-foreground text-xs">
              This becomes the figure&rsquo;s caption and what screen readers announce.
            </p>
          </div>

          {error ? (
            <p role="alert" data-testid="editor-image-error" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              data-testid="editor-image-insert"
              onClick={() => void onInsert()}
              disabled={busy || !file || !normalizeAltText(altText)}
            >
              {busy ? 'Uploading…' : 'Insert image'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
