import { Check, ChevronDown, Loader2, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '~/utils/misc';

export type DevPanelOrgOption = {
  id: string;
  name: string;
  kind?: string;
};

export function DevPanelOrgPicker({
  orgs,
  value,
  onChange,
  loading = false,
}: {
  orgs: DevPanelOrgOption[];
  value: string | null;
  onChange: (orgId: string) => void;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = orgs.find((org) => org.id === value) ?? orgs[0] ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter((org) => org.name.toLowerCase().includes(q));
  }, [orgs, query]);

  if (loading) {
    return (
      <div className="yawp-dev-panel-org-pe3">
        <span className="yawp-dev-panel-org-pe3-section-label">Organization</span>
        <p role="status" className="yawp-dev-panel-org-pe3-loading">
          <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
          Loading organizations…
        </p>
      </div>
    );
  }

  if (orgs.length <= 1) {
    const only = orgs[0];
    return (
      <div className="yawp-dev-panel-org-pe3">
        <span className="yawp-dev-panel-org-pe3-section-label">Organization</span>
        <div className="yawp-dev-panel-org-pe3-single" aria-live="polite">
          {only?.name ?? 'No organization'}
        </div>
      </div>
    );
  }

  return (
    <div className="yawp-dev-panel-org-pe3">
      <span className="yawp-dev-panel-org-pe3-section-label">Organization</span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'yawp-dev-panel-org-pe3-trigger',
          open && 'yawp-dev-panel-org-pe3-trigger-open'
        )}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="truncate">{selected?.name ?? 'Choose organization'}</span>
        <ChevronDown className="size-3 shrink-0 opacity-70" aria-hidden="true" />
      </button>
      {open ? (
        <div
          className="yawp-dev-panel-org-pe3-panel"
          role="listbox"
          aria-label="Organization"
        >
          <div className="yawp-dev-panel-org-pe3-search">
            <Search className="size-3 shrink-0" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search orgs"
              aria-label="Search orgs"
              className="yawp-dev-panel-org-pe3-search-input"
            />
          </div>
          <div className="yawp-dev-panel-org-pe3-divider" aria-hidden="true" />
          {filtered.length === 0 ? (
            <p className="yawp-dev-panel-org-pe3-empty">No org found.</p>
          ) : (
            filtered.map((org) => {
              const isSelected = org.id === (value ?? selected?.id);
              return (
                <button
                  key={org.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className="yawp-dev-panel-org-pe3-option"
                  onClick={() => {
                    onChange(org.id);
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  <span className="yawp-dev-panel-org-pe3-option-check" aria-hidden="true">
                    {isSelected ? <Check className="size-3" /> : null}
                  </span>
                  <span className="yawp-dev-panel-org-pe3-option-name">{org.name}</span>
                  {org.kind ? (
                    <span className="yawp-dev-panel-org-pe3-option-kind">{org.kind}</span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
