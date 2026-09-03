"""Explicit historical cost scenario; observed components remain separate from modeled gaps."""
import datetime as dt
from statistics import median
from costs import money


FIELDS=('known_ai_usd','modeled_ai_usd','known_aws_usd','modeled_aws_usd')


def estimate_history(data):
    from report import month_start_before
    current=data['meta']['as_of'][:7]
    start=data['meta']['start_at'][:7]
    count=(int(current[:4])-int(start[:4]))*12+int(current[5:])-int(start[5:])
    months=[month_start_before(data['meta']['as_of'],n).isoformat()[:7] for n in range(count,0,-1)]
    schools={s['school_id']:s for s in data['schools']}
    usage={}
    for r in data['usage']:
        if r['grain']!='month' or r['period'][:7] not in months:continue
        key=(r['period'][:7],r['school_id'])
        if key in usage:raise ValueError('Duplicate history grid row')
        if 'pre_llm_student_tutor_messages' not in r:raise ValueError('Exact pre-log tutor counts required; rerun production extraction')
        if not 0<=r['pre_llm_student_tutor_messages']<=r['student_tutor_messages']:raise ValueError('Invalid pre-log counts')
        usage[key]=r
    if set(usage)!={(m,s) for m in months for s in schools}:raise ValueError('Incomplete school/month grid')
    e=data['cost_estimates'];costmonths={m['month']:m for m in e['months']}
    # Earliest three complete observed months avoid using the new cached summer tutor
    # costs as an assumed rate for older uncached interactions.
    candidates=[m for m in sorted(e['months'],key=lambda r:r['month']) if m['month'] in months
        and m['coverage']=='full calendar month of retained logs' and m['anthropic_estimated_usd'] is not None
        and sum(usage[m['month'],s]['student_tutor_messages'] for s in schools)>0][:3]
    if not candidates:raise ValueError('No complete AI calibration months')
    cal_ai=sum(m['anthropic_estimated_usd']-m['excluded_ai_usd'] for m in candidates)
    cal_msgs=sum(usage[m['month'],s]['student_tutor_messages'] for m in candidates for s in schools)
    ai_rate=cal_ai/cal_msgs
    aws={r['month']:r for r in data.get('aws_costs',[]) if r.get('amount') is not None and r['month'] in months}
    if not aws or any(r['unit']!='USD' for r in aws.values()):raise ValueError('USD AWS baseline required')
    aws_first=[aws[k] for k in sorted(aws)[:3]]
    aws_baseline=median(r['amount'] for r in aws_first)
    school_costs={(r['month'],r['school_id']):r for r in e['schools']}
    rows=[];monthly=[]
    for m in months:
        cm=costmonths[m]
        if cm['unknown_price_calls']:raise ValueError('Unpriced log calls prevent historical cost estimate')
        n=sum(usage[m,s]['students_with_observed_activity'] for s in schools)
        known_ai=cm['anthropic_estimated_usd']-cm['excluded_ai_usd'] if cm['anthropic_estimated_usd'] is not None else 0
        missing_msgs=sum(usage[m,s]['pre_llm_student_tutor_messages'] for s in schools)
        model_ai=missing_msgs*ai_rate
        known_aws=aws[m]['amount'] if m in aws else 0
        model_aws=0 if m in aws else aws_baseline
        local=[]
        for sid,s in schools.items():
            u=usage[m,sid];c=school_costs[m,sid];sn=u['students_with_observed_activity']
            r=dict(month=m,school_id=sid,school=s['school'],organization=s['organization'],
                active_students=sn,tutor_messages=u['student_tutor_messages'],
                pre_log_tutor_messages=u['pre_llm_student_tutor_messages'],
                known_ai_usd=(c['direct_ai_usd'] or 0)+(c['shared_ai_allocated_usd'] or 0),
                modeled_ai_usd=u['pre_llm_student_tutor_messages']*ai_rate,
                known_aws_usd=c['aws_allocated_usd'] or 0,
                modeled_aws_usd=model_aws*sn/n if n else 0,
                ai_coverage=cm['coverage'],aws_coverage='recorded account spend' if m in aws else 'modeled baseline')
            r['estimated_total_usd']=sum(r[k] for k in FIELDS)
            r['cost_per_active_student_usd']=r['estimated_total_usd']/sn if sn else None
            local.append(r)
        total=known_ai+model_ai+known_aws+model_aws
        unallocated=total-sum(r['estimated_total_usd'] for r in local)
        # Shared AI without activity and hosting without students must remain overhead.
        expected_unallocated=(known_aws+model_aws if not n else 0)+(cm['shared_ai_usd'] if not n and not sum(usage[m,s]['student_tutor_messages'] for s in schools) else 0)
        if abs(unallocated-expected_unallocated)>1e-7:raise ValueError('Historical monthly allocations do not reconcile')
        monthly.append(dict(month=m,student_months=n,known_ai_usd=known_ai,modeled_ai_usd=model_ai,
            known_aws_usd=known_aws,modeled_aws_usd=model_aws,estimated_total_usd=total,
            unallocated_overhead_usd=expected_unallocated,pre_log_tutor_messages=missing_msgs,
            ai_coverage=cm['coverage'],aws_coverage='recorded' if m in aws else 'modeled',
            cost_per_student_month_usd=total/n if n else None))
        rows.extend(local)
    totals=[]
    for sid,s in schools.items():
        rs=[r for r in rows if r['school_id']==sid];n=sum(r['active_students'] for r in rs)
        r=dict(school_id=sid,school=s['school'],organization=s['organization'],real_school=s['real_school'],student_months=n,
            active_months=sum(r['active_students']>0 for r in rs),**{k:sum(r[k] for r in rs) for k in FIELDS})
        r['known_component_subtotal_usd']=r['known_ai_usd']+r['known_aws_usd']
        r['modeled_gap_usd']=r['modeled_ai_usd']+r['modeled_aws_usd']
        r['estimated_total_usd']=r['known_component_subtotal_usd']+r['modeled_gap_usd']
        r['cost_per_student_month_usd']=r['estimated_total_usd']/n if n else None
        r['average_per_calendar_month_usd']=r['estimated_total_usd']/count
        totals.append(r)
    summary={k:sum(m[k] for m in monthly) for k in FIELDS+('estimated_total_usd','unallocated_overhead_usd','student_months')}
    summary['known_component_subtotal_usd']=summary['known_ai_usd']+summary['known_aws_usd']
    summary['modeled_gap_usd']=summary['modeled_ai_usd']+summary['modeled_aws_usd']
    summary['cost_per_student_month_usd']=summary['estimated_total_usd']/summary['student_months'] if summary['student_months'] else None
    summary['school_allocated_usd']=sum(r['estimated_total_usd'] for r in totals)
    summary['named_school_allocated_usd']=sum(r['estimated_total_usd'] for r in totals if r['real_school'])
    summary['school_unassigned_usd']=sum(r['estimated_total_usd'] for r in totals if not r['real_school'])
    if abs(summary['school_allocated_usd']+summary['unallocated_overhead_usd']-summary['estimated_total_usd'])>1e-7:
        raise ValueError('Historical school totals do not reconcile')
    return dict(definition='historical-cost-scenario-v1',as_of=data['meta']['as_of'],start=start+'-01',end_exclusive=current+'-01',
        full_months=count,calibration=dict(ai_months=[m['month'] for m in candidates],ai_usd=cal_ai,tutor_messages=cal_msgs,
        usd_per_pre_log_tutor_message=ai_rate,aws_months=[r['month'] for r in aws_first],aws_monthly_baseline_usd=aws_baseline),
        summary=summary,schools=sorted(totals,key=lambda r:r['estimated_total_usd'],reverse=True),months=monthly,school_months=rows)


