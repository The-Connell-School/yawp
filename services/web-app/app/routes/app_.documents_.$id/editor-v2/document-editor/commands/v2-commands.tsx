import type { Editor as TiptapEditor } from '@tiptap/react';
import {
  BoldIcon,
  ItalicIcon,
  StrikethroughIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Check,
  ListOrderedIcon,
  QuoteIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { DividerHorizontalIcon, ListBulletIcon } from '~/components/icons.js';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '~/components/ui/dropdown-menu.js';
import { Tooltip } from '~/components/ui/tooltip.js';
import { cn } from '~/utils/misc.js';
import { COMMAND_STYLE, type Command } from './index';

const COLOR_OPTIONS = {
  black: '#000000',
  blue: '#2563eb',
  red: '#dc2626',
  green: '#16a34a',
};

export const v2ToolbarCommands: Command[] = [
  {
    icon: <BoldIcon className="h-4 w-4" />,
    label: 'Bold',
    command: 'toggleBold',
    checkDisabled: true,
  },
  {
    icon: <ItalicIcon className="h-4 w-4" />,
    label: 'Italic',
    command: 'toggleItalic',
    checkDisabled: true,
  },
  {
    icon: <StrikethroughIcon className="h-4 w-4" />,
    label: 'Strike',
    command: 'toggleStrike',
    checkDisabled: true,
  },
  {
    override: (editor) => (
      <DropdownMenu key="text-color">
        <Tooltip text="Text color" delayDuration={300}>
          <DropdownMenuTrigger aria-label="Text color">
            <div className={COMMAND_STYLE}>
              <span className="text-sm font-semibold underline decoration-2 underline-offset-2">
                A
              </span>
            </div>
          </DropdownMenuTrigger>
        </Tooltip>
        <DropdownMenuContent className="grid w-fit min-w-0 gap-1">
          {Object.entries(COLOR_OPTIONS).map(([color, hex]) => (
            <DropdownMenuItem
              key={color}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                editor.chain().focus().setColor(hex).run();
              }}
              className={cn(COMMAND_STYLE, 'flex w-[65px] items-center gap-3', {
                'bg-muted': editor.isActive('textStyle', { color: hex }),
              })}
            >
              <Check
                className={cn('h-4 w-4', {
                  invisible: !editor.isActive('textStyle', { color: hex }),
                })}
              />
              <span
                className="h-4 w-4 rounded-full border border-gray-300"
                style={{ backgroundColor: hex }}
              />
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
  {
    override: (editor) => {
      const alignments = [
        { value: 'left', label: 'Left', icon: <AlignLeft className="h-4 w-4" /> },
        {
          value: 'center',
          label: 'Center',
          icon: <AlignCenter className="h-4 w-4" />,
        },
        { value: 'right', label: 'Right', icon: <AlignRight className="h-4 w-4" /> },
      ] as const;
      const isLeft =
        !editor.isActive({ textAlign: 'center' }) &&
        !editor.isActive({ textAlign: 'right' }) &&
        !editor.isActive({ textAlign: 'justify' });

      return (
        <DropdownMenu key="text-align">
          <Tooltip text="Align left" delayDuration={300}>
            <DropdownMenuTrigger aria-label="Text alignment">
              <div
                className={cn(COMMAND_STYLE, {
                  'bg-foreground/20 hover:bg-foreground/20': !isLeft,
                })}
              >
                <AlignLeft className="h-4 w-4" />
              </div>
            </DropdownMenuTrigger>
          </Tooltip>
          <DropdownMenuContent className="grid w-fit min-w-0 gap-1">
            {alignments.map((alignment) => {
              const isActive =
                alignment.value === 'left'
                  ? isLeft
                  : editor.isActive({ textAlign: alignment.value });

              return (
                <DropdownMenuItem
                  key={alignment.value}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    editor.chain().focus().setTextAlign(alignment.value).run();
                  }}
                  className={cn(
                    COMMAND_STYLE,
                    'flex w-[120px] items-center gap-2 justify-start',
                    { 'bg-muted': isActive }
                  )}
                >
                  <Check className={cn('h-4 w-4', { invisible: !isActive })} />
                  {alignment.icon}
                  <span>{alignment.label}</span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
  {
    icon: <ListBulletIcon className="h-4 w-4" />,
    label: 'Bulleted list',
    command: 'toggleBulletList',
  },
  {
    icon: <ListOrderedIcon className="h-4 w-4" />,
    label: 'Numbered list',
    command: 'toggleOrderedList',
  },
  {
    icon: <QuoteIcon className="h-4 w-4" />,
    label: 'Quote',
    command: 'toggleBlockquote',
  },
];

export const v2OverflowCommands: Command[] = [
  {
    icon: <DividerHorizontalIcon className="h-4 w-4" />,
    label: 'Horizontal rule',
    command: 'setHorizontalRule',
    disableActiveStyles: true,
  },
];