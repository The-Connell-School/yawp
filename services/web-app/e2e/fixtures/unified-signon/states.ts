import designInputs from './design-inputs.json' with { type: 'json' };
import type {
  SignonClass,
  SignonState,
} from '../../../app/domain/unified-signon/contracts';

const email = 'maya.r@lincolnhs.org';
const classInfo: SignonClass = {
  id: 'fixture-class',
  name: '[English 11, Period 2]',
  teacher: '[Ms. Okafor]',
  organization: '[Lincoln High School]',
};
const classes = [
  classInfo,
  {
    id: 'fixture-class-2',
    name: '[English 11, Period 5]',
    teacher: '[Mr. Dalton]',
    organization: '[Lincoln High School]',
  },
];
const memberships = [
  {
    id: 'fixture-teacher',
    organization: '[Lincoln High School]',
    role: 'Teacher',
  },
  {
    id: 'fixture-admin',
    organization: '[Lincoln High School]',
    role: 'School admin',
  },
  {
    id: 'fixture-student',
    organization: '[Summer Writing Lab]',
    role: 'Student',
  },
];
export type SignonFixture = {
  initialValues?: Record<string, string>;
  id: string;
  artboard: string;
  label: string;
  title: string;
  state: SignonState;
  googleAvailable?: boolean;
  dependency: string;
};
export const signonFixtures: SignonFixture[] = [];
function group(
  prefix: 'signon' | 'classcode',
  desktop: number,
  id: string,
  screen: SignonState['screen'],
  title: string,
  dependency: string,
  variants: [string, string, Partial<SignonState>?, string?][],
  base: Partial<SignonState> = {}
) {
  const state: SignonState = { screen, identifier: email, classInfo, ...base };
  signonFixtures.push({
    id,
    artboard: `${prefix}-${String(desktop).padStart(2, '0')}`,
    label: 'Desktop',
    googleAvailable: true,
    title,
    state,
    dependency,
  });
  variants.forEach(([suffix, label, overrides = {}, heading]) =>
    signonFixtures.push({
      id: `${id}-${suffix}`,
      artboard: `${prefix}-${String(desktop + 1).padStart(2, '0')}`,
      label,
      title: heading ?? title,
      state: { ...state, ...overrides },
      dependency,
      googleAvailable: true,
    })
  );
}
const field = (key: string, error: string): Partial<SignonState> => ({
  fieldErrors: { [key]: error },
});
const throttle = (minutes = 5): Partial<SignonState> => ({
  retryAfterSeconds: minutes * 60,
  error: `Too many attempts. Try again in ${minutes} minutes.`,
});
const classMissing =
  "We couldn't find a class with that code. Check it with your teacher.";
const classFull = 'This class is full. Ask your teacher to make room.';
const invalidEmail = 'That email looks incomplete. Check it and try again.';
const passwordErrors = {
  password: 'Use at least 6 characters.',
  confirmPassword: "These passwords don't match.",
};

