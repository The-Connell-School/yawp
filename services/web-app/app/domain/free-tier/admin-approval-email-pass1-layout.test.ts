import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { buildDesignedAdminApprovalEmail } from './admin-approval-email.server';
import { adminApprovalReminderMutedLead } from './admin-approval-copy';

const FIX = {
  teacherName: 'Jordan Rivera',
  teacherEmail: 'a***@example.test',
  schoolName: 'Lincoln High School',
  approveUrl: 'https://yawp.test/free/admin/approve?t=REDACTED',
  notRightPersonUrl: 'https://yawp.test/free/admin/not-right-person?t=REDACTED',
};

function indexOf(html: string, needle: string) {
  const i = html.indexOf(needle);
  expect(i).toBeGreaterThanOrEqual(0);
  return i;
}

describe('pass1 admin approval email layout polish', () => {
  const primary = process.env.PRIMARY_APP_URL;
  beforeEach(() => {
    process.env.PRIMARY_APP_URL = 'https://yawp.test';
  });
  afterEach(() => {
    if (primary === undefined) delete process.env.PRIMARY_APP_URL;
    else process.env.PRIMARY_APP_URL = primary;
  });

  test('E2 pass1: reminder muted lead renders above the headline', async () => {
    const lead = adminApprovalReminderMutedLead({
      teacherName: FIX.teacherName,
      schoolName: FIX.schoolName,
      pass1: true,
    });
    const { html } = await buildDesignedAdminApprovalEmail({
      ...FIX,
      pass1: true,
      reminder: true,
    });
    const title = `Approve Yawp! for ${FIX.teacherName} at ${FIX.schoolName}`;
    expect(indexOf(html, lead)).toBeLessThan(indexOf(html, title));
    const leadAt = html.indexOf(lead);
    expect(html.slice(Math.max(0, leadAt - 200), leadAt)).toContain('font-style:italic');
  });

  test('E2f pass1: divider precedes banner; reminder stays above headline', async () => {
    const forwarder = 'Dr. Patel';
    const { html } = await buildDesignedAdminApprovalEmail({
      ...FIX,
      pass1: true,
      reminder: true,
      forwardedByAdminName: forwarder,
    });
    const divider = indexOf(html, 'class="yawp-divider"');
    const banner = indexOf(html, 'class="yawp-banner"');
    expect(divider).toBeLessThan(banner);
    expect(html.indexOf('padding:16px 48px 0px 48px')).toBeLessThan(banner);
    const title = `Approve Yawp! for ${FIX.teacherName} at ${FIX.schoolName}`;
    expect(indexOf(html, "still waiting on your approval")).toBeLessThan(indexOf(html, title));
  });

  test('E3 pass1: forward banner has 16px section padding below divider', async () => {
    const { html } = await buildDesignedAdminApprovalEmail({
      ...FIX,
      pass1: true,
      forwardedByAdminName: 'Dr. Patel',
    });
    const divider = indexOf(html, 'class="yawp-divider"');
    const banner = indexOf(html, 'class="yawp-banner"');
    expect(divider).toBeLessThan(banner);
    expect(html.indexOf('padding:16px 48px 0px 48px')).toBeLessThan(banner);
    expect(html.indexOf('padding:20px 0px 0px 0px', divider)).toBeLessThan(0);
  });

  test('flag off: reminder remains below headline (unchanged layout)', async () => {
    const { html } = await buildDesignedAdminApprovalEmail({
      ...FIX,
      pass1: false,
      reminder: true,
    });
    const headline = indexOf(
      html,
      `Approve Yawp! for ${FIX.teacherName} at ${FIX.schoolName}`
    );
    expect(html.indexOf('This is a reminder about the approval request below.')).toBeGreaterThan(
      headline
    );
    const cardHtml = html.slice(0, html.indexOf('Button not working?'));
    expect(cardHtml.indexOf('class="yawp-banner"')).toBeLessThan(0);
  });
});
