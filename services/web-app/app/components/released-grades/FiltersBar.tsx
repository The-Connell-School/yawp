import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router';

type StudentOption = { id: string; name: string };

function toDateInputValue(s: string | null): string {
  if (!s) return '';
  return s; // already YYYY-MM-DD per the parser contract
}

export function FiltersBar({
  classId,
  view,
  studentOptions,
}: {
  classId: string;
  view: 'byAssignment' | 'byStudent';
  studentOptions: StudentOption[];
}) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams);
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
    navigate(
      `/app/my-classes/${classId}/released-grades?${next.toString()}`
    );
  }

  function toggleStudent(id: string) {
    const current = (searchParams.get('students') ?? '')
      .split(',')
      .filter(Boolean);
    const set = new Set(current);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    setParam(
      'students',
      set.size === 0 ? null : Array.from(set).join(',')
    );
  }

  function clearAll() {
    const next = new URLSearchParams();
    if (view === 'byStudent') next.set('view', 'byStudent');
    navigate(
      `/app/my-classes/${classId}/released-grades?${next.toString()}`
    );
  }

  const selectedStudents = (searchParams.get('students') ?? '')
    .split(',')
    .filter(Boolean);
  const hasFilters =
    searchParams.has('from') ||
    searchParams.has('to') ||
    selectedStudents.length > 0 ||
    searchParams.has('minGrade') ||
    searchParams.has('maxGrade');

  return (
    <div className="border-b py-3">
      <button
        className="text-sm underline"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        Filters {hasFilters ? '(active)' : ''}
      </button>
      {open ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col text-xs">
            <span className="mb-1 text-muted-foreground">Released from</span>
            <input
              type="date"
              value={toDateInputValue(searchParams.get('from'))}
              onChange={(e) => setParam('from', e.target.value || null)}
              className="rounded border px-2 py-1"
            />
          </label>
          <label className="flex flex-col text-xs">
            <span className="mb-1 text-muted-foreground">Released to</span>
            <input
              type="date"
              value={toDateInputValue(searchParams.get('to'))}
              onChange={(e) => setParam('to', e.target.value || null)}
              className="rounded border px-2 py-1"
            />
          </label>
          <label className="flex flex-col text-xs">
            <span className="mb-1 text-muted-foreground">Min grade</span>
            <input
              type="number"
              min={0}
              max={100}
              value={searchParams.get('minGrade') ?? ''}
              onChange={(e) => setParam('minGrade', e.target.value || null)}
              className="rounded border px-2 py-1"
            />
          </label>
          <label className="flex flex-col text-xs">
            <span className="mb-1 text-muted-foreground">Max grade</span>
            <input
              type="number"
              min={0}
              max={100}
              value={searchParams.get('maxGrade') ?? ''}
              onChange={(e) => setParam('maxGrade', e.target.value || null)}
              className="rounded border px-2 py-1"
            />
          </label>
          <fieldset className="col-span-full">
            <legend className="mb-1 text-xs text-muted-foreground">
              Students
            </legend>
            <div className="flex flex-wrap gap-2">
              {studentOptions.map((s) => {
                const checked = selectedStudents.includes(s.id);
                return (
                  <label
                    key={s.id}
                    className={`cursor-pointer rounded border px-2 py-1 text-xs ${checked ? 'bg-accent' : ''}`}
                  >
                    <input
                      type="checkbox"
                      className="mr-1"
                      checked={checked}
                      onChange={() => toggleStudent(s.id)}
                    />
                    {s.name}
                  </label>
                );
              })}
            </div>
          </fieldset>
          {hasFilters ? (
            <button className="text-xs underline" onClick={clearAll}>
              Clear all
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