group(
  'signon',
  3,
  'entry',
  'entry',
  'Sign in or create an account',
  'identifier resolver; Google OAuth',
  [
    ['default', 'Default'],
    ['focus', 'Keyboard focus'],
    ['loading', 'Loading', { pending: true }],
    ['empty', 'Empty', field('identifier', 'Enter your email or handle.')],
    ['invalid-email', 'Invalid email', field('identifier', invalidEmail)],
    [
      'missing-class',
      'Class code not found',
      field('identifier', classMissing),
    ],
    [
      'invalid-handle',
      'Invalid handle',
      field(
        'identifier',
        'Handles are 3–30 letters, numbers, dots, underscores or hyphens.'
      ),
    ],
    ['throttled', 'Throttled', throttle()],
    [
      'google-cancel',
      'Google cancelled',
      {
        error:
          'Google sign-in was cancelled. Try again, or use your email below.',
      },
    ],
    [
      'google-error',
      'Google error',
      {
        error:
          "We couldn't connect to Google. Try again, or use your email below.",
      },
    ],
    ['existing', 'message=existing_account', { variant: 'existing-account' }],
  ],
  { identifier: '' }
);
group(
  'signon',
  5,
  'password',
  'password',
  'Enter your password',
  'existing loginAction; resolver context',
  [
    ['email', 'Email user'],
    [
      'wrong',
      'Email · wrong password',
      field('password', "That password isn't right. Try again, or reset it."),
    ],
    ['throttled', 'Email · throttled', throttle(12)],
    ['handle', 'Handle user', { identifier: '@maya_r' }],
    [
      'handle-wrong',
      'Handle · no match',
      {
        identifier: '@maya_r',
        ...field('password', "That handle and password don't match."),
      },
    ],
    [
      'handle-forgot',
      'Handle · forgot',
      { identifier: '@maya_r', notice: 'Ask your teacher to reset it.' },
    ],
  ]
);
group(
  'signon',
  7,
  'required-password',
  'required-password',
  'Choose a new password',
  'existing required-password-change action',
  [
    ['default', 'Default'],
    ['short', 'Too short', field('password', 'Use at least 6 characters.')],
    [
      'mismatch',
      "Doesn't match",
      field('confirmPassword', "These passwords don't match."),
    ],
  ]
);
group(
  'signon',
  9,
  'account-type',
  'account-type',
  'Welcome to YAWP!',
  'resolver; Google identity proof',
  [
    ['email', 'From email'],
    [
      'google',
      'From Google',
      { variant: 'google', identifier: 'maya.reyes@gmail.com' },
    ],
  ]
);
group(
  'signon',
  11,
  'class-code',
  'class-code',
  'Enter your class code',
  'existing class lookup/join; PR 3 resolver context',
  [
    ['email', 'Email student'],
    [
      'google',
      'Google student',
      { variant: 'google', identifier: 'maya.reyes@gmail.com' },
    ],
    ['invalid', 'Invalid code', field('classCode', classMissing)],
    ['full', 'Class full', field('classCode', classFull)],
    ['multiple', 'Several classes match', { variant: 'multiple', classes }],
    [
      'pending-invite',
      'Invite already pending',
      {
        error:
          'You already have an invitation waiting for this email. Check your inbox, or ask your school to send it again.',
      },
    ],
    [
      'email-failed',
      'Email failed',
      {
        error:
          "We couldn't send your verification email. Try again in a moment.",
      },
    ],
  ]
);
group(
  'signon',
  13,
  'email-code',
  'email-code',
  'Check your email',
  'OTP issuance, delivery, verification, expiry and throttling (PR 3)',
  [
    ['default', 'Default'],
    ['resent', 'Code resent', { notice: 'New code sent. Check spam too.' }],
    [
      'wrong',
      'Wrong code',
      field(
        'code',
        "That code isn't right. Use the one from our most recent email."
      ),
    ],
    [
      'expired',
      'Expired',
      {
        variant: 'expired',
        ...field('code', 'That code has expired. Send yourself a new one.'),
      },
    ],
    [
      'reset',
      'Forgot password (uniform)',
      { variant: 'reset' },
      'Reset your password',
    ],
    [
      'failed',
      'Email failed',
      { error: "We couldn't send the email. Try again in a moment." },
    ],
  ]
);
group(
  'signon',
  15,
  'name-password',
  'name-password',
  'Create your account',
  'existing signup validation; verified OTP/Google context (PR 3)',
  [
    ['email', 'Email student'],
    [
      'google',
      'Google student (no password)',
      { variant: 'google', identifier: 'maya.reyes@gmail.com' },
      'Confirm your name',
    ],
    [
      'teacher',
      'Invited teacher',
      { variant: 'teacher' },
      'Finish setting up your account',
    ],
    [
      'admin',
      'Invited school admin',
      { variant: 'admin' },
      'Finish setting up your account',
    ],
    ['errors', 'Field errors', { fieldErrors: passwordErrors }],
    [
      'reset',
      'After forgot password',
      { variant: 'reset' },
      'Set a new password',
    ],
  ]
);
group(
  'signon',
  17,
  'handle-join',
  'handle-join',
  'Join your class',
  'existing /join loader/action; never accept fixture class IDs',
  [
    ['default', 'Default'],
    ['available', 'Handle available', { variant: 'available' }],
    [
      'taken',
      'Handle taken',
      {
        variant: 'taken',
        ...field('username', '@maya is taken. Try one of these:'),
      },
    ],
    ['full', 'Class full', { variant: 'full' }, 'This class is full'],
    [
      'invalid-link',
      'Link invalid or expired',
      { variant: 'invalid-link' },
      "This class link doesn't work",
    ],
  ]
);
group(
  'signon',
  19,
  'teacher',
  'teacher',
  'Teachers start with a free trial',
  'existing /free; uniform status request contract (PR 3)',
  [
    ['default', 'Default'],
    [
      'emailed',
      'Status emailed (uniform)',
      { notice: `If ${email} has applied, we emailed its status.` },
    ],
  ]
);
group(
  'signon',
  21,
  'trial',
  'trial-status',
  "You're on the waitlist",
  'existing free-tier status/auth guards; PR 3 post-login ordering',
  [
    ['lead', 'Waitlisted (LEAD)', { variant: 'lead' }],
    [
      'invited',
      'Invite sent (INVITED)',
      { variant: 'invited' },
      'Check your email for your invite',
    ],
    [
      'sent',
      'Waiting on admin (SENT)',
      { variant: 'sent' },
      'Waiting on your administrator',
    ],
    [
      'review',
      'Manual review',
      { variant: 'review' },
      "We're reviewing your request",
    ],
    [
      'rejected',
      'Not approved (REJECTED)',
      { variant: 'rejected' },
      'Request not approved',
    ],
    [
      'expired',
      'Invite expired (EXPIRED)',
      { variant: 'expired' },
      'Your invite expired',
    ],
  ]
);
group(
  'signon',
  23,
  'activation',
  'activation',
  'Finish setting up your account',
  'resolver account status; OTP (PR 3)',
  [
    ['invited', 'Invited, not activated'],
    ['lti', 'No password (LTI)', { variant: 'lti' }, 'Get a code to sign in'],
    [
      'google',
      'No password, Google linked',
      { variant: 'google' },
      'Sign in with Google',
    ],
    [
      'expired',
      'Invitation expired',
      { variant: 'expired' },
      'Your invitation expired',
    ],
  ]
);
group(
  'signon',
  25,
  'inactive',
  'inactive',
  "Your account isn't active",
  'existing membership checks; PR 3 ordering',
  [
    ['student', 'Student'],
    ['staff', 'Teacher or admin', { variant: 'staff' }],
  ]
);
group(
  'signon',
  27,
  'membership',
  'membership',
  'Where are you working today?',
  'authenticated active membership selection (PR 3)',
  [['default', 'Default']],
  { memberships }
);
group(
  'signon',
  29,
  'link-google',
  'link-google',
  'Use Google to sign in?',
  'Google verified identity + linking (PR 3)',
  [['default', 'Default']]
);
group(
  'signon',
  31,
  'partner',
  'partner-code',
  'Enter your organization code',
  'existing /ua partner context; PR 3 integration',
  [
    ['default', 'Default'],
    [
      'invalid',
      'Invalid code',
      field(
        'organizationCode',
        "We couldn't find that organization code. Check it with your program coordinator."
      ),
    ],
  ]
);
group(
  'classcode',
  3,
  'class-found',
  'class-found',
  'Join your class',
  'class resolver + authoritative capacity/membership checks',
  [
    ['single', 'Single match'],
    [
      'multiple',
      'Several matches',
      { variant: 'multiple', classes },
      'Which class is yours?',
    ],
    ['full', 'Class full', { variant: 'full' }, 'This class is full'],
    [
      'ambiguity',
      'Code or handle?',
      { screen: 'ambiguity', identifier: 'ENG-11X' },
      'Is ENG-11X a class code?',
    ],
  ]
);
group(
  'classcode',
  5,
  'class-handle',
  'class-handle',
  'Create your account',
  'existing /join validation and registerFreeTierStudent operation',
  [
    ['default', 'Default'],
    ['available', 'Handle available', { variant: 'available' }],
    [
      'taken',
      'Handle taken',
      {
        variant: 'taken',
        ...field('username', '@maya is taken. Try one of these:'),
      },
    ],
    [
      'errors',
      'Field errors',
      {
        fieldErrors: {
          username: 'Use 3–30 letters, numbers, dots, underscores or hyphens.',
          ...passwordErrors,
        },
      },
    ],
    [
      'filled',
      'Class filled while typing',
      {
        variant: 'filled',
        error: 'This class just filled up. Ask your teacher to make room.',
      },
    ],
    [
      'from-email',
      'Came from an email',
      {
        notice:
          "We won't save your email. This class uses a handle and password.",
      },
    ],
    [
      'from-google',
      'Came from Google',
      {
        notice:
          "We won't save your Google email. This class uses a handle and password.",
      },
    ],
  ]
);
group(
  'classcode',
  7,
  'class-email',
  'class-email',
  'Create your account',
  'existing email signup; verified email/Google context (PR 3)',
  [
    ['default', 'Default'],
    ['invalid', 'Invalid email', field('identifier', invalidEmail)],
    [
      'existing',
      'Email has an account',
      {
        variant: 'existing',
        notice:
          'You already have an account with this email. Sign in to join this class.',
      },
    ],
    [
      'cancel',
      'Google cancelled',
      { error: 'Google sign-in was cancelled. Try again, or use your email.' },
    ],
    [
      'failed',
      'Email failed',
      {
        error:
          "We couldn't send your verification email. Try again in a moment.",
      },
    ],
  ]
);
group(
  'classcode',
  9,
  'class-signin',
  'class-signin',
  'Sign in to join',
  'existing loginAction + class joining authorization',
  [
    ['default', 'Default'],
    [
      'invalid',
      'Invalid entry',
      field(
        'identifier',
        'Handles are 3–30 letters, numbers, dots, underscores or hyphens.'
      ),
    ],
    ['throttled', 'Throttled', throttle()],
  ]
);
group(
  'classcode',
  11,
  'joined',
  'joined',
  "You're in!",
  'existing class destination only after verified join',
  [
    ['default', 'Joined'],
    [
      'already',
      'Already in this class',
      { variant: 'already' },
      "You're already in this class",
    ],
  ]
);

for (const fixture of signonFixtures)
  fixture.initialValues = (
    designInputs as Record<string, Record<string, string>>
  )[fixture.id];

// Reference placeholders remain isolated from deployed identity responses.
for (const fixture of signonFixtures) Object.assign(fixture.state, { organizationName: '[Lincoln High School]', adminName: '[Admin name]', sentDate: '[Oct 14]' });
