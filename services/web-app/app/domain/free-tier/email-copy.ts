export const ADMIN_APPROVAL_EMAIL_COPY_VERSION = '2026-10-14-v5';

/** Matches the Privacy Policy model-training statement (single sentence). */
export const FREE_TIER_MODEL_TRAINING_LINE =
  'Student writing is never used to train models.';
// Pass the version stored with the application when admission was requested.
// Do not derive delayed email wording from the flag at delivery time.
export const RELEASE_EMAIL_V2_COPY_VERSION = 'free-tier-onboarding-v2';

export function renderReleaseEmailSubject(_args: { copyVersion?: string } = {}) {
  // Bryant and Brian (10/19): one subject for every release email.
  return "You're in — start your Yawp! classroom!";
}

/** When true, admin approval email may state NDPA completion. Defaults to omitted. */
export function isFreeTierNdpaCompleted() {
  return process.env.FREE_TIER_NDPA_COMPLETED === 'true';
}

function ferpaComplianceBullet() {
  if (isFreeTierNdpaCompleted()) {
    return '- Is Yawp! FERPA compliant? Yes. Yawp! has completed the National Student Data Privacy Agreement (NDPA).';
  }
  return '- Is Yawp! FERPA compliant? Yes.';
}

const APPROVAL_LINK_DAYS = 14;

function copyVersionLine(_version: string) {
  return '';
}

function adminApprovalGreeting(adminRecipientName?: string | null) {
  const trimmed = adminRecipientName?.trim();
  if (trimmed) return `Hi ${trimmed},`;
  return 'Hi there,';
}

export function renderAdminApprovalEmailBody(args: {
  teacherName: string;
  teacherEmail: string;
  schoolName: string;
  /** Accepted for older callers, but never included in approval copy. */
  personalNote?: string | null;
  approveUrl: string;
  notRightPersonUrl: string;
  adminRecipientName?: string | null;
  reminderLead?: string | null;
  copyVersion?: string;
}) {
  const version = args.copyVersion ?? ADMIN_APPROVAL_EMAIL_COPY_VERSION;
  const reminder = args.reminderLead?.trim()
    ? `${args.reminderLead.trim()}\n\n`
    : '';
  const greeting = adminApprovalGreeting(args.adminRecipientName);
  return `${reminder}${greeting}

${args.teacherName} (${args.teacherEmail}) at ${args.schoolName} would like to use Yawp! in their classroom.

Yawp! helps students draft essays with feedback while teachers stay in control of assignments and grading. ${FREE_TIER_MODEL_TRAINING_LINE}

Approve Yawp! for this school (link expires in ${APPROVAL_LINK_DAYS} days):
${args.approveUrl}

I'm not the right person to approve this:
${args.notRightPersonUrl}

Questions? Contact support@yawp.school.${copyVersionLine(version)}`;
}

export function renderReleaseEmailBody(args: {
  name: string;
  joinUrl: string;
  copyVersion?: string;
}) {
  const version = args.copyVersion ?? ADMIN_APPROVAL_EMAIL_COPY_VERSION;
  if (version === RELEASE_EMAIL_V2_COPY_VERSION)
    return renderReleaseEmailV2Body({ name: args.name, joinUrl: args.joinUrl });
  const welcome = version === RELEASE_EMAIL_V2_COPY_VERSION
    ? "You're in!\n\nWe'd love to have you try Yawp! with your students."
    : "You're in — we'd love to have you try Yawp! with your students.";
  return `Hi ${args.name},

${welcome}

Create your teacher account to get started:
${args.joinUrl}

This link is for you only and expires in 30 days.

— The Yawp! team${copyVersionLine(version)}`;
}

export function renderCongratulationsEmailBody(args: {
  teacherName: string;
  adminName: string;
  signInUrl: string;
  copyVersion?: string;
}) {
  const version = args.copyVersion ?? ADMIN_APPROVAL_EMAIL_COPY_VERSION;
  return `Hi ${args.teacherName},

Great news — ${args.adminName} approved Yawp! for your classroom.

Sign in to open your class and assign your Class Starter:
${args.signInUrl}

— The Yawp! team${copyVersionLine(version)}`;
}

// ---------------------------------------------------------------------------
// Onboarding v2 email copy (Brian's 10/18 free-tier copy doc).
// Used only for applications whose stored copy version is
// RELEASE_EMAIL_V2_COPY_VERSION, so legacy applications keep their wording.
// Existing decisions win over the doc: reminders stay capped at three sends,
// "site license" wording, and no "AI" in user-facing copy.
// ---------------------------------------------------------------------------

export const FREE_TIER_BOOKING_URL =
  'https://app.usemotion.com/meet/brian-connell/ryxkqvr';

const BRIAN_SIGNATURE = `Best always,

Brian Connell
Founder, Yawp! Writing Program`;

export function isOnboardingV2CopyVersion(copyVersion?: string | null) {
  return copyVersion === RELEASE_EMAIL_V2_COPY_VERSION;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name.trim() || 'there';
}

export const RELEASE_EMAIL_V2_SUBJECT = "You're in — start your Yawp! classroom!";

export function renderReleaseEmailV2Body(args: { name: string; joinUrl: string }) {
  return `Hi ${firstName(args.name)},

Good news: your spot is ready. Your free Yawp! classroom license covers one class of up to 35 students, with no cost to you or your school.

Getting started takes about five minutes. You'll set up your class, then ask your administrator to approve it. While you wait, you can explore everything.

Get started:
${args.joinUrl}

This link is for you only and expires in 30 days.

Changed your mind? That's okay. Reply to this email and let us know, and we'll pass your spot to another teacher.

${BRIAN_SIGNATURE}`;
}

