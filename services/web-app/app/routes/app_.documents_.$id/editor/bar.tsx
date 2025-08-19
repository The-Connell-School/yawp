import { useFetcher } from 'react-router';
import { type Editor } from '@tiptap/react';
import { MessageCirclePlusIcon, History as HistoryIcon } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { v4 } from 'uuid';
import { DotsHorizontalIcon } from '~/components/icons';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Tooltip } from '~/components/ui/tooltip';
import { cn } from '~/utils/misc';
import { type Command, commands, COMMAND_STYLE } from './commands';
import camelCase from 'lodash/camelCase';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Slider } from '~/components/ui/slider';
import { Label } from '~/components/ui/label';
// useFetcher already imported above

const DROPDOWN_WIDTH = 32;
const BUTTON_WIDTH = 32;
const GAP_WIDTH = 3;
const PADDING = 8;

export type BarProps = {
  editor: Editor | null;
  documentId: string;
};

export const Bar = ({ editor, documentId }: BarProps) => {
  const [visibleCommands, setVisibleCommands] = useState(commands);
  const [hiddenCommands, setHiddenCommands] = useState<Command[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const createDocumentCommentFetcher = useFetcher<{ id: string }>({
    key: 'create-document-comment',
  });
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [previewText, setPreviewText] = useState<string>('');
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const historyFetcher = useFetcher<any>({ key: 'doc-history' });

  // Helpers for persistence and server-driven navigation
  const persistEditorContent = async () => {
    if (!editor) return;
    const html = editor.getHTML();
    const text = editor.getText();
    const formData = new FormData();
    formData.append('html', html);
    formData.append('text', text);
    await fetch(`/api/model/document/${documentId}?from=history`, {
      method: 'PUT',
      body: formData,
    });
  };

  const ensureHistoryMeta = () => {
    if (!historyFetcher.data) {
      historyFetcher.load(`/api/model/document/${documentId}/history`);
    }
  };

  const loadVersionAndApply = async (version: number) => {
    const res = await fetch(
      `/api/model/document/${documentId}/history?version=${version}`
    );
    if (!res.ok) return;
    const data = await res.json();
    const doc = data.document as { html?: string; text?: string };
    const serverHtml = doc.html?.trim() ?? '';
    const html =
      serverHtml.length > 0
        ? serverHtml
        : doc.text
          ? `<p>${doc.text.replace(/\n/g, '</p><p>')}</p>`
          : '<p></p>';
    // Do not emit update (we will persist explicitly)
    editor?.commands.setContent(html, false);
    await persistEditorContent();
    setSelectedVersion(version);
  };

  useEffect(() => {
    const updateButtonVisibility = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const maxButtons =
          Math.floor(
            (containerWidth - PADDING - DROPDOWN_WIDTH) /
              (BUTTON_WIDTH + GAP_WIDTH)
          ) - 1;
        if (commands.length > maxButtons) {
          setVisibleCommands(commands.slice(0, maxButtons));
          setHiddenCommands(commands.slice(maxButtons));
        } else {
          setVisibleCommands(commands);
          setHiddenCommands([]);
        }
      }
    };

    // Delay to ensure the container has been rendered
    setTimeout(() => updateButtonVisibility(), 100);

    window.addEventListener('resize', updateButtonVisibility);

    return () => window.removeEventListener('resize', updateButtonVisibility);
  }, []);

  if (!editor) return null;
  // Debounce helper
  const debounce = (fn: (...args: any[]) => void, ms: number) => {
    let t: any;
    return (...args: any[]) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };

  // Fetch preview when version changes (debounced to 500ms)
  const loadVersion = debounce((v: number) => {
    setIsLoadingPreview(true);
    historyFetcher.load(
      `/api/model/document/${documentId}/history?version=${v}`
    );
  }, 500);

  useEffect(() => {
    if (!isHistoryOpen) return;
    const v = selectedVersion ?? historyFetcher.data?.currentVersion ?? 0;
    if (v > 0) {
      loadVersion(v);
    } else if (historyFetcher.data?.currentVersion) {
      setPreviewHtml('');
      setPreviewText('');
    }
  }, [isHistoryOpen, selectedVersion, documentId]);

  // When opening and data arrives, default selection to current version so preview shows immediately
  useEffect(() => {
    if (!isHistoryOpen) return;
    const current = historyFetcher.data?.currentVersion as number | undefined;
    if (current != null && selectedVersion == null) {
      setSelectedVersion(current);
    }
  }, [isHistoryOpen, historyFetcher.data?.currentVersion, selectedVersion]);

  // Apply fetched preview with fallback HTML generation when server HTML is empty
  useEffect(() => {
    const doc = historyFetcher.data?.document as
      | { text?: string; html?: string }
      | undefined;
    if (doc) {
      const text = doc.text ?? '';
      setPreviewText(text);
      const serverHtml = doc.html;
      const html =
        serverHtml && serverHtml.trim().length > 0
          ? serverHtml
          : text
            ? `<p>${text.replace(/\n/g, '</p><p>')}</p>`
            : '';
      setPreviewHtml(html);
      setIsLoadingPreview(false);
    }
  }, [historyFetcher.data]);

  return (
    <div
      className="bg-muted-background flex w-full items-center gap-0.5 border-b p-1"
      ref={containerRef}
    >
      {visibleCommands.map(
        ({ icon, label, command, params, activeId, override }) => {
          if (override) return override(editor);
          const isUndo = command === 'undo';
          const isRedo = command === 'redo';
          const handleClick = async () => {
            if (isUndo || isRedo) {
              ensureHistoryMeta();
              const current =
                (historyFetcher.data?.currentVersion as number) ?? 0;
              const base = selectedVersion ?? current;
              const target = isUndo
                ? Math.max(0, base - 1)
                : Math.min(current, base + 1);
              if (target > 0) await loadVersionAndApply(target);
              return;
            }
            // default tiptap command
            // @ts-ignore
            editor.chain().focus()[command](params).run();
          };
          return (
            <Tooltip text={label} delayDuration={300} key={label}>
              <div
                onClick={handleClick}
                className={cn(COMMAND_STYLE, {
                  'bg-muted': editor.isActive(
                    activeId ?? camelCase(label ?? ''),
                    params
                  ),
                })}
              >
                {icon ?? label}
              </div>
            </Tooltip>
          );
        }
      )}
      <Tooltip text="Comment" delayDuration={300}>
        <div
          onClick={() => {
            if (editor.isActive('comment')) {
              editor.chain().focus().unsetComment().run();
            } else {
              const id = v4();
              const { from, to } = editor.state.selection;
              const content = editor.state.doc.textBetween(from, to, ' ');
              if (!content) return;
              editor.chain().focus().setComment(id).run();
              createDocumentCommentFetcher.submit(
                { id, content, documentId },
                { method: 'POST', action: '/api/model/document-comment' }
              );
            }
          }}
          className={cn(COMMAND_STYLE, {
            'bg-muted': editor.isActive('comment'),
          })}
        >
          <MessageCirclePlusIcon className="h-5 w-5" />
        </div>
      </Tooltip>
      {hiddenCommands.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={(e) => e.preventDefault()}
            >
              <DotsHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="flex w-fit flex-col gap-1">
            {hiddenCommands.map(
              ({ icon, label, command, params, activeId }) => (
                <DropdownMenuItem
                  key={label}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // @ts-ignore
                    editor.chain().focus()[command](params).run();
                  }}
                  className={cn(COMMAND_STYLE, 'flex items-center gap-3', {
                    'bg-muted': editor.isActive(
                      activeId ?? camelCase(label ?? ''),
                      params
                    ),
                  })}
                >
                  <span>{icon ?? label}</span>
                  <span>{label}</span>
                </DropdownMenuItem>
              )
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <div className="ml-auto flex items-center gap-1 pr-1">
        <Dialog
          open={isHistoryOpen}
          onOpenChange={(open) => {
            setIsHistoryOpen(open);
            if (open) {
              historyFetcher.load(`/api/model/document/${documentId}/history`);
              setSelectedVersion(null);
            }
          }}
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Document history</DialogTitle>
            </DialogHeader>
            <div className="flex gap-4">
              <div className="w-2/5 space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="version">Version</Label>
                  <div className="flex items-center gap-2">
                    <Slider
                      min={0}
                      max={(historyFetcher.data?.currentVersion as number) ?? 0}
                      step={1}
                      value={[
                        selectedVersion ??
                          (historyFetcher.data?.currentVersion as number) ??
                          0,
                      ]}
                      onValueChange={(v) => setSelectedVersion(v[0] ?? 0)}
                    />
                    <span className="w-12 text-right text-xs">
                      {selectedVersion ??
                        historyFetcher.data?.currentVersion ??
                        0}
                    </span>
                  </div>
                  {typeof selectedVersion === 'number' &&
                    historyFetcher.data?.versionSummaries && (
                      <div className="text-xs text-muted-foreground">
                        {(() => {
                          const summary = (
                            historyFetcher.data.versionSummaries as Array<any>
                          ).find((v: any) => v.version === selectedVersion);
                          return summary?.createdAt
                            ? new Date(summary.createdAt).toLocaleString()
                            : '';
                        })()}
                      </div>
                    )}
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const v = Math.max(
                          0,
                          (selectedVersion ??
                            historyFetcher.data?.currentVersion ??
                            0) - 1
                        );
                        setSelectedVersion(v);
                      }}
                    >
                      -1
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const current =
                          (historyFetcher.data?.currentVersion as number) ?? 0;
                        const v = Math.min(
                          current,
                          (selectedVersion ?? current) + 1
                        );
                        setSelectedVersion(v);
                      }}
                    >
                      +1
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setSelectedVersion(
                          historyFetcher.data?.currentVersion ?? 0
                        )
                      }
                    >
                      Current
                    </Button>
                  </div>
                </div>
                {/* Search removed as requested */}
                <div>
                  <Button
                    size="sm"
                    onClick={async () => {
                      if (!editor) return;
                      editor.commands.setContent(
                        previewHtml || '<p></p>',
                        false
                      );
                      await persistEditorContent();
                      setIsHistoryOpen(false);
                    }}
                  >
                    Restore version
                  </Button>
                </div>
              </div>
              <div className="w-3/5 space-y-3">
                <div className="text-xs text-muted-foreground flex items-center justify-between">
                  <span>Preview</span>
                  {typeof selectedVersion === 'number' &&
                    historyFetcher.data?.versionSummaries && (
                      <span className="ml-auto pl-2">
                        {(() => {
                          const summary = (
                            historyFetcher.data.versionSummaries as Array<any>
                          ).find((v: any) => v.version === selectedVersion);
                          return summary?.createdAt
                            ? new Date(summary.createdAt).toLocaleString()
                            : '';
                        })()}
                      </span>
                    )}
                </div>
                <div className="h-60 overflow-auto rounded-md border p-2 text-sm leading-snug">
                  {isLoadingPreview ? (
                    <div className="space-y-2 animate-pulse">
                      <div className="h-3 w-11/12 rounded bg-muted" />
                      <div className="h-3 w-9/12 rounded bg-muted" />
                      <div className="h-3 w-10/12 rounded bg-muted" />
                      <div className="h-3 w-8/12 rounded bg-muted" />
                      <div className="h-3 w-7/12 rounded bg-muted" />
                    </div>
                  ) : (
                    <div
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: previewHtml }}
                    />
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Open history"
          onClick={() => {
            setIsHistoryOpen(true);
          }}
        >
          <HistoryIcon className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
};
