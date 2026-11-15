import { type Editor } from '@tiptap/react';
import { MessageCirclePlusIcon, MoreHorizontal } from 'lucide-react';
import { useMemo } from 'react';
import { v4 } from 'uuid';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Tooltip } from '~/components/ui/tooltip';
import { cn } from '~/utils/misc';
import { COMMAND_STYLE } from './commands';
import { v2OverflowCommands, v2ToolbarCommands } from './commands/v2-commands';
import { DocumentImageButton } from './document-image-button';
import { USER_SOURCE_META } from './extensions/source-tracker';
import { TOOLBAR_SOURCE } from './use-pm-tripwire';
import {
  ToolbarFitWidth,
  ToolbarNormalText,
  ToolbarUndoRedo,
  type PageWidthMode,
} from './toolbar-controls';
import camelCase from 'lodash/camelCase';

export type BarProps = {
  editor: Editor | null;
  documentId: string;
  isEditable?: boolean;
  teacherCommenting?: boolean;
  canUploadImages?: boolean;
  pageWidth: PageWidthMode;
  onPageWidthChange: (mode: PageWidthMode) => void;
  onCommentDraft?: (draft: { id: string; excerpt: string }) => void;
};

export function beginCommentDraftFromEditor(
  editor: Editor,
  onCommentDraft?: (draft: { id: string; excerpt: string }) => void
) {
  const { from, to, empty } = editor.state.selection;
  if (empty) {
    if (editor.isActive('comment')) {
      editor
        .chain()
        .focus()
        .setMeta(USER_SOURCE_META, TOOLBAR_SOURCE)
        .unsetComment()
        .run();
    }
    return;
  }
  const excerpt = editor.state.doc.textBetween(from, to, ' ').trim();
  if (!excerpt) return;
  const id = v4();
  editor
    .chain()
    .focus()
    .setMeta(USER_SOURCE_META, TOOLBAR_SOURCE)
    .setComment(id)
    .run();
  onCommentDraft?.({ id, excerpt });
}

export const Bar = ({
  editor,
  documentId,
  isEditable = true,
  teacherCommenting = false,
  canUploadImages = false,
  pageWidth,
  onPageWidthChange,
  onCommentDraft,
}: BarProps) => {
  const canAddComment = isEditable || teacherCommenting;
  const formatCommands = useMemo(() => v2ToolbarCommands, []);

  if (!editor) return null;

  const runCommand = (
    command: string,
    params?: Record<string, unknown>
  ) => {
    const chain = editor
      .chain()
      .focus()
      .setMeta(USER_SOURCE_META, TOOLBAR_SOURCE) as any;
    chain[command](params).run();
  };

  return (
    <div data-tour="doc-toolbar" className="doc-editor-toolbar-glass">
      {teacherCommenting ? (
        <>
          <span
            className="shrink-0 text-[13px] text-[hsl(50_2.4%_36%)]"
            data-testid="document-view-only-banner"
          >
            Viewing only. Select text to comment.
          </span>
          <span
            aria-hidden
            className="mx-1 h-[18px] w-px bg-[hsl(51.4286_7.8652%_82.549%)]"
          />
          <ToolbarFitWidth mode={pageWidth} onChange={onPageWidthChange} />
          <span className="ml-auto" />
        </>
      ) : isEditable ? (
        <>
          <ToolbarUndoRedo editor={editor} />
          <ToolbarFitWidth mode={pageWidth} onChange={onPageWidthChange} />
          <span
            aria-hidden
            className="mx-1 h-[18px] w-px bg-[hsl(51.4286_7.8652%_82.549%)]"
          />
          <ToolbarNormalText editor={editor} />
          <span
            aria-hidden
            className="mx-1 h-[18px] w-px bg-[hsl(51.4286_7.8652%_82.549%)]"
          />
          {formatCommands.map(
            ({ icon, label, command, params, activeId, isActive, override }) => {
              if (override) return override(editor);
              if (!command) return null;
              return (
                <Tooltip text={label} delayDuration={300} key={label ?? command}>
                  <button
                    type="button"
                    aria-label={label}
                    onClick={() => runCommand(command, params)}
                    className={cn(COMMAND_STYLE, {
                      'bg-foreground/20 hover:bg-foreground/20': isActive
                        ? isActive(editor)
                        : editor.isActive(
                            activeId ?? camelCase(label ?? ''),
                            params
                          ),
                    })}
                  >
                    {icon ?? label}
                  </button>
                </Tooltip>
              );
            }
          )}
          {canUploadImages ? (
            <DocumentImageButton editor={editor} documentId={documentId} />
          ) : null}
        </>
      ) : null}
      {canAddComment ? (
        <Tooltip text="Comment" delayDuration={300}>
          <button
            type="button"
            data-testid="editor-add-comment"
            aria-label="Add comment"
            onClick={() => beginCommentDraftFromEditor(editor, onCommentDraft)}
            className={cn(COMMAND_STYLE, {
              'bg-foreground/20 hover:bg-foreground/20':
                editor.isActive('comment'),
            })}
          >
            <MessageCirclePlusIcon className="h-4 w-4" />
          </button>
        </Tooltip>
      ) : null}
      {isEditable ? (
        <span className="ml-auto flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="More formatting"
                className="h-8 w-8"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="flex w-fit flex-col gap-1">
              {v2OverflowCommands.map(
                ({ icon, label, command, params }, idx) => (
                  <DropdownMenuItem
                    key={`${label}-${idx}`}
                    onClick={(e) => {
                      e.preventDefault();
                      if (command) runCommand(command, params);
                    }}
                    className="flex items-center gap-2"
                  >
                    {icon}
                    <span>{label}</span>
                  </DropdownMenuItem>
                )
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      ) : null}
    </div>
  );
};