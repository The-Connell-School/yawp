/**
 * Editing a filed material as a document, not as text with formatting a
 * teacher has to know the name of.
 *
 * The first version of this was a plain textarea over the raw Markdown, on
 * the reasoning that the PDF and the pptx exporter both parse that Markdown
 * directly, so keeping one source of truth meant keeping the teacher in it
 * too. That reasoning was right about the storage and wrong about the
 * surface: `**bold**` reads as a formatting language to figure out, and most
 * teachers have never had a reason to learn one. Word and Google Docs show
 * bold as bold; this should too.
 *
 * So the edit surface is a real rich-text editor (TipTap, already used for
 * the student document editor) — a teacher selects text and clicks Bold, the
 * text turns bold, no asterisks anywhere on screen. The Markdown storage
 * format does not change underneath it, because the PDF and pptx renderers
 * still need it: loading converts the saved Markdown to HTML with the same
 * renderer the read view already uses, and saving walks the editor's own
 * document back into Markdown (`editorDocToMarkdown`). The teacher never
 * sees either conversion.
 */
import { useEffect } from 'react';
import { useFetcher } from 'react-router';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Quote,
  X,
} from 'lucide-react';
import { cn } from '~/utils/misc';
import { Button } from '~/components/ui/button';
import { markdownToSafeHtml } from '~/components/ai-chat/assistant-markdown';
import { editorDocToMarkdown } from '~/domain/lesson-planner/material-richtext';

// Trimmed to what a handout actually uses and what the toolbar below offers.
// Anything StarterKit would otherwise add — code blocks, strikethrough — has
// no button here, so there is no way to reach a mark this editor cannot both
// show and save back out again.
const EXTENSIONS = [
  StarterKit.configure({
    codeBlock: false,
    code: false,
    strike: false,
    heading: { levels: [2, 3] },
  }),
];

const EDITOR_CLASS = cn(
  'min-h-[220px] rounded-md border bg-background px-4 py-3 text-[15px] leading-7',
  '[&_.ProseMirror]:outline-none',
  '[&_h2]:mb-1 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:first:mt-0',
  '[&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:first:mt-0',
  '[&_p]:my-2 [&_p]:first:mt-0 [&_p]:last:mb-0',
  '[&_strong]:font-semibold [&_em]:italic',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5',
  '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
  '[&_li]:my-1',
  '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
  '[&_hr]:my-4 [&_hr]:border-border'
);

function ToolbarButton({
  active,
  disabled,
  onClick,
  label,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()} // keep the editor's selection
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      data-testid={`material-editor-${label.toLowerCase().replace(/\s+/g, '-')}`}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground disabled:pointer-events-none disabled:opacity-40',
        active && 'bg-primary/10 text-primary hover:bg-primary/15'
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;
  return (
    <div className="flex items-center gap-0.5 rounded-md border bg-background p-0.5">
      <ToolbarButton
        label="Bold"
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold size={14} />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic size={14} />
      </ToolbarButton>
      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
      <ToolbarButton
        label="Heading"
        active={editor.isActive('heading', { level: 2 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
      >
        <Heading2 size={14} />
      </ToolbarButton>
      <ToolbarButton
        label="Quote"
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote size={14} />
      </ToolbarButton>
      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
      <ToolbarButton
        label="Bulleted list"
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List size={14} />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered size={14} />
      </ToolbarButton>
    </div>
  );
}

export function MaterialRichEditor({
  materialId,
  conversationId,
  content,
  onDone,
}: {
  materialId: string;
  conversationId: string;
  content: string;
  onDone: () => void;
}) {
  const fetcher = useFetcher();
  const saving = fetcher.state !== 'idle';
  const error =
    fetcher.state === 'idle' &&
    fetcher.data &&
    typeof fetcher.data === 'object' &&
    'error' in (fetcher.data as Record<string, unknown>)
      ? String((fetcher.data as Record<string, unknown>).error)
      : null;

  const editor = useEditor({
    extensions: EXTENSIONS,
    // The saved Markdown, read exactly the way the teacher already sees it
    // rendered — same parser, same sanitizer — so what opens in the editor
    // matches what was on the page a moment ago.
    content: markdownToSafeHtml(content),
    immediatelyRender: false,
    editorProps: {
      attributes: { 'aria-label': 'Edit material', class: EDITOR_CLASS },
    },
  });

  // Leave edit mode the moment the save actually lands — not on submit, so an
  // error keeps the draft on screen instead of quietly discarding it.
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data && !error) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  function save() {
    if (!editor) return;
    fetcher.submit(
      {
        intent: 'edit-material',
        conversationId,
        materialId,
        content: editorDocToMarkdown(editor.getJSON()),
      },
      { method: 'post', action: '/api/domain/lesson-planner/packet' }
    );
  }

  return (
    <div
      data-testid="material-editor"
      className="rounded-lg border bg-foreground/[0.02] p-3"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <Toolbar editor={editor} />
        <button
          type="button"
          onClick={onDone}
          aria-label="Cancel editing"
          className="rounded-md p-1 text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
        >
          <X size={14} />
        </button>
      </div>

      <EditorContent editor={editor} data-testid="material-editor-surface" />

      {error ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error === 'edited'
            ? 'Something changed before this saved. Try again.'
            : 'That did not save. Try again.'}
        </p>
      ) : null}

      <div className="mt-2 flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onDone} type="button">
          Cancel
        </Button>
        <Button
          size="sm"
          type="button"
          onClick={save}
          disabled={saving || !editor || editor.isEmpty}
          data-testid="material-editor-save"
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
