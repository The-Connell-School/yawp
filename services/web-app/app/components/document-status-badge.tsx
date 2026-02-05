import { Badge } from './ui/badge';

type DocumentStatus = 'draft' | 'submitted' | 'graded';

interface DocumentStatusBadgeProps {
  status: DocumentStatus;
  className?: string;
}

export function DocumentStatusBadge({ status, className }: DocumentStatusBadgeProps) {
  const variants: Record<DocumentStatus, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
    draft: { label: 'Draft', variant: 'secondary' },
    submitted: { label: 'Submitted', variant: 'default' },
    graded: { label: 'Graded', variant: 'outline' },
  };

  const { label, variant } = variants[status];

  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  );
}
