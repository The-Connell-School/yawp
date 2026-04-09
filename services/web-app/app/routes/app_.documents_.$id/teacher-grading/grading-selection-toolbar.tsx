import { MessageSquare } from 'lucide-react';
import { Button } from '~/components/ui/button';

type Props = {
  rect: DOMRect;
  onCommentClick: () => void;
};

export function GradingSelectionToolbar({ rect, onCommentClick }: Props) {
  return (
    <div
      className="fixed z-50 flex items-center gap-1 rounded-full border bg-white px-1 py-0.5 shadow-lg"
      style={{
        top: rect.top - 40,
        left: rect.left + rect.width / 2 - 50,
        transform: 'translateX(-50%)',
      }}
    >
      <Button
        size="sm"
        variant="ghost"
        className="h-7 gap-1.5 px-2 text-xs"
        onClick={onCommentClick}
      >
        <MessageSquare className="h-3.5 w-3.5" />
        Comment
      </Button>
    </div>
  );
}
