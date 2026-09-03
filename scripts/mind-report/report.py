"""Render an aggregate MIND snapshot. Standard library only; no network on import."""
import argparse
import json
import pathlib


def cell(value):
    return str(value if value is not None else 'N/A').replace('|', '\\|').replace('\n', ' ')


def rate(numerator, denominator):
    return f'{100 * numerator / denominator:.1f}%' if denominator else 'N/A'


def change(current, previous):
    return f'{100 * (current - previous) / previous:+.1f}%' if previous else 'N/A (prior 0)'


def last_complete_periods(rows, grain):
    return sorted({r['period'] for r in rows if r['grain'] == grain and r['complete']})[-2:]


def table(headers, rows):
    return '\n'.join(['| ' + ' | '.join(map(cell, headers)) + ' |',
                      '| ' + ' | '.join('---' for _ in headers) + ' |'] +
                     ['| ' + ' | '.join(map(cell, row)) + ' |' for row in rows])


def validate(data):
    q = data['quality']
    if q['all_submissions'] != q['included_submissions'] + q['excluded_submissions']:
        raise ValueError('Submission inclusion/exclusion counts do not reconcile')
    if sum(x['submissions'] for x in q.get('attribution', [])) != q['included_submissions']:
        raise ValueError('Submission attribution counts do not reconcile')
    if data['meta']['read_only'] != 'on':
        raise ValueError('Snapshot was not taken in a read-only transaction')
    school_ids = {s['school_id'] for s in data['schools']}
    seen = set()
    for row in data['usage']:
        key = (row['grain'], row['period'], row['school_id'])
        if key in seen or row['school_id'] not in school_ids:
            raise ValueError('Duplicate or unknown school-period')
        seen.add(key)
        if row['student_submitters'] > row['submissions'] or row['resubmissions'] > row['submissions']:
            raise ValueError('Impossible submission counts')
    for row in data['portfolio_usage']:
        school_total = sum(r['submissions'] for r in data['usage'] if
                           (r['grain'], r['period']) == (row['grain'], row['period']))
        if row['submissions'] != school_total:
            raise ValueError('School and portfolio submissions do not reconcile')


