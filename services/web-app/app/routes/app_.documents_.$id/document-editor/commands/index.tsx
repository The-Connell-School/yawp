import {
  type ChainedCommands,
  type Editor as TiptapEditor,
} from '@tiptap/react';
import {
  BoldIcon,
  ItalicIcon,
  StrikethroughIcon,
  Trash,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  AlignVerticalSpaceAround,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Check,
  ListOrderedIcon,
  QuoteIcon,
  Palette,
} from 'lucide-react';
import { type ReactNode } from 'react';
import { ListBulletIcon, DividerHorizontalIcon } from '~/components/icons.js';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '~/components/ui/dropdown-menu.js';
import { Tooltip } from '~/components/ui/tooltip.js';
import { cn } from '~/utils/misc.js';

export const COMMAND_STYLE =
  'p-2 hover:bg-foreground/15 cursor-pointer rounded-sm transition-colors h-8 flex items-center justify-center';

export type Command = {
  icon?: ReactNode;
  label?: string;
  command?: keyof ChainedCommands;
  params?: any;
  checkDisabled?: boolean;
  disableActiveStyles?: boolean;
  activeId?: string;
  isActive?: (editor: TiptapEditor) => boolean;
  override?: (editor: TiptapEditor) => ReactNode;
};

const COLOR_OPTIONS = {
  black: '#000000',
  blue: '#2563eb',
  red: '#dc2626',
  green: '#16a34a',
};

export const commands: Command[] = [
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
        <Tooltip text="Text Color" delayDuration={300}>
          <DropdownMenuTrigger>
            <div className={COMMAND_STYLE}>
              <Palette className="h-4 w-4" />
            </div>
          </DropdownMenuTrigger>
        </Tooltip>
        <DropdownMenuContent className="grid w-fit min-w-0 gap-1">
          {Object.entries(COLOR_OPTIONS).map(([color]) => (
            <DropdownMenuItem
              key={color}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                editor.chain().focus().setColor(color).run();
              }}
              className={cn(COMMAND_STYLE, 'flex w-[65px] items-center gap-3', {
                'bg-muted':
                  color === COLOR_OPTIONS.black
                    ? !editor.isActive('textStyle', {
                        color: COLOR_OPTIONS.blue,
                      }) &&
                      !editor.isActive('textStyle', {
                        color: COLOR_OPTIONS.red,
                      }) &&
                      !editor.isActive('textStyle', {
                        color: COLOR_OPTIONS.green,
                      })
                    : editor.isActive('textStyle', { color }),
              })}
            >
              <Check
                className={cn('h-4 w-4', {
                  invisible:
                    color === COLOR_OPTIONS.black
                      ? editor.isActive('textStyle', {
                          color: COLOR_OPTIONS.blue,
                        }) ||
                        editor.isActive('textStyle', {
                          color: COLOR_OPTIONS.red,
                        }) ||
                        editor.isActive('textStyle', {
                          color: COLOR_OPTIONS.green,
                        })
                      : !editor.isActive('textStyle', {
                          color:
                            COLOR_OPTIONS[color as keyof typeof COLOR_OPTIONS],
                        }),
                })}
              />
              <span className="flex items-center gap-2">
                <div
                  className="h-4 w-4 rounded-full border border-gray-300"
                  style={{ backgroundColor: color }}
                />
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
  {
    icon: <Trash className="h-4 w-4" />,
    label: 'Clear marks',
    command: 'unsetAllMarks',
    disableActiveStyles: true,
  },
  {
    icon: <p className="px-1 text-xs">P</p>,
    label: 'Paragraph',
    command: 'setParagraph',
  },
  {
    label: 'H1',
    icon: <Heading1Icon className="h-4 w-4" />,
    command: 'toggleHeading',
    activeId: 'heading',
    params: { level: 1 },
  },
  {
    label: 'H2',
    icon: <Heading2Icon className="h-4 w-4" />,
    command: 'toggleHeading',
    activeId: 'heading',
    params: { level: 2 },
  },
  {
    label: 'H3',
    icon: <Heading3Icon className="h-4 w-4" />,
    command: 'toggleHeading',
    activeId: 'heading',
    params: { level: 3 },
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
          <Tooltip text="Align" delayDuration={300}>
            <DropdownMenuTrigger>
              <div
                className={cn(COMMAND_STYLE, {
                  'bg-muted': !isLeft,
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
    override: (editor) => (
      <DropdownMenu key="spacing">
        <Tooltip text="Spacing" delayDuration={300}>
          <DropdownMenuTrigger>
            <div className={COMMAND_STYLE}>
              <AlignVerticalSpaceAround className="h-4 w-4" />
            </div>
          </DropdownMenuTrigger>
        </Tooltip>
        <DropdownMenuContent className="grid w-fit min-w-0 gap-1">
          {['1', '1.15', '1.5', '2'].map((height) => (
            <DropdownMenuItem
              key={height}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                editor
                  .chain()
                  .focus()
                  .setLineHeight(height as any)
                  .run();
              }}
              className={cn(COMMAND_STYLE, 'flex w-[65px] items-center gap-3', {
                'bg-muted': editor.isActive('paragraph', {
                  lineHeight: height,
                }),
              })}
            >
              <Check
                className={cn('h-4 w-4', {
                  invisible: !editor.isActive('paragraph', {
                    lineHeight: height,
                  }),
                })}
              />
              <span>{height}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
  {
    icon: <ListBulletIcon className="h-4 w-4" />,
    label: 'Bullet list',
    command: 'toggleBulletList',
  },
  {
    icon: <ListOrderedIcon className="h-4 w-4" />,
    label: 'Ordered list',
    command: 'toggleOrderedList',
  },
  {
    icon: <QuoteIcon className="h-4 w-4" />,
    label: 'Blockquote',
    command: 'toggleBlockquote',
  },
  {
    icon: <DividerHorizontalIcon className="h-4 w-4" />,
    label: 'Horizontal rule',
    command: 'setHorizontalRule',
    disableActiveStyles: true,
  },
];
