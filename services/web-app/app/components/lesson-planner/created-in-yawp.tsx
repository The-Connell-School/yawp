import { Check } from 'lucide-react';
import { Link } from 'react-router';

/** "Created in Yawp! · Open" once a writing step is a real assignment (run 3). */
export function CreatedInYawp({ href }: { href: string }) {
  return (
    <Link
      to={href}
      data-testid="created-in-yawp"
      className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary transition hover:bg-primary/15"
    >
      <Check size={14} />
      Created in Yawp! · Open
    </Link>
  );
}