def render(data):
    validate(data)
    meta, quality = data['meta'], data['quality']
    schools = {s['school_id']: s for s in data['schools']}
    usage = {(r['grain'], r['period'], r['school_id']): r for r in data['usage']}
    portfolio = {(r['grain'], r['period']): r for r in data['portfolio_usage']}
    months = last_complete_periods(data['usage'], 'month')
    weeks = last_complete_periods(data['usage'], 'week')
    last_month, prev_month = months[-1], months[-2]
    last_week, prev_week = weeks[-1], weeks[-2]
    month, week = portfolio['month', last_month], portfolio['week', last_week]
    current_month = meta['as_of'][:7] + '-01'
    nteachers = sum(o['registered_teachers'] for o in data['organizations'])
    nstudents = sum(o['registered_students'] for o in data['organizations'])
    activated = quality['unique_activated_teacher_memberships']
    first_retained = next(r['earliest'] for r in quality['coverage'] if r['source']=='retained_submissions')
    first_month = first_retained[:7]+'-01' if first_retained else meta['start_at'][:10]
    leading = sorted((r for r in data['usage'] if r['grain']=='month' and r['period']==last_month),
                     key=lambda r:r['submissions'], reverse=True)[0]
    parts = [f'# Yawp investor-coaching MIND report\n\nProduction snapshot: **{meta["as_of"]}**. '
             'UTC calendar months and Monday–Sunday weeks. Internal meeting preparation; aggregate data only.',
             '## What Brian can say on the call\n\n'
             f'“We can report school usage now. In {last_month[:7]}, the retained production data shows '
             f'**{month["submissions"]:,} submissions from {month["student_submitters"]:,} student memberships across '
             f'{month["schools_with_submissions"]} school records**. '
             f'{schools[leading["school_id"]]["school"]} generated {leading["submissions"]:,} of those submissions '
             f'({rate(leading["submissions"], month["submissions"])}). '
             'We have account and engagement proxies for activation and adoption. '
             'Renewal, revenue retention, paid school licensing, and gross margins need our contract, billing, and cost records joined to this report.”',
             table(['Measure', 'Result', 'Interpretation'], [
                 ['Registered account memberships', f'{nteachers:,} teachers; {nstudents:,} students', 'Non-admin, non-test accounts in included organizations; not paid licenses or unique people'],
                 ['Observed teacher activation proxy', f'{activated}/{nteachers} ({rate(activated, nteachers)})', 'Ever attributed feedback OR a submission in a currently linked class; not selected-teacher conversion'],
                 ['Last complete week', f'{last_week}: {week["submissions"]} submissions', f'Prior week {prev_week}: {portfolio["week",prev_week]["submissions"]}; {change(week["submissions"],portfolio["week",prev_week]["submissions"])}'],
                 ['Last complete month', f'{last_month[:7]}: {month["submissions"]} submissions', f'Prior month {prev_month[:7]}: {portfolio["month",prev_month]["submissions"]}; summer-to-term comparison'],
                 ['This month so far', f'{portfolio["month",current_month]["submissions"]} submissions', 'Partial month; do not compare directly with a full month'],
             ]),
             '## Answers to each coach request\n\n' + table(['Request','What is available now','Gap / practical next input'],[
                 ['School renewal rate','Not reliably measurable from app data. accessExpiresAt is an access setting, not a renewal event.','Brian: school contract ID, end date, renewal due date, renewed/not-renewed decision and decision date. Rate = renewed schools / schools due for renewal in the period.'],
                 ['NRR by school','Not reliably measurable. No complete school recurring-revenue ledger in this DB.','Brian: beginning recurring revenue + expansion − contraction − churn for the same opening school cohort, divided by beginning recurring revenue. Exclude new schools. For each school, compare ending vs starting recurring revenue on a consistent basis.'],
                 ['Licensed teachers and students by school','School-linked registered accounts and current-year class rosters below. Organization-level seat settings are also available. UA has an explicit student-license ledger.','Confirm purchased seats, contract school allocations, covered dates and billing model. Current seat settings and memberships are not a historical paid-license record.'],
                 ['Teacher activation rate and speed','Observed registered-teacher activation and median days to first signal by school below; monthly cohorts in the snapshot.','Need the selected/invited teacher roster and selection date. Invitations are deleted during verification; retained invitations cannot reconstruct that denominator.'],
                 ['Weekly teacher usage by school','Distinct attributed feedback teachers, teachers linked to classes with submissions, and teachers linked to assignment deployments. Weekly and monthly tables below.','Class membership is current; assignments have no creator field. These class signals are proxies, not proof each co-teacher personally acted.'],
                 ['Student usage by school','Unique submitters, submissions, grades, releases and repeat submissions. Recent accepted saves supplement usage.','Saves are not proof of meaningful revision; no login-only DAU/WAU claim. Historical data is retained state, not a complete event warehouse.'],
                 ['Gross margin: student licensing','Not calculable without matched revenue and direct costs. UA licenses give limited license status, not whole-company revenue.','Recognized licensing revenue less allocated hosting/AI/payment/other direct delivery costs; divide by licensing revenue. Zero revenue is N/A.'],
                 ['Gross margin: teacher onboarding/support','Not calculable without service revenue and delivery/support cost records.','Service revenue less loaded delivery/support labor and direct tools/travel; divide by matching revenue. Agree allocation if bundled with licensing. Zero revenue is N/A.'],
             ]),
             '## Usage trends\n\nSubmitted, graded and released are counted by their own timestamps; '
             'they can refer to different cohorts. Grade timestamps are the currently retained values and can move after regrading. '
             'Repeat submissions count the second and later submission for a document, not confirmed text revisions. '
             'Student counts are distinct membership IDs per period, deduplicated across schools in this summary.']
    headers = ['Period','Complete?','Schools submitting','Student submitters','Submissions','Graded','Released','Repeat submissions','Teacher feedback actors']
    for grain, title in [('month','Monthly'),('week','Weekly')]:
        rows=[]
        for (g, period), p in sorted(portfolio.items()):
            if g!=grain or (grain=='month' and period < first_month): continue
            sr=[r for r in data['usage'] if r['grain']==grain and r['period']==period]
            rows.append([period,'Yes' if p['complete'] else 'PARTIAL',p['schools_with_submissions'],p['student_submitters'],p['submissions'],
                         sum(r['graded_submissions'] for r in sr),sum(r['released_submissions'] for r in sr),sum(r['resubmissions'] for r in sr),p['direct_feedback_teachers']])
        parts.append(f'### {title}\n\n'+table(headers,rows))
    parts.append(f'The first retained submission is {first_retained}. Earlier periods have **no retained submission history**, '
                 'not proven zero use. The first historical month may be truncated. School holidays and term starts affect comparisons; a summer-to-term rebound is not a retention conclusion.')
    parts.append('## School account and activation snapshot\n\n'
                 '“Registered” means surviving non-admin, non-test organization memberships associated with this school. '
                 'Unlinked members fall back to the organization’s sole school only when that mapping is unambiguous; otherwise they remain unassigned. '
                 f'Current-year students are distinct members on non-archived {meta["school_year"]} classes. Older school-year labels may not have been updated. '
                 'School-linked counts are not additive: a teacher/student may link to multiple schools. '
                 'A school row is not proof of a paying customer, and legacy/current rows for the same institution remain separate.\n\n'
                 'Activation = first observed teacher-attributed feedback **or** student submission in a currently linked class. '
                 'Speed starts at OrgMembership.createdAt and measures time to the first retained signal. '
                 'It is not time from invitation or necessarily the teacher’s true first-ever activity. '
                 'Empty speed means no qualifying observation. Admin accounts are excluded from teacher metrics, including schools operated by an administrator.')
    visible=[s for s in data['schools'] if s['real_school'] or s['registered_teachers'] or s['registered_students']]
    parts.append(table(['Organization / school','Teachers','Students',meta['school_year']+' roster','Activated / teachers','Median days (n)'],[
        [f'{s["organization"]} / {s["school"]}',s['registered_teachers'],s['registered_students'],s['current_year_students'],
         f'{s["activated_teachers"]}/{s["registered_teachers"]} ({rate(s["activated_teachers"],s["registered_teachers"])})',
         f'{s["median_activation_days"]:.1f} ({s["activation_speed_sample"]})' if s['median_activation_days'] is not None else 'N/A'] for s in visible]))
    parts.append('## Latest complete-week school engagement\n\n'
                 f'Week beginning **{last_week}**. Rates use the **current registered school roster**, not a historical licensed population. '
                 '“Feedback” is an attributable grading/comment action; “class signal” includes current teachers linked to assignment deployments or student submissions. '
                 'Zero means no retained qualifying signal; it does not establish absence, churn, or nonpayment.\n\n'+table(
                 ['Organization / school','Feedback teachers','Teachers with class/feedback signal','Student submitters','Submitter / current roster','Submissions','Prior week'],[
                     [f'{s["organization"]} / {s["school"]}',usage['week',last_week,s['school_id']]['direct_feedback_teachers'],
                      f'{usage["week",last_week,s["school_id"]]["teachers_with_any_signal"]}/{s["registered_teachers"]}',
                      usage['week',last_week,s['school_id']]['student_submitters'],
                      rate(usage['week',last_week,s['school_id']]['student_submitters'],s['registered_students']),
                      usage['week',last_week,s['school_id']]['submissions'],usage['week',prev_week,s['school_id']]['submissions']] for s in visible]))
    parts.append('## Monthly school submission trends\n\nSeparate rows preserve organization context; no speculative merging of duplicate school names.')
    trend_months=sorted({r['period'] for r in data['usage'] if r['grain']=='month' and r['period']>=first_month})
    parts.append(table(['Organization / school']+[m[:7]+(' *' if m==current_month else '') for m in trend_months],[
        [f'{s["organization"]} / {s["school"]}']+[usage['month',m,s['school_id']]['submissions'] for m in trend_months] for s in visible]))
    parts.append('* Current month is partial. School-period assignment, student, grading and activation-cohort detail is in the aggregate snapshot accompanying this report.')
    recent_weeks = sorted({r['period'] for r in data['usage'] if r['grain']=='week'})[-6:]
    parts.append('## Weekly school teacher and student trends\n\n'
                 'Teacher cells count distinct non-admin memberships with attributable feedback or a current-class assignment/submission signal. '
                 'Student cells count distinct submitters. These stable submission-based student trends are separate from recently added save telemetry. '
                 'The final week is partial; school counts must not be added to obtain unique people.')
    for metric, title in [('teachers_with_any_signal','Teachers with a qualifying signal'),('student_submitters','Student submitters')]:
        parts.append('### '+title+'\n\n'+table(['Organization / school']+[
            w+(' *' if not portfolio['week',w]['complete'] else '') for w in recent_weeks],[
                [f'{s["organization"]} / {s["school"]}']+[usage['week',w,s['school_id']][metric] for w in recent_weeks] for s in visible]))
    month_rows = [r for r in data['usage'] if r['grain']=='month' and r['period']==last_month and
                  any(r[k] for k in ('submissions','assignment_deployments','saved_documents','graded_submissions'))]
    parts.append(f'## {last_month[:7]} school activity detail\n\n'
                 'A deployment assigns one template to one class; the same template can have multiple deployments. '
                 'Assignment counts include admin-created assignments in included schools because creator identity is not retained. '
                 'Saved-document counts include accepted saves from the available recent journal only.\n\n'+table(
                 ['School / organization','Templates deployed','Class deployments','Student submitters','Submissions','Graded','Released','Repeat submissions','Saved documents'],[
                     [f'{schools[r["school_id"]]["school"]} / {schools[r["school_id"]]["organization"]}',r['distinct_assignments'],r['assignment_deployments'],r['student_submitters'],
                      r['submissions'],r['graded_submissions'],r['released_submissions'],r['resubmissions'],r['saved_documents']] for r in month_rows]))
    parts.append('## Organization seat configuration\n\nThese are configured capacity settings, **not verified purchased licenses**. '
                 'For organizations spanning several schools, school seat allocation is unknown. Null expiry means no configured cutoff; it does not mean renewed.\n\n'+table(
                 ['Organization','School records','Teacher seat setting','Student seat setting','Access expiry'],[
                     [o['organization'],o['school_records'],o['configured_teacher_seats'],o['configured_student_seats'],o['access_expires_at'] or 'Not set'] for o in data['organizations']]))
    parts.append('## UA student-license ledger\n\nThis is a narrow exception to external billing: the new UA flow has its own ledger. '
                 'These rows are shown before user-email exclusions so manual, pending and refunded statuses reconcile. '
                 'A manual active license is an entitlement, not evidence of a payment. Recorded amountPaid on a refunded row is historical gross payment, not retained revenue.\n\n'+table(
                 ['Organization','Cohort','Status','Source','Rows','Currently valid active','Recorded gross minor units','Currency'],[
                     [r['organization'],r['cohort'],r['status'],r['source'],r['license_rows'],r['valid_active_license_rows'],r['amount_paid_minor_units'],r['currency']] for r in (data['licenses'] or [])]))
    if data.get('aws_costs'):
        parts.append('## Partial cost input: AWS account spend\n\n'
                     'Read from AWS Cost Explorer using the Yawp account profile. Unblended cost includes all returned account services/environments, '
                     'not only production student licensing. This is a cost input, not gross margin. External AI providers, support labor and payment fees are not established here.\n\n'+table(
                     ['Month','AWS unblended cost','Currency','AWS estimated?'],[
                         [r['month'],f'{r["amount"]:.2f}',r['unit'],r['estimated']] for r in data['aws_costs']]))
    parts.append('## Data quality and verification\n\n'+table(['Check','Result'],[
        ['Read-only consistent snapshot',meta['read_only']],
        ['Retained production submissions',quality['all_submissions']],
        ['Included + excluded',f'{quality["included_submissions"]} + {quality["excluded_submissions"]} = {quality["all_submissions"]}'],
        ['School attribution', '; '.join(f'{r["attribution"]}: {r["submissions"]}' for r in quality['attribution'])],
        ['Excluded organization records',quality['excluded_organizations']],
        ['Additional internal/unverified school labels excluded',quality['excluded_or_unverified_school_labels']],
        ['Eligible memberships / all retained memberships',f'{quality["eligible_memberships"]} / {quality["all_memberships"]}'],
        ['Memberships linked to multiple schools',quality['multi_school_memberships']],
        ['Retained unsubmitted attempts included',quality['unsubmitted_retained']],
    ])+'\n\n'+table(['Source','First retained timestamp','Latest retained timestamp'],[
        [r['source'],r['earliest'],r['latest']] for r in quality['coverage']]))
    parts.append('Exclusions: four known demo/QA/test organizations, eight internal or unverified person/demo school labels, '
                 'admin/superadmin users, obvious test email patterns, and teacher-owned practice documents. The exact rules are in the versioned SQL. '
                 'This is a pragmatic first cut, not Brian’s confirmed customer roster. '
                 'Soft-deleted/archived documents and unsubmitted attempts remain in historical activity counts; permanently deleted rows are unavailable. '
                 'Current memberships and class links can change historical attribution on rerun. '
                 'A save or a repeated submission does not prove a meaningful revision. '
                 'No individual names, emails, essay text, grades, payment identifiers or credentials are exported.')
    parts.append('## Practical weekly process and missing inputs\n\n'
                 '1. Brian supplies one row per school contract: stable school/contract ID, paid seats by role, service dates, renewal due date/outcome, '
                 'and monthly recurring revenue or an explicitly agreed annual-to-monthly basis. Keep one-time charges separate.\n'
                 '2. Capture the selected teacher roster and selected/invited date. Keep one durable status history for activated, disabled and removed teachers. '
                 'Use 30-day activation for mature cohorts; show new cohorts as still in progress.\n'
                 '3. Pull weekly usage with the same exclusions and definitions. Review last complete week, four-week trend, and school calendar context. '
                 'Use teachers with student submissions and attributable feedback as candidate stickiness indicators; validate their relationship to renewals before calling them predictive.\n'
                 '4. Join AWS/AI/payment bills and a simple staff time log with loaded hourly rates. Allocate shared cost once using an agreed driver '
                 '(such as active student usage or measured AI consumption). Separate onboarding/support delivery cost from general sales and product development. '
                 'If onboarding is bundled into licensing, agree on revenue/cost allocation before reporting separate margins.\n'
                 '5. Save each dated snapshot. Historical seat configuration, membership status and school links are not fully recoverable from today’s mutable tables.\n\n'
                 '**Source-system locations:** product usage and account state are in Yawp production PostgreSQL; UA payment status is in StudentLicense/Stripe; '
                 'AWS spend is in Cost Explorer. The coach/Brian says school payments and renewals are external; the specific contract, accounting, payment and time-tracking systems still need to be identified by Brian.\n\n'
                 '**Source references:** packages/prisma/schema.prisma; migrations/20260414130000_unify_assignment_model and '
                 '20260612120000_assignment_templates_and_class_assignments preserve legacy class links and assignment timestamps; '
                 'auth.inv.verify/route.tsx deletes verified invitations; scripts/mind-report/report.sql defines this report. '
                 'The snapshot provenance records the query checksum and repository SHA.')
    return '\n\n'.join(parts)+'\n'


