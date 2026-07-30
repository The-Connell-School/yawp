import { useState } from 'react';
import { Info } from 'lucide-react';
import { Button } from '~/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import {
  TUTOR_GUIDELINE_LAYER_META,
  UNIVERSAL_YAWP_TUTOR_GUIDELINES,
  type TutorGuidelineLayer,
} from '~/domain/tutoring/tutor-guidelines';

function UniversalGuidelinesSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        aria-describedby="universal-tutor-guidelines-description"
        className="overflow-y-auto"
        data-testid="tutor-guidelines-universal-sheet"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Info className="size-4 shrink-0" />
            {TUTOR_GUIDELINE_LAYER_META.universal.label}
          </SheetTitle>
          <SheetDescription id="universal-tutor-guidelines-description">
            Read-only. Every tutor conversation in every course starts from
            these; course, module, and step guidelines add to them.
          </SheetDescription>
        </SheetHeader>

        <p className="mt-6 whitespace-pre-wrap text-sm text-muted-foreground text-pretty">
          {UNIVERSAL_YAWP_TUTOR_GUIDELINES}
        </p>
      </SheetContent>
    </Sheet>
  );
}

export function UniversalTutorGuidelinesBanner() {
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <>
      <div
        data-testid="tutor-guidelines-universal"
        className="flex flex-col gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 size-5 shrink-0 text-blue-600" />
          <div>
            <p className="text-sm font-medium">
              {TUTOR_GUIDELINE_LAYER_META.universal.label} are always on
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground text-pretty">
              {TUTOR_GUIDELINE_LAYER_META.universal.blurb} Anything you write
              below stacks on top of them.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit shrink-0"
          data-testid="tutor-guidelines-universal-trigger"
          onClick={() => setPreviewOpen(true)}
        >
          View universal guidelines
        </Button>
      </div>
      <UniversalGuidelinesSheet
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </>
  );
}

function LayerStatusBadge({ layer }: { layer: TutorGuidelineLayer }) {
  if (layer.key === 'universal') {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
        Always on
      </span>
    );
  }

  return layer.isActive ? (
    <span className="inline-flex shrink-0 items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
      Set
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800">
      Not set
    </span>
  );
}

/**
 * Names every layer of guidance the tutor receives, in prompt order, so admins
 * can tell at a glance what a course actually sends versus what it inherits.
 */
export function TutorGuidelineLayerList({
  layers,
  editHref,
}: {
  layers: TutorGuidelineLayer[];
  editHref?: Record<string, { href: string; label: string }>;
}) {
  const [universalOpen, setUniversalOpen] = useState(false);

  return (
    <>
      <ul className="space-y-3">
        {layers.map((layer) => {
          const link = editHref?.[layer.key];

          return (
            <li
              key={layer.key}
              data-testid={`tutor-guideline-layer-${layer.key}`}
              className="rounded-lg border bg-background px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{layer.label}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground text-pretty">
                    {layer.blurb}
                  </p>
                </div>
                <LayerStatusBadge layer={layer} />
              </div>

              {layer.key === 'universal' ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  data-testid="tutor-guidelines-universal-trigger"
                  onClick={() => setUniversalOpen(true)}
                >
                  View universal guidelines
                </Button>
              ) : layer.isActive ? (
                <p className="mt-3 whitespace-pre-wrap text-sm text-pretty">
                  {layer.body}
                </p>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground text-pretty">
                  {layer.emptyBlurb}
                  {link ? (
                    <>
                      {' '}
                      <a className="underline" href={link.href}>
                        {link.label}
                      </a>
                    </>
                  ) : null}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <UniversalGuidelinesSheet
        open={universalOpen}
        onOpenChange={setUniversalOpen}
      />
    </>
  );
}