def render_history(e):
    from report import table
    s=e['summary'];c=e['calibration'];end=(dt.date.fromisoformat(e['end_exclusive'])-dt.timedelta(days=1)).isoformat()
    parts=[f'# Yawp school cost estimates — {e["start"]} through {end}',
        f'**Full-period planning estimate, including modeled gaps: {money(s["estimated_total_usd"])}.** '
        f'Known-component subtotal: **{money(s["known_component_subtotal_usd"])}**; modeled missing history: '
        f'**{money(s["modeled_gap_usd"])}**. Source snapshot: {e["as_of"]}. Current month-to-date is excluded.',
        '**This is a historical cost scenario, not two years of retrieved bills.** AI logs begin February 21, 2026; '
        'AWS costs are available August 2025–August 2026. The two-year table uses all retained school activity and estimates the missing cost components separately. '
        'Known AI is still a token/list-price estimate, and school AWS is an allocation of account spend.',
        f'{s["student_months"]:,} active student-school months; **{money(s["cost_per_student_month_usd"])} per active student-month**, '
        f'including {money(s["unallocated_overhead_usd"])} of account overhead that could not be assigned to a school in zero-activity months. '
        'Student-months sum monthly active memberships; they are not distinct students across two years or purchased seats.',
        '## Full-period school estimates',
        table(['School / organization','Active months','Student-months','Known AI + AWS subtotal','Modeled gap','Full-period estimate','Est. cost / student-month'],[
            [r['school']+' / '+r['organization'],r['active_months'],r['student_months'],money(r['known_component_subtotal_usd']),money(r['modeled_gap_usd']),money(r['estimated_total_usd']),money(r['cost_per_student_month_usd'])] for r in e['schools'] if r['real_school'] and (r['student_months'] or r['estimated_total_usd'])]),
        '### Activity without a recoverable school link',
        table(['Organization bucket','Student-months','Known subtotal','Modeled gap','Full-period estimate'],[
            [r['organization'],r['student_months'],money(r['known_component_subtotal_usd']),money(r['modeled_gap_usd']),money(r['estimated_total_usd'])] for r in e['schools'] if not r['real_school'] and (r['student_months'] or r['estimated_total_usd'])]),
        f'**Named schools: {money(s["named_school_allocated_usd"])}; school-unassigned activity: {money(s["school_unassigned_usd"])}; unallocated overhead: {money(s["unallocated_overhead_usd"])}; '
        f'total: {money(s["estimated_total_usd"])}.** School records with no retained activity or allocated cost remain in the JSON with zero allocation; '
        'zero allocation does not establish that the school incurred no historical cost. Legacy duplicate school names remain separate by organization.',
        '## Calculation and limits',
        f'- AI gap estimate: each school’s tutor messages **before the first LLM log timestamp** × **${c["usd_per_pre_log_tutor_message"]:.5f} per message**. '
        f'The rate is {money(c["ai_usd"])} of included AI cost divided by {c["tutor_messages"]:,} tutor messages across '
        f'{", ".join(c["ai_months"])} (the first three full log months, before newer summer caching). This spreads total included AI, including grading, '
        'over tutor activity as a proxy. Historical models, prompt lengths and feature mix may differ; non-tutor use without tutor messages is not recoverable from this proxy.\n'
        '- February 2026 keeps its logged costs and models only messages before February 21’s exact log-start timestamp. '
        'It does not charge a full-month proxy on top of partial-month logs. Later logged costs retain the prior attribution and shared-cost methodology.\n'
        f'- AWS gap estimate: **{money(c["aws_monthly_baseline_usd"])} per missing month**, the median account spend of '
        f'{", ".join(c["aws_months"])}. This is a flat earlier-hosting assumption, not evidence of those bills. '
        'Each month’s hosting is allocated by that month’s active students; zero-active months remain unallocated.\n'
        '- Active means a retained tutor message, comment reply, accepted save or submission. Deleted history, missing token counts, missing legacy cache fields, '
        'changing telemetry coverage and historical account/school mappings limit accuracy. Missing logs stay missing in the source report; the scenario does not rewrite them.\n'
        '- AWS includes multiple environments. Prices exclude support/onboarding labor, payment fees and other delivery costs. These are operating costs, not selling prices or gross margins. '
        'Use school revenue and paid-seat history before calculating margin. This scenario is not an invoice reconciliation.',
        '## Monthly account estimate',
        table(['Month','Student-months','Log-based AI','Modeled AI gap','Recorded AWS','Modeled AWS gap','Total estimate','Unallocated'],[
            [r['month'],r['student_months'],money(r['known_ai_usd']),money(r['modeled_ai_usd']),money(r['known_aws_usd']),money(r['modeled_aws_usd']),money(r['estimated_total_usd']),money(r['unallocated_overhead_usd'])] for r in e['months']]),
        'A zero in a known-component column means no available component was added to the subtotal; it does not mean the missing bill was zero. '
        'The adjacent modeled column supplies the planning assumption.',
        '## School monthly detail']
    for school in e['schools']:
        if not school['student_months'] and not school['estimated_total_usd']:continue
        parts.extend([f'### {school["school"]} / {school["organization"]}',
            table(['Month','Active students','Log-based AI','Modeled AI gap','Recorded AWS allocation','Modeled AWS allocation','Total estimate','Cost / active student'],[
                [r['month'],r['active_students'],money(r['known_ai_usd']),money(r['modeled_ai_usd']),money(r['known_aws_usd']),money(r['modeled_aws_usd']),money(r['estimated_total_usd']),money(r['cost_per_active_student_usd'])]
                for r in e['school_months'] if r['school_id']==school['school_id']])])
    return '\n\n'.join(parts)+'\n'