def brief(data):
    """Call-ready short version; detailed definitions remain in MIND-report.md."""
    validate(data)
    schools = {s['school_id']: s for s in data['schools']}
    last_month = last_complete_periods(data['usage'], 'month')[-1]
    prev_week, last_week = last_complete_periods(data['usage'], 'week')
    periods = {(r['grain'],r['period']): r for r in data['portfolio_usage']}
    month, week, prior = periods['month',last_month], periods['week',last_week], periods['week',prev_week]
    teachers=sum(o['registered_teachers'] for o in data['organizations'])
    students=sum(o['registered_students'] for o in data['organizations'])
    activated=data['quality']['unique_activated_teacher_memberships']
    rows=[r for r in data['usage'] if r['grain']=='month' and r['period']==last_month and r['submissions']]
    rows.sort(key=lambda r:r['submissions'],reverse=True)
    aws = data.get('aws_costs', [])
    cost_text = '; '.join(f'{r["month"]}: {r["unit"]} {r["amount"]:.2f}' for r in aws) or 'Not included in this run'
    return '\n\n'.join([
        '# Yawp — investor-coaching call brief',
        f'Production read: {data["meta"]["as_of"]}. Full school tables and definitions: MIND-report.md.',
        f'**The useful headline:** {last_month[:7]} had **{month["submissions"]} retained submissions from '
        f'{month["student_submitters"]} student account memberships across {month["schools_with_submissions"]} school records**. '
        'Usage is measurable now; paid retention and margins require Brian’s external business records.',
        table(['School','Student submitters','Submissions','Graded','Repeat submissions'],[
            [schools[r['school_id']]['school'],r['student_submitters'],r['submissions'],r['graded_submissions'],r['resubmissions']] for r in rows]),
        f'**Weekly movement:** week of {last_week}: {week["submissions"]} submissions from {week["student_submitters"]} student memberships, '
        f'versus {prior["submissions"]} submissions the week of {prev_week} ({change(week["submissions"],prior["submissions"])}). '
        'Both are complete UTC weeks. School calendars and concentration matter; this is not a churn estimate.',
        table(['Coach request','Answer for today'],[
            ['School renewal rate','Pending external contract/renewal ledger. App access expiry cannot answer this.'],
            ['NRR by school','Pending school recurring-revenue ledger with beginning revenue, expansion, contraction and churn.'],
            ['Licensed teachers/students',f'{teachers} non-admin teacher memberships and {students:,} student memberships in the included organizations; these are registered accounts, not purchased licenses. School breakdown and configured organization seat limits are attached. UA has a separate entitlement ledger.'],
            ['Teacher activation',f'{activated}/{teachers} ({rate(activated,teachers)}) have an observed feedback or classroom-submission signal. This is a registered-teacher proxy, not conversion of selected teachers. Per-school speed is attached; invitation/selection dates are missing.'],
            ['Weekly teacher usage',f'{week["direct_feedback_teachers"]} non-admin teacher membership with attributable feedback in the last complete week. Class-linked activity and school rates are attached; admin-supported schools are excluded from this teacher count.'],
            ['Student usage',f'{month["student_submitters"]} submitters in {last_month[:7]}; {month["students_with_save_or_submit"]} memberships with a submission or accepted save. Save history starts partway through August, so the latter is a recent-coverage metric.'],
            ['Student licensing gross margin',f'Not yet calculable. AWS account cost input: {cost_text}. This includes multiple environments; add allocated AI, payment and other direct costs and matching licensing revenue.'],
            ['Onboarding/support gross margin','Not yet calculable. Need service revenue (or agreed bundled allocation), delivery/support hours, loaded hourly cost and direct tools/travel.'],
        ]),
        '**Interpretation limits:** known QA/demo/internal records, admin users and teacher-owned practice documents are excluded from student activity. School records include legacy duplicates and pilots, '
        f'so they are not a customer count. The first retained submission is {next(r["earliest"] for r in data["quality"]["coverage"] if r["source"]=="retained_submissions")}; missing earlier history is not zero usage. '
        'A repeated submission is a revision proxy, not proof the text changed. Grade counts use grade timestamps and may concern earlier submissions.',
        '**Brian’s next input:** one school contract/revenue ledger, a selected-teacher roster with selection dates, '
        'and direct-cost/support-time records. Identify the actual external systems holding these; then use a weekly product-data pull plus a monthly manual finance join.'
    ])+'\n'


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('snapshot',type=pathlib.Path)
    parser.add_argument('output',type=pathlib.Path)
    args=parser.parse_args()
    args.output.write_text(render(json.loads(args.snapshot.read_text())))


if __name__=='__main__':
    main()
