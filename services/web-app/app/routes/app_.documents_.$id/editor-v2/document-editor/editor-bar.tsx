import { type Editor } from '@tiptap/react';
import { MessageCirclePlusIcon } from 'lucide-react';
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
import { buildSafeErrorScalarsForLog } from '~/utils/error-log-scalars';
import { type Command, commands, COMMAND_STYLE } from './commands';
import { DocumentImageButton } from './document-image-button';
import camelCase from 'lodash/camelCase';
import { USER_SOURCE_META } from './extensions/source-tracker';
import { TOOLBAR_SOURCE } from './use-pm-tripwire';

const DROPDOWN_WIDTH = 32;
const BUTTON_WIDTH = 32;
const GAP_WIDTH = 3;
const PADDING = 8;

export type BarProps = {
  editor: Editor | null;
  documentId: string;
  isEditable?: boolean;
  teacherCommenting?: boolean;
  canUploadImages?: boolean;
  onCommentDraft?: (draft: { id: string; excerpt: string }) => void;
  onCommentCreated?: (comment: unknown) => void;
};

export const Bar = ({
  editor,
  documentId,
  isEditable = true,
  teacherCommenting = false,
  canUploadImages = false,
  onCommentDraft,
  onCommentCreated,
}: BarProps) => {
  const [visibleCommands, setVisibleCommands] = useState(commands);
  const [hiddenCommands, setHiddenCommands] = useState<Command[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const canAddComment = isEditable || teacherCommenting;

  const beginCommentDraft = () => {
    if (!editor) return;
    if (editor.isActive('comment')) {
      editor
        .chain()
        .focus()
        .setMeta(USER_SOURCE_META, TOOLBAR_SOURCE)
        .unsetComment()
        .run();
      return;
    }
    const id = v4();
    const { from, to } = editor.state.selection;
    const excerpt = editor.state.doc.textBetween(from, to, ' ').trim();
    if (!excerpt) return;
    editor
      .chain()
      .focus()
      .setMeta(USER_SOURCE_META, TOOLBAR_SOURCE)
      .setComment(id)
      .run();
    onCommentDraft?.({ id, excerpt });
  };

  return (
    <div
      data-tour="doc-toolbar"
      className="doc-editor-toolbar-glass"
      ref={containerRef}
    >
      {teacherCommenting ? (
        <>
          <span
            className="shrink-0 text-[13px] text-[hsl(50_2.4%_36%)]"
            data-testid="document-view-only-banner"
          >
            Viewing only. Select text to comment.
          </span>
          <span aria-hidden className="mx-1 h-[18px] w-px bg-[hsl(51.4286_7.8652%_82.549%)]" />
        </>
      ) : null}
      {isEditable
        ? visibleCommands.map(
            ({ icon, label, command, params, activeId, isActive, override }) => {
              if (override) return override(editor);
              if (!command) return null;

              return (
                <Tooltip text={label} delayDuration={300} key={label ?? command}>
                  <div
                    onClick={() => {
                      const chain = editor.chain().focus() as any;
                      chain[command](params).run();
                    }}
                    className={cn(COMMAND_STYLE, {
                      'bg-foreground/20 hover:bg-foreground/20': isActive
                        ? isActive(editor)
                        : editor.isActive(activeId ?? camelCase(label ?? ''), params),
                    })}
                  >
                    {icon ?? label}
                  </div>
                </Tooltip>
              );
            }
          )
        : null}
      {isEditable && canUploadImages ? (
        <DocumentImageButton editor={editor} documentId={documentId} />
      ) : null}
      {canAddComment ? (
        <Tooltip text="Comment" delayDuration={300}>
          <div
            data-testid="editor-add-comment"
            onClick={beginCommentDraft}
            className={cn(COMMAND_STYLE, {
              'bg-foreground/20 hover:bg-foreground/20': editor.isActive('comment'),
            })}
          >
            <MessageCirclePlusIcon className="h-5 w-5" />
          </div>
        </Tooltip>
      ) : null}
      {isEditable && hiddenCommands.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="More editor formatting options"
              onClick={(e) => e.preventDefault()}
            >
              <DotsHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="flex w-fit flex-col gap-1">
            {hiddenCommands.map(
              ({ icon, label, command, params, activeId, isActive }, idx) => (
                <DropdownMenuItem
                  key={`${label ?? command ?? 'command'}-${idx}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!command) return;
                    // @ts-ignore
                    editor.chain().focus()[command](params).run();
                  }}
                  className={cn(COMMAND_STYLE, 'flex items-center gap-3', {
                    'bg-foreground/20 hover:bg-foreground/20': isActive
                      ? isActive(editor)
                      : editor.isActive(activeId ?? camelCase(label ?? ''), params),
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
    </div>
  );
};
