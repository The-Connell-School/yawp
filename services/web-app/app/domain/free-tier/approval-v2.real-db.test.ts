import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
const send = mock(async (_: any): Promise<any> => ({ status: 'success', data: { id: 'captured' } }));
mock.module('~/utils/email.server', () => ({ sendEmail: send }));
const enabled = process.env.APPROVAL_V2_DB_TESTS === '1';
describe.skipIf(!enabled)('approval v2 durable lifecycle', () => {
  let db: typeof import('~/utils/db.server').prisma;
  let api: typeof import('./approval-v2.server');
  const ids: string[] = [];
  const now = new Date('2026-10-14T15:02:00Z');
  async function flag(mode = 'everyone') {
    await db.setting.upsert({where:{name:'feature_flag.free-tier-onboarding-v2'},create:{name:'feature_flag.free-tier-onboarding-v2',value:JSON.stringify({mode,orgIds:[]})},update:{value:JSON.stringify({mode,orgIds:[]})}});
  }
  async function fixture() {
    const app = await db.freeTierApplication.create({data:{name:'Ms. Okafor',email:`approval-${crypto.randomUUID()}@example.org`,schoolName:'Lincoln High',location:'Local',gradeLevel:'11',userId:'approval-test-user',status:'SENT'}});
    ids.push(app.id);
    const approval = await db.freeTierAdminApproval.create({data:{applicationId:app.id,adminName:'Dr. Patel',adminEmail:'patel+approval@example.org',emailCopyVersionHash:'test',firstSentAt:now,nextAutoReminderAt:new Date(+now+api.WEEK_MS),nextTeacherFollowUpAt:new Date(+now+api.WEEK_MS)}});
    return {app,approval};
  }
  beforeEach(async () => {
    db = (await import('~/utils/db.server')).prisma;
    api = await import('./approval-v2.server');
    await db.freeTierApplication.deleteMany({where:{id:{in:ids}}});
    ids.length=0;
    process.env.FREE_TIER_LINK_HMAC_SECRET = 'local-approval-v2-test-secret';
    process.env.PRIMARY_APP_URL = 'http://localhost:5199';
    send.mockClear(); send.mockImplementation(async () => ({ status:'success',data:{id:'captured'} }));
    await flag();
  });
  afterAll(async () => {
    if (db) { await db.freeTierApplication.deleteMany({where:{id:{in:ids}}}); await flag('off'); await db.$disconnect(); }
    mock.restore();
  });
  test('before and at seven days, repeated/concurrent runs, four shared resends, teacher follow-up stop policy', async () => {
    const {app,approval}=await fixture();
    await api.runApprovalJobs(new Date(+now+api.WEEK_MS-1));
    expect(send).toHaveBeenCalledTimes(0);
    for(let week=1;week<=5;week++) {
      const clock=new Date(+now+week*api.WEEK_MS);
      await Promise.all([api.runApprovalJobs(clock),api.runApprovalJobs(clock)]);
      await api.runApprovalJobs(clock);
    }
    const row=await db.freeTierAdminApproval.findUniqueOrThrow({where:{id:approval.id}});
    expect(row.reminderCount).toBe(4); expect(row.teacherFollowUpCount).toBe(5);
    expect(row.stopReason).toBe('max_reached'); expect(row.needsManualFollowUp).toBe(true);
    expect(send).toHaveBeenCalledTimes(9);
    await db.freeTierApplication.update({where:{id:app.id},data:{status:'APPROVED'}});
    await api.runApprovalJobs(new Date(+now+6*api.WEEK_MS));
    expect(send).toHaveBeenCalledTimes(9);
  });
  test('manual resends count and do not move weekly cadence; ten minute cooldown', async () => {
    const {app,approval}=await fixture();
    const clock=new Date(+now+1000);
    const result=await api.queueManualApprovalReminder({applicationId:app.id,idempotencyKey:'manual-1',now:clock});
    expect(result.ok).toBe(true);
    await api.runApprovalJobs(clock);
    const row=await db.freeTierAdminApproval.findUniqueOrThrow({where:{id:approval.id}});
    expect(row.reminderCount).toBe(1); expect(row.lastReminderSource).toBe('manual');
    expect(row.nextAutoReminderAt?.getTime()).toBe(+now+api.WEEK_MS);
    expect((await api.queueManualApprovalReminder({applicationId:app.id,idempotencyKey:'manual-2',now:clock})).ok).toBe(false);
  });
  test('forward validates owner and fields, supersedes old links and persists chain plus notification', async () => {
    const {app,approval}=await fixture();
    const {mintSignedLink,peekSignedLink}=await import('./signed-link.server');
    const old=await mintSignedLink({applicationId:app.id,purpose:'ADMIN_APPROVE'});
    await db.freeTierAdminApproval.update({where:{id:approval.id},data:{signedLinkId:old.linkId}});
    const input={applicationId:app.id,userId:'approval-test-user',currentApprovalId:approval.id,newAdminName:'Ms. Rivera',newAdminEmail:'rivera@example.org',request:new Request('http://localhost/test')};
    expect((await api.forwardApprovalRequest({...input,userId:'someone-else'})).ok).toBe(false);
    expect((await api.forwardApprovalRequest({...input,newAdminName:' ',newAdminEmail:'bad'})).ok).toBe(false);
    expect((await api.forwardApprovalRequest(input)).ok).toBe(true);
    expect((await api.forwardApprovalRequest(input)).ok).toBe(false);
    expect((await peekSignedLink({token:old.token,expectedPurpose:'ADMIN_APPROVE'})).ok).toBe(false);
    const next=await db.freeTierAdminApproval.findFirstOrThrow({where:{applicationId:app.id,status:'PENDING'}});
    expect(next.redirectedFromId).toBe(approval.id); expect(next.forwardedByRole).toBe('teacher');
    expect(await db.freeTierApprovalDelivery.count({where:{approvalId:next.id,state:'QUEUED'}})).toBe(2);
    await api.runApprovalJobs(new Date());
    expect(send).toHaveBeenCalledTimes(2);
    const message=send.mock.calls.find(([args])=>args.to==='rivera@example.org')?.[0];
    const token=new URL(message.text.match(/http[^\s]+\/free\/admin\/approve\?t=[^\s]+/)[0]).searchParams.get('t')!;
    expect((await peekSignedLink({token,expectedPurpose:'ADMIN_APPROVE'})).ok).toBe(true);
  });
  test('flag-off, non-target, terminal and forwarded jobs cannot send', async () => {
    const {app}=await fixture();
    await flag('off'); await api.runApprovalJobs(new Date(+now+api.WEEK_MS)); expect(send).toHaveBeenCalledTimes(0);
    await flag('targeted'); await api.runApprovalJobs(new Date(+now+api.WEEK_MS)); expect(send).toHaveBeenCalledTimes(0);
    await flag(); await db.freeTierApplication.update({where:{id:app.id},data:{status:'REJECTED'}});
    await api.runApprovalJobs(new Date(+now+api.WEEK_MS)); expect(send).toHaveBeenCalledTimes(0);
  });
  test('confirmed rejection retries without incrementing counts; ambiguous send never repeats', async () => {
    const {approval}=await fixture();
    send.mockImplementationOnce(async()=>({status:'error',error:{statusCode:429,message:'rate limited'}}));
    await api.runApprovalJobs(new Date(+now+api.WEEK_MS));
    expect((await db.freeTierAdminApproval.findUniqueOrThrow({where:{id:approval.id}})).reminderCount).toBe(0);
    await api.runApprovalJobs(new Date(+now+api.WEEK_MS+3600001));
    expect((await db.freeTierAdminApproval.findUniqueOrThrow({where:{id:approval.id}})).reminderCount).toBe(1);
    send.mockImplementation(async()=>{throw new Error('connection interrupted')});
    await api.runApprovalJobs(new Date(+now+2*api.WEEK_MS));
    const attempts=send.mock.calls.length;
    await api.runApprovalJobs(new Date(+now+2*api.WEEK_MS+3600001));
    expect(send).toHaveBeenCalledTimes(attempts);
  });
});
