import * as React from 'react';
import * as E from '@react-email/components';

export function OrganizationInviteEmail({
  verifyUrl,
  userType,
  organizationName,
}: {
  verifyUrl: string;
  userType: 'teacher' | 'student';
  organizationName: string;
}) {
  return (
    <E.Html lang="en" dir="ltr">
      <E.Container>
        <h1>
          <E.Text>Welcome to Yawp!</E.Text>
        </h1>
        <p>
          <E.Text>
            You've been invited to join {organizationName} as a {userType} on
            Yawp!
          </E.Text>
        </p>
        <p>
          <E.Text>Click the link to get started:</E.Text>
        </p>
        <E.Link href={verifyUrl}>{verifyUrl}</E.Link>
        <p>
          <E.Text>
            This invitation will expire in 2 days for security reasons.
          </E.Text>
        </p>
      </E.Container>
    </E.Html>
  );
}
