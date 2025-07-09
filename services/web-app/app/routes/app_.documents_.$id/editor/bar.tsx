import { useFetcher } from 'react-router';
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
import { camelCase } from '~/utils/camelCase';
import { cn } from '~/utils/misc';
import { type Command, commands, COMMAND_STYLE } from './commands';
import { HistoryManager } from './history-manager';
import { type OperationTracker } from './operation-tracker';
import { DocumentHistoryViewer } from './document-history-viewer';

const DROPDOWN_WIDTH = 32;
const BUTTON_WIDTH = 32;
const GAP_WIDTH = 3;
const PADDING = 8;

export type BarProps = {
  editor: Editor | null;
  documentId: string;
  operationTracker: OperationTracker | null;
  historyManager: HistoryManager | null;
};

export const Bar = ({ editor, documentId, operationTracker, historyManager }: BarProps) => {
  const [visibleCommands, setVisibleCommands] = useState(commands);
  const [hiddenCommands, setHiddenCommands] = useState<Command[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const createDocumentCommentFetcher = useFetcher<{ id: string }>({
    key: 'create-document-comment',
  });

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

  return (
    <div
      className="bg-muted-background flex w-full items-center gap-0.5 border-b p-1"
      ref={containerRef}
    >
      {visibleCommands.map(
        ({ icon, label, command, params, activeId, override }) => {
          // Handle custom undo/redo buttons
          if (label === 'Undo' && historyManager.current) {
            return (
              <Tooltip text={label} delayDuration={300} key={label}>
                <div
                  onClick={() => {
                    if (editor && historyManager.current) {
                      historyManager.current.undo(editor);
                      if (operationTracker) {
                        // Track the undo operation
                        operationTracker.addUndoOperation({
                          id: `undo-${Date.now()}`,
                          documentId,
                          userId: '',
                          position: 0,
                          timestamp: new Date(),
                          type: 'undo',
                        });
                      }
                    }
                  }}
                  className={cn(COMMAND_STYLE, {
                    'opacity-50 cursor-not-allowed':
                      !historyManager.current?.canUndo(),
                  })}
                >
                  {icon ?? label}
                </div>
              </Tooltip>
            );
          }

          if (label === 'Redo' && historyManager.current) {
            return (
              <Tooltip text={label} delayDuration={300} key={label}>
                <div
                  onClick={() => {
                    if (editor && historyManager.current) {
                      historyManager.current.redo(editor);
                      if (operationTracker) {
                        // Track the redo operation
                        operationTracker.addRedoOperation({
                          id: `redo-${Date.now()}`,
                          documentId,
                          userId: '',
                          position: 0,
                          timestamp: new Date(),
                          type: 'redo',
                        });
                      }
                    }
                  }}
                  className={cn(COMMAND_STYLE, {
                    'opacity-50 cursor-not-allowed':
                      !historyManager.current?.canRedo(),
                  })}
                >
                  {icon ?? label}
                </div>
              </Tooltip>
            );
          }

          // Default behavior for other commands
          return (
            override?.(editor) ?? (
              <Tooltip text={label} delayDuration={300} key={label}>
                <div
                  // @ts-ignore
                  onClick={() => editor.chain().focus()[command](params).run()}
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
            )
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
      <DocumentHistoryViewer 
        documentId={documentId} 
        editor={editor} 
        historyManager={historyManager} 
      />
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
    </div>
  );
};