export function renderAdminApprovalEmailV2Subject(args: {
  teacherName: string;
  reminder?: boolean;
}) {
  return args.reminder
    ? `Reminder: ${args.teacherName} is waiting on your approval for Yawp!`
    : `${args.teacherName} would like to use Yawp! with their students`;
}

export function renderAdminApprovalEmailV2Body(args: {
  teacherName: string;
  schoolName: string;
  className?: string | null;
  approveUrl: string;
  notRightPersonUrl: string;
  adminRecipientName?: string | null;
  reminder?: boolean;
}) {
  const admin = args.adminRecipientName?.trim();
  const greeting = admin ? `Dear ${admin},` : 'Hello,';
  const className = args.className?.trim();
  const teaches = className
    ? `${args.teacherName}, who teaches ${className} at ${args.schoolName},`
    : `${args.teacherName}, a teacher at ${args.schoolName},`;
  const reminderLead = args.reminder
    ? `We're checking in on behalf of ${args.teacherName} about their request to use the Yawp! Writing Program with their students. It's free, and approval takes one click. The details from our original email are below.

Approve ${args.teacherName}'s free classroom (link expires in ${APPROVAL_LINK_DAYS} days):
${args.approveUrl}

---

`
    : '';
  return `${greeting}

${reminderLead}${teaches} would like to use the Yawp! Writing Program to help their students become stronger writers. Before we open their free classroom, we'd like your approval.

It's free. ${args.teacherName} has been given a free Yawp! license for one class of up to 35 students. There's no cost to the teacher or the school, no credit card, and nothing to purchase.

What Yawp! is. Yawp! gives teachers the tools to become expert writing instructors and build a culture of writing in their classrooms.
- Students practice writing alongside a writing tutor that gives thoughtful, immediate feedback and never does the writing for them.
- Teachers grade quickly on the platform with a rubric-aligned grading assistant.
- Class summaries show each class's strengths and areas for growth.
- Real-time reports track student writing over the year.
- A lesson planner helps teachers close the gaps they find.

Why we built it. Not every educational technology is good for students and teachers. Yawp! was built by classroom teachers in response to problems we lived with:
- Students using software to write for them
- The hours it takes to give thoughtful feedback, often on nights and weekends
- Students losing time waiting for that feedback
- Schools having little data on student writing beyond a test given once or twice a year
- Teachers (especially new teachers) lacking a strong writing curriculum

Yawp! answers each of these by keeping the thinking with the student, the feedback timely, and the teacher in charge.

Why we ask you. When administrators know what's happening in their buildings, they're better equipped to tell the story of their students' success. Your approval provides oversight and clear communication, and it lets you see and support good work as it happens. A free Yawp! classroom is an easy win: you'll be backing a teacher who is taking initiative, and you'll be able to see evidence of their students' growth.

Approve ${args.teacherName}'s free classroom (link expires in ${APPROVAL_LINK_DAYS} days):
${args.approveUrl}

I'd like to learn more first (schedule a call with Brian):
${FREE_TIER_BOOKING_URL}

I'm not the right person to approve this:
${args.notRightPersonUrl}

Questions about student privacy?
${ferpaComplianceBullet()}
- What student information do you collect? Students join with a class code and their first and last name. We don't collect student email addresses.
- Is student writing used to train language models? No.
- Who can see student work? Only the student and their teacher. (We encourage teachers to share student work and reports with administrators on request.)
- Can student data be deleted? Yes, on request.
- Who is it for? The free tier is for high school classes only.

Thank you for supporting your teachers.

Brian Connell
Founder, Yawp! Writing Program`;
}

export const TEACHER_REMINDER_V2_SUBJECT =
  'Your Yawp! classroom is still waiting on approval';

export function renderTeacherReminderV2Body(args: {
  teacherName: string;
  adminName: string;
  pendingUrl: string;
}) {
  return `Hi ${firstName(args.teacherName)},

We haven't heard from ${args.adminName} yet, so we've sent them a friendly reminder. If it feels right, a quick word in the hallway or a short email from you can help it rise to the top of their inbox.

In the meantime, your classroom preview is ready for you to explore.

Explore my classroom:
${args.pendingUrl}

Think another administrator might be able to approve sooner? You can send your request to someone else.

Request approval from a different administrator:
${args.pendingUrl}

${BRIAN_SIGNATURE}`;
}

export const FORWARD_NOTICE_V2_SUBJECT = 'Your Yawp! approval request was forwarded';

export function renderForwardNoticeV2Body(args: {
  teacherName: string;
  adminName: string;
  adminEmail: string;
  manualReview: boolean;
  pendingUrl: string;
}) {
  return `Hi ${firstName(args.teacherName)},

Your approval request is now with ${args.adminName} (${args.adminEmail}). ${args.manualReview ? 'Our team is reviewing the new request.' : "We'll let you know the moment they approve."}

View your request:
${args.pendingUrl}

${BRIAN_SIGNATURE}`;
}

export const CONGRATULATIONS_V2_SUBJECT =
  'You\'re approved! Your Yawp! classroom is ready';

export function renderCongratulationsEmailV2Body(args: {
  teacherName: string;
  adminName: string;
  signInUrl: string;
}) {
  return `Hi ${firstName(args.teacherName)},

Good news: ${args.adminName} approved your classroom! All free features are now unlocked. Your next step is to add your students to your class. It takes about five minutes with your students in the room.

Add students:
${args.signInUrl}

It might be worth a quick thank-you to ${args.adminName}, too.

Best always,

Brian`;
}
