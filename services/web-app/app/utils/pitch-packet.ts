import { classroomReportSummary, type ClassroomActivityReport } from './classroom-report';

export type PacketSection = { heading: string; paragraphs: string[]; items: string[] };
export const PITCH_PACKET_TITLE = 'Free classroom trial pitch packet';

/** A single document model for the screen, clipboard and browser print. */
export function pitchPacketSections(
  report: ClassroomActivityReport,
  limits: { teacherSeats: number; studentSeats: number; activeClasses: number },
): PacketSection[] {
  return [
    {
      heading: 'Purpose of this evaluation',
      paragraphs: ['Use this packet to discuss a classroom trial with an administrator. Agree on a classroom goal and review your local requirements before deciding whether Yawp! fits your teaching workflow.'],
      items: [],
    },
    {
      heading: 'What the current free classroom includes',
      paragraphs: [`${limits.teacherSeats} teacher seat, up to ${limits.studentSeats} student seats and ${limits.activeClasses} active class.`, 'The free assignment bundle includes Class Starter, Prewriting and Thesis Statement assignments, with per-type creation limits. Teachers can manage their class roster, assign work and review submitted writing.'],
      items: ['Plan a small classroom evaluation within the available allowances. Check the remaining assignment allowances in the assignment picker before assigning work.', 'This packet describes the current free classroom. It does not quote pricing or promise future access or an upgrade.'],
    },
    {
      heading: 'Evaluation checklist',
      paragraphs: ['Use these prompts with your administrator; record your own observations separately.'],
      items: ['Choose one teaching goal and an assignment from the free bundle to try.', 'Confirm the roster fits the available seats and students can access their assigned work.', 'Review a submission and the feedback workflow; decide what teacher review and follow-up are needed.', 'Discuss student data handling, accessibility and local approval requirements using the privacy policy and terms.', 'Review the aggregate activity below, discuss what worked and what needs further evaluation, and agree on a next step.'],
    },
    {
      heading: 'Classroom activity report',
      // Reuse the merged report serializer verbatim, including all counting rules.
      paragraphs: [classroomReportSummary(report).split('\n').slice(1).join('\n').trim(), ...(report.submittedWriting === 0 ? ['No submitted writing in this scope yet. An evaluation can begin with a goal and a plan even before activity is recorded.'] : []), 'Recorded activity is not evidence of learning gains. These counts do not establish effectiveness or time saved.'],
      items: [],
    },
    {
      heading: 'Next steps',
      paragraphs: ['The teacher can return to My Classes to continue the classroom evaluation and open Share this report for the same aggregate summary. Review the packet together and agree on any further evaluation through your existing approval process.', 'The teacher must sign in to open the packet or activity report in Yawp! An administrator does not gain access from a page link. Copy or print prepares a document for you to share yourself; it sends nothing.'],
      items: ['Privacy policy: https://yawp.school/privacy', 'Terms of service: https://yawp.school/terms'],
    },
  ];
}

export function pitchPacketText(sections: PacketSection[]): string {
  return [PITCH_PACKET_TITLE, ...sections.flatMap(section => ['', section.heading, ...section.paragraphs, ...section.items])].join('\n');
}
