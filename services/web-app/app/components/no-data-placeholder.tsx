import { type ReactNode } from 'react';

type Props = { title: ReactNode; subtitle: ReactNode };

export const NoDataPlaceholder = ({ title, subtitle }: Props) => {
  return (
    <div className="flex w-full flex-col items-center justify-center rounded-lg border border-dashed p-5">
      <h4 className="text-foreground/85">{title}</h4>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
};
