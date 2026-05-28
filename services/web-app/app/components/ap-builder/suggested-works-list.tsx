import * as React from 'react';
import { cn } from '~/utils/misc';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';

export interface SuggestedWork {
  title: string;
  author: string;
}

interface SuggestedWorksListProps {
  works: SuggestedWork[];
  onWorksChange: (works: SuggestedWork[]) => void;
  className?: string;
}

export function SuggestedWorksList({
  works,
  onWorksChange,
  className,
}: SuggestedWorksListProps) {
  const handleChange = (
    index: number,
    field: keyof SuggestedWork,
    value: string
  ) => {
    const updated = [...works];
    updated[index] = { ...updated[index], [field]: value };
    onWorksChange(updated);
  };

  const handleAdd = () => {
    onWorksChange([...works, { title: '', author: '' }]);
  };

  const handleRemove = (index: number) => {
    onWorksChange(works.filter((_, i) => i !== index));
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">
          Suggested Works{' '}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Button type="button" variant="outline" size="sm" onClick={handleAdd}>
          Add Work
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Students may choose from this list or select their own work of literary
        merit.
      </p>

      {works.length > 0 && (
        <div className="space-y-2">
          {works.map((work, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={work.title}
                onChange={(e) => handleChange(index, 'title', e.target.value)}
                placeholder="Title"
                className="flex-1"
              />
              <Input
                value={work.author}
                onChange={(e) => handleChange(index, 'author', e.target.value)}
                placeholder="Author"
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleRemove(index)}
                className="text-xs text-destructive hover:text-destructive"
              >
                ×
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
