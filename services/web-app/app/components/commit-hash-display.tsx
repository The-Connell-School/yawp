import { useOptionalUser } from '../hooks/useUser.ts';

interface CommitHashDisplayProps {
  commitHash?: string;
}

export function CommitHashDisplay({ commitHash }: CommitHashDisplayProps) {
  const user = useOptionalUser();

  if (!user?.isAdmin || !commitHash) {
    return null;
  }

  const shortHash = commitHash.slice(0, 7);

  return (
    <div className="fixed bottom-4 right-4 z-20 text-xs text-muted-foreground font-mono select-none">
      V.{shortHash}
    </div>
  );
}