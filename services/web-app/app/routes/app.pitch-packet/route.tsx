import { useState } from 'react';
import { data, Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { Button } from '~/components/ui/button';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { requireFreeTierEnabled } from '~/utils/free-tier/free-tier-feature-gate.server';
import { enforceFreeTierTeacherGate } from '~/domain/free-tier/free-tier-gate.server';
import { getClassroomActivityReport } from '~/utils/classroom-report.server';
import { getEntitlementsForPlan } from '~/utils/entitlements.server';
import { PITCH_PACKET_TITLE, pitchPacketSections, pitchPacketText } from '~/utils/pitch-packet';
import './packet.css';

export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const membership = await requireMembership(request, userId);
  if (!membership.isActive || membership.role !== 'TEACHER' || membership.organization.plan !== 'FREE_CLASSROOM') {
    throw data({ error: 'This packet is available to free classroom teachers.' }, { status: 403, headers: headers() });
  }
  await requireFreeTierEnabled();
  // Independently enforce the same gates on direct data requests as on app visits.
  await enforceFreeTierTeacherGate({ userId, pathname: '/app/pitch-packet', organizationPlan: membership.organization.plan });
  const report = await getClassroomActivityReport({ membershipId: membership.id, organizationId: membership.organization.id });
  const entitlements = getEntitlementsForPlan('FREE_CLASSROOM');
  const sections = pitchPacketSections(report, { teacherSeats: entitlements.teacherSeatCap!, studentSeats: entitlements.studentSeatCap!, activeClasses: entitlements.activeClassCap! });
  return data({ sections }, { headers: headers() });
}

export default function PitchPacketRoute() {
  const { sections } = useLoaderData<typeof loader>();
  const text = pitchPacketText(sections);
  const [copyFeedback, setCopyFeedback] = useState('');
  async function copyPacket() {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback('Packet copied.');
    } catch {
      setCopyFeedback('Could not copy. Select the plain-text packet below and copy it manually.');
    }
  }
  return (
    <section className="h-full w-full overflow-y-auto">
      <main id="pitch-packet" data-testid="pitch-packet" className="mx-auto w-full max-w-screen-md space-y-6 p-4 pb-24 sm:p-6">
        <div data-packet-controls className="space-y-3">
          <Button variant="outline" size="sm" asChild><Link to="/app/my-classes">Back to My Classes</Link></Button>
          <p className="text-sm text-muted-foreground">Prepare a copy for a conversation with your administrator. Copying or printing sends nothing.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={copyPacket}>Copy packet</Button>
            <Button variant="outline" onClick={() => window.print()}>Print packet</Button>
          </div>
          <p role="status" aria-live="polite" className="text-sm">{copyFeedback}</p>
        </div>
        <h1 className="text-2xl font-semibold">{PITCH_PACKET_TITLE}</h1>
        {sections.map(section => (
          <section key={section.heading} className="space-y-3 border-t pt-5">
            <h2 className="text-lg font-semibold">{section.heading}</h2>
            {section.paragraphs.map(paragraph => <p key={paragraph} className="whitespace-pre-line text-sm leading-relaxed">{paragraph}</p>)}
            {section.items.length ? <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">{section.items.map(item => <li key={item}>{item}</li>)}</ul> : null}
          </section>
        ))}
        <div data-packet-controls className="space-y-4 border-t pt-5">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild><Link to="/app/classroom-report">Open activity report</Link></Button>
            <Button variant="outline" size="sm" asChild><Link to="/app/my-classes">Open My Classes</Link></Button>
            <Button variant="link" size="sm" asChild><Link to="/privacy">Privacy policy</Link></Button>
            <Button variant="link" size="sm" asChild><Link to="/terms">Terms of service</Link></Button>
          </div>
          <label htmlFor="packet-text" className="block text-sm font-medium">Plain-text packet</label>
          <textarea id="packet-text" readOnly value={text} rows={12} className="w-full rounded-md border bg-background p-3 text-sm" />
        </div>
      </main>
    </section>
  );
}
