"""Auditable list-price estimates from aggregate token logs; no network or customer payloads."""
from collections import defaultdict
from decimal import Decimal

PRICING = {
    'verified_on': '2026-09-03',
    'source': 'https://platform.claude.com/docs/en/about-claude/pricing',
    'basis': 'Standard direct Anthropic API, USD per million tokens; 5-minute cache writes',
    'models': {'claude-sonnet-4-6': {'input_tokens': 3, 'output_tokens': 15,
                                   'cache_creation_tokens': 3.75, 'cache_read_tokens': .30}},
}


def price_tokens(row):
    for field in ('input_tokens','output_tokens','cache_creation_tokens','cache_read_tokens'):
        if not isinstance(row[field],int) or row[field]<0:
            raise ValueError('Token counts must be nonnegative integers')
    prices=PRICING['models'].get(row['model']) if row['provider']=='anthropic' else None
    if prices is None:
        return None
    return float(sum(Decimal(row[k])*Decimal(str(v)) for k,v in prices.items())/Decimal(1000000))


def estimate_costs(data):
    llm=data['llm'];groups=llm.get('groups') or []
    if sum(g['calls'] for g in groups)!=llm['calls']:
        raise ValueError('LLM aggregate call counts do not reconcile')
    schools={s['school_id']:s for s in data['schools']}
    usage=defaultdict(list);seen=set()
    for r in data['usage']:
        if r['grain']!='month':continue
        key=(r['period'][:7],r['school_id'])
        if key in seen or r['school_id'] not in schools:raise ValueError('Duplicate or unknown cost school-period')
        seen.add(key);usage[key[0]].append(r)
    aws={r['month']:r for r in data.get('aws_costs',[])}
    priced=[dict(g,estimated_usd=price_tokens(g)) for g in groups]
    first=llm.get('earliest');result=[];school_rows=[]
    for month,us in sorted(usage.items()):
        gs=[r for r in priced if r['month']==month]
        if first is None or month<first[:7]:coverage='unavailable'
        elif month==first[:7] and first[8:10]!='01':coverage='partial log month'
        elif month==data['meta']['as_of'][:7]:coverage='month to date'
        else:coverage='full calendar month of retained logs'
        unknown=sum(g['calls'] for g in gs if g['estimated_usd'] is None)
        ai=sum(g['estimated_usd'] or 0 for g in gs) if coverage!='unavailable' and not unknown else None
        excluded=sum(g['estimated_usd'] or 0 for g in gs if g['attribution']=='excluded')
        shared=sum(g['estimated_usd'] or 0 for g in gs if g['attribution']=='unattributed')
        direct=sum(g['estimated_usd'] or 0 for g in gs if g['school_id'] is not None)
        if any(g['school_id'] is not None and g['school_id'] not in schools for g in gs):
            raise ValueError('Unknown LLM school')
        if ai is not None and abs(ai-excluded-shared-direct)>1e-7:raise ValueError('AI attribution does not reconcile')
        cost=aws.get(month,{})
        hosting=cost.get('amount')
        if hosting is not None and cost.get('unit')!='USD':raise ValueError('AWS currency must be USD')
        students=sum(r['students_with_observed_activity'] for r in us)
        messages=sum(r['student_tutor_messages'] for r in us)
        complete=coverage=='full calendar month of retained logs' and hosting is not None and ai is not None
        combined=hosting+ai-excluded if hosting is not None and ai is not None else None
        # Shared AI uses tutor-message share; with no messages, active-student share.
        # Hosting always uses active-student share. Zero activity retains unallocated overhead.
        unallocated=(hosting or 0) if not students else 0
        if not messages and not students:unallocated+=shared
        current=[]
        for r in sorted(us,key=lambda x:x['school_id']):
            sid=r['school_id'];n=r['students_with_observed_activity'];t=r['student_tutor_messages']
            direct_school=sum(g['estimated_usd'] or 0 for g in gs if g['school_id']==sid)
            aws_share=hosting*n/students if hosting is not None and students else (0 if hosting is not None else None)
            shared_share=shared*(t/messages if messages else n/students if students else 0)
            school_ai=direct_school+shared_share if ai is not None else None
            total=aws_share+school_ai if aws_share is not None and school_ai is not None else None
            current.append(dict(month=month,school_id=sid,school=schools[sid]['school'],organization=schools[sid]['organization'],
                active_students=n,tutor_messages=t,coverage=coverage,direct_ai_usd=direct_school if ai is not None else None,
                shared_ai_allocated_usd=shared_share if ai is not None else None,aws_allocated_usd=aws_share,
                combined_estimated_usd=total,cost_per_active_student_usd=total/n if complete and n else None))
        if combined is not None and abs(sum(r['combined_estimated_usd'] for r in current)+unallocated-combined)>1e-7:
            raise ValueError('School cost allocations do not reconcile')
        school_rows.extend(current)
        result.append(dict(month=month,coverage=coverage,calls=sum(g['calls'] for g in gs),
            missing_token_calls=sum(g['missing_token_calls'] for g in gs),
            missing_cache_calls=sum(g['missing_cache_calls'] for g in gs),unknown_price_calls=unknown,
            active_student_school_memberships=students,anthropic_estimated_usd=ai,direct_ai_usd=direct,
            shared_ai_usd=shared,excluded_ai_usd=excluded,aws_usd=hosting,combined_estimated_usd=combined,
            unallocated_overhead_usd=unallocated,cost_per_active_student_usd=combined/students if complete and students else None))
    comparable_months={r['month'] for r in result if r['coverage']=='full calendar month of retained logs' and r['combined_estimated_usd'] is not None}
    comparable_rows=[r for r in result if r['month'] in comparable_months]
    student_months=sum(r['active_student_school_memberships'] for r in comparable_rows)
    total=sum(r['combined_estimated_usd'] for r in comparable_rows)
    comparable=dict(months=sorted(comparable_months),student_months=student_months,
        combined_estimated_usd=total if comparable_months else None,
        anthropic_estimated_usd=sum(r['anthropic_estimated_usd'] for r in comparable_rows),
        excluded_ai_usd=sum(r['excluded_ai_usd'] for r in comparable_rows),
        aws_usd=sum(r['aws_usd'] for r in comparable_rows),
        unallocated_overhead_usd=sum(r['unallocated_overhead_usd'] for r in comparable_rows),
        cost_per_student_month_usd=total/student_months if student_months else None)
    rollup=[]
    for sid,school in sorted(schools.items()):
        rows=[r for r in school_rows if r['school_id']==sid and r['month'] in comparable_months]
        n=sum(r['active_students'] for r in rows);amount=sum(r['combined_estimated_usd'] for r in rows)
        if n or amount:
            rollup.append(dict(school_id=sid,school=school['school'],organization=school['organization'],
                student_months=n,direct_ai_usd=sum(r['direct_ai_usd'] for r in rows),
                shared_ai_allocated_usd=sum(r['shared_ai_allocated_usd'] for r in rows),
                aws_allocated_usd=sum(r['aws_allocated_usd'] for r in rows),combined_estimated_usd=amount,
                average_monthly_school_cost_usd=amount/len(comparable_months),cost_per_student_month_usd=amount/n if n else None))
    return dict(as_of=data['meta']['as_of'],requested_start=data['meta']['start_at'],pricing=PRICING,earliest=first,months=result,schools=school_rows,token_groups=priced,
                comparable=comparable,school_rollup=rollup)


