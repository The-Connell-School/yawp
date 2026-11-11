/**
 * Writes static HTML snapshots of assignment copy-link UI states for Playwright
 * screenshots. Run: SCREENSHOT_HARNESS=1 bun run scripts/assignment-copy-ui-screenshot-harness.tsx
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { AssignmentCreatedSuccessPanel } from '~/components/assignments/assignment-created-success-panel';
import { AssignmentOpenLandingPage } from '~/components/assignments/assignment-open-landing-page';
import { AssignmentCopyLinkButton } from '~/components/assignments/assignment-copy-link-button';

if (!process.env.SCREENSHOT_HARNESS) {
  console.error('Set SCREENSHOT_HARNESS=1 to run the harness.');
  process.exit(0);
}

try {
  GlobalRegistrator.register();
} catch {
  // already registered
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const artifacts = '/opt/cursor/artifacts/ui-harness';
const webAppRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const cssPath = path.join(
  webAppRoot,
  'build/client/assets/app-D3PfU6WN.css'
);
const cssHref = `file://${cssPath}`;

fs.mkdirSync(artifacts, { recursive: true });

function mount(el: React.ReactElement) {
  const container = document.createElement('div');
  document.body.innerHTML = '';
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(MemoryRouter, null, el));
  });
  return container.innerHTML;
}

function writePage(name: string, bodyHtml: string, widthClass = '') {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="${cssHref}" />
  <style>
    body { margin: 0; background: #f7f5f2; font-family: system-ui, sans-serif; }
    .wrap { ${widthClass} margin: 0 auto; padding: 24px; }
  </style>
</head>
<body>
  <div class="wrap">${bodyHtml}</div>
</body>
</html>`;
  fs.writeFileSync(path.join(artifacts, `${name}.html`), html);
}

const openStates = [
  {
    name: 'app-open-not-in-class',
    data: {
      state: 'not-in-class' as const,
      classLabel: 'English 10 - Period 3',
    },
  },
  {
    name: 'app-open-not-posted',
    data: {
      state: 'not-posted' as const,
      opensAt: new Date('2026-11-03T13:00:00Z').toISOString(),
      assignmentTitle: 'Community Gardens — Thesis',
    },
  },
  {
    name: 'app-open-groups-not-open',
    data: {
      state: 'groups-not-open' as const,
      assignmentTitle: 'Community Gardens — Group thesis',
    },
  },
  {
    name: 'app-open-unavailable',
    data: { state: 'unavailable' as const },
  },
];

for (const { name, data } of openStates) {
  const html = mount(
    createElement(AssignmentOpenLandingPage, { data })
  );
  writePage(`${name}-desktop`, html, 'max-width: 1024px;');
  writePage(`${name}-mobile`, html, 'max-width: 390px;');
}

const successStates = [
  {
    name: 'app-builder-success-solo-one',
    state: {
      assignmentId: 'test-asgn-1',
      title: 'Community Gardens — Thesis',
      assignmentTypeTitle: 'Thesis Statement',
      classLabels: ['English 10 - Period 3'],
      collaborationEnabled: false,
    },
  },
  {
    name: 'app-builder-success-solo-multi',
    state: {
      assignmentId: 'test-asgn-2',
      title: 'Community Gardens — Thesis',
      assignmentTypeTitle: 'Thesis Statement',
      classLabels: ['Period 3', 'Period 5', 'Period 2'],
      collaborationEnabled: false,
    },
  },
  {
    name: 'app-builder-success-collab',
    state: {
      assignmentId: 'test-asgn-3',
      title: 'Community Gardens — Group thesis',
      assignmentTypeTitle: 'Thesis Statement',
      classLabels: ['English 10 - Period 3'],
      collaborationEnabled: true,
      nextStep: { url: '/app/groups', classCount: 1 },
    },
  },
  {
    name: 'app-builder-success-partial-warning',
    state: {
      assignmentId: 'test-asgn-4',
      title: 'Community Gardens — Thesis',
      assignmentTypeTitle: 'Thesis Statement',
      classLabels: ['English 10 - Period 3'],
      collaborationEnabled: false,
      saveForReuseWarning: true,
    },
  },
];

for (const { name, state } of successStates) {
  const html = mount(
    createElement(AssignmentCreatedSuccessPanel, {
      state,
      onDone: () => {},
      onSetUpGroups: () => {},
    })
  );
  writePage(`${name}-desktop`, html, 'max-width: 520px;');
  writePage(`${name}-mobile`, html, 'max-width: 390px;');
}

const copyButtonDefault = mount(
  createElement(AssignmentCopyLinkButton, {
    copied: false,
    onCopy: () => {},
  })
);
writePage('app-detail-copy-default-desktop', copyButtonDefault);
writePage('app-detail-copy-copied-desktop', mount(
  createElement(AssignmentCopyLinkButton, {
    copied: true,
    onCopy: () => {},
  })
));
writePage('app-detail-copy-collab-tooltip-desktop', mount(
  createElement(AssignmentCopyLinkButton, {
    copied: false,
    onCopy: () => {},
    collabGroupsPendingTooltip:
      'Students can open it after groups are opened',
  })
));

console.log('Wrote harness HTML to', artifacts);
