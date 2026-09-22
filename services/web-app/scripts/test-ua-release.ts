/* eslint-disable no-console */
import { spawnSync } from 'node:child_process';

type Command = {
  label: string;
  executable: string;
  args: string[];
};

const focusedCommands: Command[] = [
  {
    label: 'billing, Checkout, webhook, refund, and dispute contracts',
    executable: 'bun',
    args: [
      'test',
      'app/domain/student-license/student-license.server.test.ts',
      'app/routes/billing.ua.success/route.test.ts',
      'app/routes/billing.ua/route.test.tsx',
      'app/routes/api.stripe.webhook/route.test.ts',
    ],
  },
  {
    label: 'existing-subscription import contracts',
    executable: 'bun',
    args: ['test', 'scripts/reconcile-ua-existing-subscriptions.test.ts'],
  },
  {
    label: 'UA authentication, context, branding, and role contracts',
    executable: 'bun',
    args: [
      'test',
      'app/components/auth-brand-lockup.test.tsx',
      'app/utils/ua-partner.server.test.ts',
      'app/routes/ua/route.test.ts',
      'app/routes/auth.inv.signup/ua-signup.test.ts',
      'app/routes/auth.inv.onboard-student/ua-onboarding.test.ts',
    ],
  },
  {
    label: 'membership gate, dashboard, and class-code contracts',
    executable: 'bun',
    args: [
      'test',
      'app/utils/auth.server.test.ts',
      'app/utils/classless-student-gate.test.ts',
      'app/routes/app._index/route.test.ts',
      'app/routes/enter-code/authz.test.ts',
    ],
  },
];

const commands = process.argv.includes('--with-e2e')
  ? [
      ...focusedCommands,
      {
        label:
          'real-browser auth regression, UA journey, and local signed-webhook Stripe E2E',
        executable: 'bunx',
        args: [
          'playwright',
          'test',
          '--project=chromium',
          'e2e/tests/auth.signin.spec.ts',
          'e2e/tests/auth.signup.student.spec.ts',
          'e2e/tests/ua.student-onboarding.spec.ts',
        ],
      },
    ]
  : focusedCommands;

const startedAt = performance.now();
for (const command of commands) {
  const commandStartedAt = performance.now();
  console.log('\n▶ ' + command.label);
  const result = spawnSync(command.executable, command.args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error('✗ ' + command.label);
    process.exit(result.status ?? 1);
  }
  console.log(
    '✓ ' +
      command.label +
      ' (' +
      ((performance.now() - commandStartedAt) / 1000).toFixed(1) +
      's)'
  );
}

console.log(
  '\nUA release suite passed in ' +
    ((performance.now() - startedAt) / 1000).toFixed(1) +
    's.'
);