def money(n):
    return f'${n:,.2f}' if n is not None else 'N/A'


def render_costs(estimate, short=False):
    from report import table
    e=estimate;months=e['months'];latest=next((m for m in reversed(months) if m['cost_per_active_student_usd'] is not None),None)
    pieces=['## Estimated AI + AWS cost per student and school',
        f'Anthropic log history begins **{e["earliest"]}**. Earlier AI spend is unavailable. '
        'These are operating-cost estimates, not customer selling prices or audited gross margins.']
    if short and e['comparable']['months']:
        c=e['comparable']
        pieces.append(f"**{c['months'][0]}–{c['months'][-1]} comparable period: {money(c['combined_estimated_usd'])} across "
            f"{c['student_months']:,} active student-school months = {money(c['cost_per_student_month_usd'])} per active student-month.** "
            "School rollups and every monthly cost are in COST-ESTIMATES.md.")
    if latest:
        pieces.append(f'**{latest["month"]}**: {money(latest["anthropic_estimated_usd"])} estimated Anthropic + '
            f'{money(latest["aws_usd"])} AWS, less {money(latest["excluded_ai_usd"])} identifiable QA/internal AI = '
            f'**{money(latest["combined_estimated_usd"])}**, or **{money(latest["cost_per_active_student_usd"])} per active student-school membership** '
            f'({latest["active_student_school_memberships"]:,} active memberships). '
            f'{latest["missing_token_calls"]} calls lack full token counts; their missing tokens are not estimated.')
        rows=[r for r in e['schools'] if r['month']==latest['month'] and (r['active_students'] or (r['combined_estimated_usd'] or 0))]
        pieces.append(table(['School / organization','Active students','Direct AI','Allocated shared AI','Allocated AWS','Total est. cost','Cost / active student'],[
            [r['school']+' / '+r['organization'],r['active_students'],money(r['direct_ai_usd']),money(r['shared_ai_allocated_usd']),money(r['aws_allocated_usd']),money(r['combined_estimated_usd']),money(r['cost_per_active_student_usd'])] for r in rows]))
    pieces.append('**Allocation:** directly linked AI stays with its school. Unattributed AI is spread by that month’s student tutor-message share '
        '(active-student share if there are no messages). AWS account spend is spread by that month’s active-student share. '
        'Active means a retained tutor message, comment reply, save or submission. Denominators are student memberships within schools, '
        'not paid seats; a person active at two schools counts in both. Zero activity leaves overhead unallocated and per-student cost N/A. '
        'AWS includes multiple environments. Unattributed AI may include admin/internal use, so this is an allocation scenario.')
    if short:return '\n\n'.join(pieces)
    c=e['comparable']
    if c['months']:
        pieces.append(f"### Comparable period: {c['months'][0]} through {c['months'][-1]}\n\n"
            f"{money(c['anthropic_estimated_usd'])} Anthropic + {money(c['aws_usd'])} AWS − {money(c['excluded_ai_usd'])} identifiable internal AI "
            f"= **{money(c['combined_estimated_usd'])}**, divided by **{c['student_months']:,} active student-school months** "
            f"= **{money(c['cost_per_student_month_usd'])} per active student-month**. "
            f"Unallocated overhead: {money(c['unallocated_overhead_usd'])}. Student-months sum monthly memberships; they are not unique students across the period.")
        pieces.append(table(['School / organization','Active student-months','Direct AI','Shared AI','AWS','Period total','Average monthly school cost','Cost / student-month'],[
            [r['school']+' / '+r['organization'],r['student_months'],money(r['direct_ai_usd']),money(r['shared_ai_allocated_usd']),money(r['aws_allocated_usd']),money(r['combined_estimated_usd']),money(r['average_monthly_school_cost_usd']),money(r['cost_per_student_month_usd'])] for r in e['school_rollup']]))
    pieces.extend([
        '### Pricing and uncertainty',
        'Formula: (uncached input × 3 + output × 15 + cache writes × 3.75 + cache reads × 0.30) / 1,000,000, in USD, '
        'for the observed `claude-sonnet-4-6` model. [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing), verified September 3, 2026. '
        'Input and cache categories are additive; output and multi-round totals are counted as logged. The application uses standard direct API calls '
        'with five-minute ephemeral caching. Absent legacy cache fields are treated as zero; unknown model/provider prices suppress totals. '
        'This uses list prices, with no invoice reconciliation, discounts or credits. Failed calls with missing token totals can undercount spend. '
        'No token reconstruction from student text is attempted.',
        '**Attribution:** metadata document/submission/session/class IDs first, otherwise a unique exact retained assistant-response match within 60 seconds '
        'after the log timestamp, unique on both sides. Text comparison stays inside PostgreSQL. School links follow preserved document/class evidence '
        'and the existing report’s inference rules. Identifiable QA/internal/teacher-practice records are excluded; missing links stay shared. '
        'A linked cost is still historical inference, not a vendor billing attribution.',
        '### Monthly costs',
        table(['Month','Log coverage','Calls','Missing token counts','Missing cache fields','Anthropic est.','QA/internal AI','AWS','Combined est.','Active school memberships','Cost / active student'],[
            [r['month'],r['coverage'],r['calls'],r['missing_token_calls'],r['missing_cache_calls'],money(r['anthropic_estimated_usd']),money(r['excluded_ai_usd']),money(r['aws_usd']),money(r['combined_estimated_usd']),r['active_student_school_memberships'],money(r['cost_per_active_student_usd'])] for r in months]),
        'Monthly rates are shown only for complete calendar months within the retained log period with AWS data. '
        'The first partial log month and current month-to-date are not comparable full-month rates. No two-year all-in total is claimed.',
        '### Token and attribution reconciliation',
        table(['Month','Model','Attribution','Calls','Input tokens','Output tokens','Cache write tokens','Cache read tokens','Estimated USD'],[
            [r['month'],r['model'],r['attribution'],r['calls'],r['input_tokens'],r['output_tokens'],r['cache_creation_tokens'],r['cache_read_tokens'],money(r['estimated_usd'])] for r in summarize_groups(e['token_groups'])]),
        '### School monthly cost history',
        table(['Month','School / organization','Active students','Direct AI','Shared AI allocation','AWS allocation','Combined est.','Cost / active student'],[
            [r['month'],r['school']+' / '+r['organization'],r['active_students'],money(r['direct_ai_usd']),money(r['shared_ai_allocated_usd']),money(r['aws_allocated_usd']),money(r['combined_estimated_usd']),money(r['cost_per_active_student_usd'])] for r in e['schools'] if r['active_students'] or (r['combined_estimated_usd'] or 0)]),
        '**Using this for pricing:** the school table gives estimated monthly delivery cost at observed usage. For a proposed school, use its expected active '
        'students and activity level; allocating existing AWS overhead does not measure marginal infrastructure cost. Revenue, payment fees, support/onboarding labor '
        'and other delivery costs are still needed for gross margin and a selling-price decision. Do not annualize one summer month as a school-year forecast.',
    ])
    return '\n\n'.join(pieces)+'\n'


def summarize_groups(groups):
    combined={}
    for g in groups:
        key=(g['month'],g['model'],g['attribution'])
        if key not in combined:combined[key]=dict(g,calls=0,input_tokens=0,output_tokens=0,cache_creation_tokens=0,cache_read_tokens=0,estimated_usd=0)
        r=combined[key]
        for k in ('calls','input_tokens','output_tokens','cache_creation_tokens','cache_read_tokens'):r[k]+=g[k]
        r['estimated_usd']=None if r['estimated_usd'] is None or g['estimated_usd'] is None else r['estimated_usd']+g['estimated_usd']
    return [combined[k] for k in sorted(combined)]
