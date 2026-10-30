import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { cn } from '~/utils/misc';
import { useDevPanel } from './dev-panel-provider';
import type {
  FreeTierSessionEmailRow,
  FreeTierSessionLinkRow,
  FreeTierSessionSnapshot,
  FreeTierSessionStage,
} from './free-tier-session.server';
import {
  clearDevPanelFtPrefill,
  devPanelFtPrefillForEmail,
  writeDevPanelFtPrefill,
} from './free-tier-session-prefill';
import { DevPanelFreeTierAdvancedJumps } from './dev-panel-free-tier-advanced-jumps';

const STAGE_LABELS: Record<FreeTierSessionStage, string> = {
  none: 'none',
  form_filled: 'form filled',
  invite_sent: 'invite sent',
  pending: 'pending',
  approved: 'approved',
};

export function freeTierSessionStageLabel(stage: FreeTierSessionStage) {
  return STAGE_LABELS[stage];
}

function SessionLinkRow({
  row,
  onOpen,
  onCopy,
}: {
  row: FreeTierSessionLinkRow;
  onOpen: () => void;
  onCopy: () => void;
}) {
  const pending = !row.url;
  return (
    <div className="yawp-dev-panel-ft-link-row">
      <span className="yawp-dev-panel-ft-link-label">{row.label}</span>
      {pending ? (
        <span className="yawp-dev-panel-ft-muted">Not sent yet</span>
      ) : (
        <span className="yawp-dev-panel-ft-link-actions">
          <button type="button" className="yawp-dev-panel-ft-text-btn" onClick={onOpen}>
            Open
          </button>
          <button type="button" className="yawp-dev-panel-ft-text-btn" onClick={onCopy}>
            Copy
          </button>
        </span>
      )}
    </div>
  );
}

function SessionEmailRow({
  row,
  previewHtml,
  previewOpen,
  previewLoading,
  onTogglePreview,
}: {
  row: FreeTierSessionEmailRow;
  previewHtml: string | null;
  previewOpen: boolean;
  previewLoading: boolean;
  onTogglePreview: () => void;
}) {
  return (
    <div className="yawp-dev-panel-ft-email-block">
      <div className="yawp-dev-panel-ft-email-row">
        <div className="yawp-dev-panel-ft-email-copy">
          <span className="yawp-dev-panel-ft-email-subject">{row.subject}</span>
          <span className="yawp-dev-panel-ft-muted">{row.detail}</span>
        </div>
        <button
          type="button"
          className="yawp-dev-panel-ft-text-btn"
          onClick={onTogglePreview}
          disabled={previewLoading}
        >
          {previewLoading ? (
            <Loader2 className="size-3 animate-spin" aria-hidden />
          ) : previewOpen ? (
            'Close'
          ) : (
            'View'
          )}
        </button>
      </div>
      {previewOpen && previewHtml ? (
        <div
          className="yawp-dev-panel-ft-email-preview"
          data-testid="free-tier-email-preview"
        >
          <iframe
            title={`Email preview: ${row.subject}`}
            srcDoc={previewHtml}
            className="yawp-dev-panel-ft-email-preview-frame"
          />
        </div>
      ) : null}
    </div>
  );
}

