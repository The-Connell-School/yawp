/**
 * SSR fixture for one teacher pending forward-error frame (full card chrome).
 * Run: bun run scripts/pending-admin-copy-evidence.ssr.tsx <outDir> <before-main|after-head> <reason>
 */
import * as router from 'react-router';
import { mock } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  mockCardPageChromeForSsr,
  renderWithCardPageChrome,
} from '~/components/card-page-chrome.ssr-test-setup';
import { approvalForwardError } from '../app/routes/free-tier/ApprovalForwardForm';

const slugByReason: Record<string, string> = {
  same_as_teacher: 'pending-same-as-teacher',
  same_administrator: 'pending-same-administrator',
  chain_cap: 'pending-chain-cap',
  email_failed: 'pending-email-failed',
};

function installRouterMocks(reason: string) {
  mock.module('react-router', () => ({
    ...router,
    useLoaderData: () => ({
      app: {
        status: 'SENT',
        name: 'Jordan Rivera',
        schoolName: 'Lincoln High School',
      },
      pending: {
        adminName: 'Dr. Patel',
        adminEmail: 'patel@example.test',
      },
      lastFailedEmail: null,
      showExploreClassroom: true,
      approvalEmailFrom: 'transactional-from@example.org',
      teacherDenied: null,
      askOpen: false,
      approvalV2: {
        enabled: true,
        approval: {
          id: 'current',
          adminName: 'Dr. Patel',
          adminEmail: 'patel@example.test',
        },
        firstSentAt: new Date('2026-10-14'),
      },
    }),
    useActionData: () => ({ ok: false as const, reason }),
    useNavigation: () => ({ state: 'idle' }),
    Form: ({ children, ...props }: React.ComponentProps<'form'>) => (
      <form {...props}>{children}</form>
    ),
    Link: ({ children, ...props }: React.ComponentProps<'a'>) => (
      <a {...props}>{children}</a>
    ),
  }));
}

async function main() {
  const outDir = process.argv[2];
  const mode = process.argv[3];
  const reason = process.argv[4];
  if (!outDir || !mode || !reason || !(reason in slugByReason)) {
    console.error(
      'Usage: bun run scripts/pending-admin-copy-evidence.ssr.tsx <outDir> <before-main|after-head> <reason>'
    );
    process.exit(1);
  }
  if (mode !== 'before-main' && mode !== 'after-head') {
    console.error('mode must be before-main or after-head');
    process.exit(1);
  }

  mockCardPageChromeForSsr();
  installRouterMocks(reason);

  if (mode === 'before-main') {
    mock.module('~/domain/free-tier/admin-approval-copy', () => ({
      teacherPendingForwardError: (args: { reason: string }) =>
        approvalForwardError(args.reason),
    }));
  }

  const { default: Page } = await import(
    '../app/routes/app.free-tier.pending/route.tsx'
  );
  const body = renderWithCardPageChrome(<Page />);
  const slug = slugByReason[reason]!;
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, `${slug}-${mode}.html`), body, 'utf8');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
