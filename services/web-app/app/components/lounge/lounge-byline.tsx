import type { LoungeByline as Byline } from '~/domain/lounge/lounge.server';

export function LoungeByline({ byline, when }: { byline: Byline; when?: string }) {
  return (
    <span className="text-sm text-muted-foreground">
      <span className="font-medium text-foreground">{byline.name}</span>
      {byline.detail ? <> · {byline.detail}</> : null}
      {when ? <> · {when}</> : null}
    </span>
  );
}