export function DevPanelFreeTierSessionRunner({
  orgId,
  sectionOpen,
  advancedExpanded,
  onAdvancedExpandedChange,
  onStageChange,
}: {
  orgId: string | null;
  sectionOpen: boolean;
  advancedExpanded: boolean;
  onAdvancedExpandedChange: (open: boolean) => void;
  onStageChange?: (stage: FreeTierSessionStage) => void;
}) {
  const { state, updateForms } = useDevPanel();
  const followEmail = state.forms.freeTierFollowEmail ?? null;
  const formFilled = state.forms.freeTierFormFilled === true;
  const [snapshot, setSnapshot] = useState<FreeTierSessionSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [openPreviewId, setOpenPreviewId] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [mintLoading, setMintLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!sectionOpen) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (followEmail) params.set('followEmail', followEmail);
      if (formFilled) params.set('formFilled', '1');
      const response = await fetch(
        `/api/dev-panel/free-tier-session?${params.toString()}`,
        { credentials: 'same-origin' }
      );
      const body = await response.json().catch(() => null);
      if (response.ok && body?.snapshot) {
        setSnapshot(body.snapshot as FreeTierSessionSnapshot);
        onStageChange?.(body.snapshot.stage as FreeTierSessionStage);
      }
    } finally {
      setLoading(false);
    }
  }, [followEmail, formFilled, onStageChange, sectionOpen]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!sectionOpen) {
      setOpenPreviewId(null);
      setPreviewHtml(null);
      setStatusMessage(null);
    }
  }, [sectionOpen]);

  const mintAccount = async () => {
    setMintLoading(true);
    setStatusMessage(null);
    try {
      const response = await fetch('/api/dev-panel/free-tier-session', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'mint-email' }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.email) return;
      const email = String(body.email);
      const prefill = devPanelFtPrefillForEmail(email);
      writeDevPanelFtPrefill(window.localStorage, prefill);
      updateForms({
        freeTierFollowEmail: email,
        freeTierFormFilled: true,
      });
      setStatusMessage(
        `Create Account & Class is open and filled in for ${email}. Submit it on the page.`
      );
      window.open('/free', '_blank', 'noopener');
      await refresh();
    } finally {
      setMintLoading(false);
    }
  };

  const openCreateAccount = () => {
    if (!followEmail) {
      window.open('/free', '_blank', 'noopener');
      return;
    }
    const prefill = devPanelFtPrefillForEmail(followEmail);
    writeDevPanelFtPrefill(window.localStorage, prefill);
    setStatusMessage(
      `Create Account & Class is open and filled in for ${followEmail}. Submit it on the page.`
    );
    window.open('/free', '_blank', 'noopener');
  };

  const clearAndUnfollow = () => {
    clearDevPanelFtPrefill(window.localStorage);
    updateForms({
      freeTierFollowEmail: null,
      freeTierFormFilled: false,
    });
    setSnapshot(null);
    setOpenPreviewId(null);
    setPreviewHtml(null);
    setStatusMessage(null);
    onStageChange?.('none');
  };

  const openLink = (row: FreeTierSessionLinkRow) => {
    if (!row.url) return;
    window.location.assign(row.url);
  };

  const copyLink = async (row: FreeTierSessionLinkRow) => {
    if (!row.url) return;
    await navigator.clipboard.writeText(row.url);
  };

  const togglePreview = async (row: FreeTierSessionEmailRow) => {
    if (openPreviewId === row.id) {
      setOpenPreviewId(null);
      setPreviewHtml(null);
      return;
    }
    if (!followEmail) return;
    setOpenPreviewId(row.id);
    setPreviewLoading(true);
    setPreviewHtml(null);
    try {
      const response = await fetch('/api/dev-panel/free-tier-session', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'email-preview',
          emailLogId: row.id,
          followEmail,
        }),
      });
      const body = await response.json().catch(() => null);
      if (response.ok && body?.html) {
        setPreviewHtml(String(body.html));
      } else {
        setOpenPreviewId(null);
      }
    } finally {
      setPreviewLoading(false);
    }
  };

  const stage = snapshot?.stage ?? (followEmail ? (formFilled ? 'form_filled' : 'none') : 'none');
  const emails = snapshot?.emails ?? [];
  const links = snapshot?.links ?? [];

  return (
    <div className="yawp-dev-panel-free-tier-session" data-testid="free-tier-session-runner">
      <div className="yawp-dev-panel-ft-follow-block">
        {followEmail ? (
          <>
            <span className="yawp-dev-panel-ft-section-label">Following</span>
            <code className="yawp-dev-panel-ft-follow-email">{followEmail}</code>
          </>
        ) : (
          <span className="yawp-dev-panel-ft-muted">No test account followed</span>
        )}
      </div>

      <button
        type="button"
        className="yawp-dev-panel-ft-primary-btn"
        disabled={mintLoading}
        onClick={() => void mintAccount()}
      >
        {mintLoading ? 'Minting…' : 'New test account'}
      </button>

      {stage === 'approved' && links.find((row) => row.id === 'approved')?.url ? (
        <button
          type="button"
          className="yawp-dev-panel-ft-primary-btn"
          onClick={() => {
            const approved = links.find((row) => row.id === 'approved');
            if (approved) openLink(approved);
          }}
        >
          Open app as this teacher
        </button>
      ) : (
        <button
          type="button"
          className="yawp-dev-panel-ft-secondary-btn"
          onClick={openCreateAccount}
        >
          Open Create Account &amp; Class
        </button>
      )}

      {statusMessage ? (
        <div role="status" className="yawp-dev-panel-ft-status">
          {statusMessage}
        </div>
      ) : null}

      <div className="yawp-dev-panel-ft-section">
        <span className="yawp-dev-panel-ft-section-label">Links, as emailed</span>
        {links.map((row) => (
          <SessionLinkRow
            key={row.id}
            row={row}
            onOpen={() => void openLink(row)}
            onCopy={() => void copyLink(row)}
          />
        ))}
      </div>

      <div className="yawp-dev-panel-ft-section">
        <span className="yawp-dev-panel-ft-section-label">Emails</span>
        {loading && !emails.length ? (
          <span className="yawp-dev-panel-ft-muted">Loading…</span>
        ) : emails.length === 0 ? (
          <span className="yawp-dev-panel-ft-muted">No emails yet</span>
        ) : (
          emails.map((row) => (
            <SessionEmailRow
              key={row.id}
              row={row}
              previewOpen={openPreviewId === row.id}
              previewHtml={openPreviewId === row.id ? previewHtml : null}
              previewLoading={previewLoading && openPreviewId === row.id}
              onTogglePreview={() => void togglePreview(row)}
            />
          ))
        )}
      </div>

      {followEmail ? (
        <button
          type="button"
          className="yawp-dev-panel-ft-clear-btn"
          onClick={clearAndUnfollow}
        >
          Clear and unfollow
        </button>
      ) : null}

      <DevPanelFreeTierAdvancedJumps
        orgId={orgId}
        sectionOpen={sectionOpen}
        expanded={advancedExpanded}
        onExpandedChange={onAdvancedExpandedChange}
      />

      <span className="sr-only" aria-live="polite">
        Stage: {STAGE_LABELS[stage]}
      </span>
    </div>
  );
}
