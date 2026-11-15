import type { Editor } from '@tiptap/react';
import { Check, ChevronDown, Undo2, Redo2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Tooltip } from '~/components/ui/tooltip';
import { cn } from '~/utils/misc';
import { COMMAND_STYLE } from './commands';
import { USER_SOURCE_META } from './extensions/source-tracker';
import { TOOLBAR_SOURCE } from './use-pm-tripwire';

export type PageWidthMode = 'fit' | 'fixed';

const TEXT_STYLES = [
  { label: 'Normal text', action: (e: Editor) => e.chain().focus().setParagraph().run() },
  {
    label: 'Heading 1',
    action: (e: Editor) => e.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    label: 'Heading 2',
    action: (e: Editor) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    label: 'Heading 3',
    action: (e: Editor) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
] as const;

function runChain(editor: Editor, runner: (chain: ReturnType<Editor['chain']>) => void) {
  const chain = editor.chain().focus().setMeta(USER_SOURCE_META, TOOLBAR_SOURCE);
  runner(chain);
  chain.run();
}

export function ToolbarUndoRedo({ editor }: { editor: Editor }) {
  return (
    <>
      <Tooltip text="Undo" delayDuration={300}>
        <button
          type="button"
          aria-label="Undo"
          className={COMMAND_STYLE}
          disabled={!editor.can().chain().focus().undo().run()}
          onClick={() => runChain(editor, (c) => c.undo())}
        >
          <Undo2 className="h-4 w-4" />
        </button>
      </Tooltip>
      <Tooltip text="Redo" delayDuration={300}>
        <button
          type="button"
          aria-label="Redo"
          className={COMMAND_STYLE}
          disabled={!editor.can().chain().focus().redo().run()}
          onClick={() => runChain(editor, (c) => c.redo())}
        >
          <Redo2 className="h-4 w-4" />
        </button>
      </Tooltip>
      <span
        aria-hidden
        className="mx-1 h-[18px] w-px bg-[hsl(51.4286_7.8652%_82.549%)]"
      />
    </>
  );
}

export function ToolbarFitWidth({
  mode,
  onChange,
}: {
  mode: PageWidthMode;
  onChange: (mode: PageWidthMode) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            COMMAND_STYLE,
            'h-8 w-[96px] justify-between gap-1 px-2 text-[13px] font-normal'
          )}
          data-testid="editor-fit-width"
        >
          Fit width
          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem
          onClick={() => onChange('fit')}
          className="flex items-center gap-2"
        >
          <Check className={cn('h-4 w-4', mode !== 'fit' && 'invisible')} />
          Fit width
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onChange('fixed')}
          className="flex items-center gap-2"
        >
          <Check className={cn('h-4 w-4', mode !== 'fixed' && 'invisible')} />
          Fixed width
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function activeTextStyleLabel(editor: Editor) {
  if (editor.isActive('heading', { level: 1 })) return 'Heading 1';
  if (editor.isActive('heading', { level: 2 })) return 'Heading 2';
  if (editor.isActive('heading', { level: 3 })) return 'Heading 3';
  return 'Normal text';
}

export function ToolbarNormalText({ editor }: { editor: Editor }) {
  const label = activeTextStyleLabel(editor);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            COMMAND_STYLE,
            'h-8 w-[118px] justify-between gap-1 px-2 text-[13px] font-normal'
          )}
          data-testid="editor-normal-text"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {TEXT_STYLES.map((style) => (
          <DropdownMenuItem
            key={style.label}
            onClick={() => style.action(editor)}
            className="flex items-center gap-2"
          >
            <Check
              className={cn(
                'h-4 w-4',
                label !== style.label && 'invisible'
              )}
            />
            {style.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}