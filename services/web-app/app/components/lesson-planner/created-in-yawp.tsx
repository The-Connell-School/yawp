import { Check } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '~/components/ui/button';

/** "Created in Yawp! · Open" once a writing step is a real assignment (run 3). */
export function CreatedInYawp({ href }: { href: string }) {
  return (
    <Button asChild size="sm" variant="outline-primary" data-testid="created-in-yawp">
      <Link to={href}>
        <Check size={14} />
        Created in Yawp! · Open
      </Link>
    </Button>
  );
}