import { type ChangeEvent, type Ref, type RefObject } from 'react';
import { ImageIcon, Trash2, Upload } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { cn } from '~/utils/misc';

type AssignmentTypeImageThumbnailProps = {
  imageId?: string | null;
  previewUrl: string | null;
  hasRemovedImage: boolean;
  disabled?: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onImageChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: () => void;
};

function OverlayIconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="icon-sm"
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
      className="relative size-8 bg-background/90 shadow-sm"
    >
      {children}
      <span
        className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2"
        aria-hidden
      />
    </Button>
  );
}

export function AssignmentTypeImageThumbnail({
  imageId,
  previewUrl,
  hasRemovedImage,
  disabled,
  fileInputRef,
  onImageChange,
  onRemoveImage,
}: AssignmentTypeImageThumbnailProps) {
  const hasSavedImage = Boolean(imageId && !hasRemovedImage);
  const hasImage = Boolean(previewUrl || hasSavedImage);
  const src =
    previewUrl ?? (imageId ? `/api/image/course/${imageId}` : null);

  function pickImage() {
    if (disabled) return;
    fileInputRef.current?.click();
  }

  return (
    <div className="flex shrink-0 self-stretch">
      <div
        className={cn(
          'relative h-full w-40 overflow-hidden rounded-xl',
          'outline-1 -outline-offset-1 outline-black/5 dark:outline-white/10',
          !hasImage && 'bg-muted'
        )}
      >
        {hasImage && src ? (
          <img src={src} alt="" className="size-full object-cover" />
        ) : (
          <button
            type="button"
            onClick={pickImage}
            disabled={disabled}
            className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground disabled:opacity-50"
            aria-label="Upload assignment type image"
          >
            <ImageIcon className="size-10 shrink-0" aria-hidden />
            <span className="text-sm font-medium">Add image</span>
          </button>
        )}

        {hasImage ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/45 opacity-0 transition-opacity focus-within:opacity-100 hover:opacity-100">
            <OverlayIconButton
              label="Change image"
              onClick={pickImage}
              disabled={disabled}
            >
              <Upload className="size-4 shrink-0" />
            </OverlayIconButton>
            <OverlayIconButton
              label="Remove image"
              onClick={onRemoveImage}
              disabled={disabled}
            >
              <Trash2 className="size-4 shrink-0" />
            </OverlayIconButton>
          </div>
        ) : null}
      </div>

      <input
        ref={fileInputRef as Ref<HTMLInputElement>}
        type="file"
        name="image"
        accept="image/*"
        className="hidden"
        onChange={onImageChange}
        disabled={disabled}
      />
      {hasRemovedImage && imageId && !previewUrl ? (
        <input type="hidden" name="deleteImage" value="true" />
      ) : null}
    </div>
  );
}
