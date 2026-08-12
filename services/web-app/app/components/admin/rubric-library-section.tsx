import { useState } from 'react';
import { useFetcher } from 'react-router';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { suggestRubricIdentity } from '~/domain/rubrics/rubric-schema';

export type RubricOption = {
  id: string;
  name: string;
  title: string;
  json: string;
};

const NO_RUBRIC_VALUE = '__none__';

/**
 * Rubrics are written outside the app and pasted in whole. This replaces the
 * field-by-field builder: an admin picks which rubric an assignment type uses,
 * reads it, or pastes a new one. Nothing here edits a rubric in place — the
 * JSON is both the format and the way a rubric moves between environments.
 */
export function RubricLibrarySection({
  assignmentTypeId,
  rubrics,
  selectedRubricId,
}: {
  assignmentTypeId: string;
  rubrics: RubricOption[];
  selectedRubricId: string | null;
}) {
  const fetcher = useFetcher();
  const [isPasting, setIsPasting] = useState(false);
  const [pastedJson, setPastedJson] = useState('');
  const [pastedTitle, setPastedTitle] = useState('');
  const [pastedName, setPastedName] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);

  const selected =
    rubrics.find((rubric) => rubric.id === selectedRubricId) ?? null;

  // A rubric that names itself should not have to be named again.
  const handleJsonChange = (value: string) => {
    setPastedJson(value);
    setParseError(null);

    if (!value.trim()) return;
    try {
      const identity = suggestRubricIdentity(JSON.parse(value));
      if (identity.title && !pastedTitle) setPastedTitle(identity.title);
      if (identity.name && !pastedName) setPastedName(identity.name);
    } catch {
      // Half-typed JSON is normal while pasting; only saving reports errors.
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="rubric-library-select">Rubric</Label>
        <Select
            name="rubricId"
            defaultValue={selectedRubricId ?? NO_RUBRIC_VALUE}
            onValueChange={(value) => {
              const form = new FormData();
              form.set('intent', 'select');
              form.set('assignmentTypeId', assignmentTypeId);
              form.set('rubricId', value === NO_RUBRIC_VALUE ? '' : value);
              fetcher.submit(form, {
                method: 'POST',
                action: '/api/admin/rubrics',
              });
            }}
          >
            <SelectTrigger
              id="rubric-library-select"
              data-testid="rubric-library-select"
            >
              <SelectValue placeholder="Choose a rubric" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_RUBRIC_VALUE}>
                Built-in default for this assignment type
              </SelectItem>
              {rubrics.map((rubric) => (
                <SelectItem key={rubric.id} value={rubric.id}>
                  {rubric.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        <p className="text-sm text-muted-foreground">
          {selected
            ? `Grading uses “${selected.title}” for this assignment type.`
            : 'Grading uses the built-in rubric for this assignment type.'}
        </p>
      </div>

      {selected ? (
        <details className="rounded-lg border bg-muted/30 p-3">
          <summary className="cursor-pointer text-sm font-medium">
            View {selected.title}
          </summary>
          <pre
            data-testid="rubric-library-json"
            className="mt-3 max-h-96 overflow-auto rounded bg-background p-3 text-xs leading-relaxed"
          >
            {selected.json}
          </pre>
        </details>
      ) : null}

      {isPasting ? (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="space-y-2">
            <Label htmlFor="rubric-paste-json">Rubric JSON</Label>
            <Textarea
              id="rubric-paste-json"
              data-testid="rubric-paste-json"
              rows={10}
              value={pastedJson}
              onChange={(event) => handleJsonChange(event.target.value)}
              placeholder='{ "name": "...", "title": "...", "rubric": { "categories": [] } }'
              className="font-mono text-xs"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="rubric-paste-title">Title</Label>
              <Input
                id="rubric-paste-title"
                data-testid="rubric-paste-title"
                value={pastedTitle}
                onChange={(event) => setPastedTitle(event.target.value)}
                placeholder="Suggested from the JSON"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rubric-paste-name">Label</Label>
              <Input
                id="rubric-paste-name"
                data-testid="rubric-paste-name"
                value={pastedName}
                onChange={(event) => setPastedName(event.target.value)}
                placeholder="thesis-driven-essay"
              />
              <p className="text-xs text-muted-foreground">
                Matches this rubric to the same one in another environment.
              </p>
            </div>
          </div>

          {parseError ? (
            <p
              data-testid="rubric-paste-error"
              className="text-sm text-destructive"
            >
              {parseError}
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              data-testid="rubric-paste-save"
              onClick={() => {
                if (!pastedJson.trim()) {
                  setParseError('Paste the rubric JSON first.');
                  return;
                }
                try {
                  JSON.parse(pastedJson);
                } catch {
                  setParseError('That is not valid JSON.');
                  return;
                }

                const form = new FormData();
                form.set('intent', 'create');
                form.set('schemaJson', pastedJson);
                form.set('title', pastedTitle);
                form.set('name', pastedName);
                fetcher.submit(form, {
                  method: 'POST',
                  action: '/api/admin/rubrics',
                });
                setIsPasting(false);
                setPastedJson('');
                setPastedTitle('');
                setPastedName('');
              }}
            >
              Save rubric
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setIsPasting(false);
                setParseError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="rubric-paste-open"
          onClick={() => setIsPasting(true)}
        >
          Paste in a new rubric
        </Button>
      )}

      {fetcher.data && typeof fetcher.data === 'object' &&
      'error' in fetcher.data ? (
        <p className="text-sm text-destructive">
          {String((fetcher.data as { error: unknown }).error)}
        </p>
      ) : null}
    </div>
  );
}
