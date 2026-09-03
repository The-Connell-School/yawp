import copy
import unittest
from history_costs import estimate_history
from costs import estimate_costs
from test_costs import fixture,group


def sample():
    d=fixture([]);d['meta'].update(start_at='2026-01-01',lookback_months=8)
    d['usage']=[];d['aws_costs']=[];d['llm']['groups']=[]
    for month in range(1,10):
        key=f'2026-{month:02d}'
        for sid,n in [('a',1),('b',3)]:
            d['usage'].append(dict(grain='month',period=key+'-01',complete=month<9,school_id=sid,
                 students_with_observed_activity=n,student_tutor_messages=10*n,
                 pre_llm_student_tutor_messages=10*n if month==1 else 5*n if month==2 else 0))
        if month>=2:
            g=group('a');g['month']=key;d['llm']['groups'].append(g)
        if 2<=month<9:d['aws_costs'].append(dict(month=key,amount=100,available=True,unit='USD'))
    d['llm']['calls']=len(d['llm']['groups']);d['cost_estimates']=estimate_costs(d)
    return d


class HistoryCostsTests(unittest.TestCase):
    def test_known_and_modeled_costs_are_separate_and_reconcile(self):
        d=sample();before=copy.deepcopy(d);e=estimate_history(d)
        self.assertEqual(d,before)
        a=next(r for r in e['schools'] if r['school_id']=='a')
        self.assertAlmostEqual(a['known_ai_usd'],21)
        self.assertAlmostEqual(a['modeled_ai_usd'],1.125)
        self.assertAlmostEqual(a['known_aws_usd'],175)
        self.assertAlmostEqual(a['modeled_aws_usd'],25)
        self.assertAlmostEqual(e['summary']['estimated_total_usd'],825.5)
        self.assertAlmostEqual(sum(r['estimated_total_usd'] for r in e['schools']),825.5)

    def test_partial_log_month_only_models_messages_before_cutoff(self):
        e=estimate_history(sample());r=next(r for r in e['months'] if r['month']=='2026-02')
        self.assertAlmostEqual(r['known_ai_usd'],3)
        self.assertAlmostEqual(r['modeled_ai_usd'],1.5)

    def test_current_month_is_excluded_from_full_period(self):
        e=estimate_history(sample());self.assertEqual(len(e['months']),8)
        self.assertEqual(e['end_exclusive'],'2026-09-01');self.assertEqual(e['summary']['student_months'],32)

    def test_missing_exact_gap_count_fails_instead_of_guessing_partial_month(self):
        d=sample();del d['usage'][0]['pre_llm_student_tutor_messages']
        with self.assertRaisesRegex(ValueError,'pre-log'):estimate_history(d)

    def test_no_calibration_does_not_invent_unit_rate(self):
        d=sample();d['cost_estimates']['months']=[]
        with self.assertRaisesRegex(ValueError,'calibration'):estimate_history(d)

    def test_zero_usage_keeps_hosting_unallocated(self):
        d=sample()
        for r in d['usage']:
            if r['period']=='2026-01-01':
                r['students_with_observed_activity']=r['student_tutor_messages']=r['pre_llm_student_tutor_messages']=0
        d['cost_estimates']=estimate_costs(d);e=estimate_history(d)
        self.assertEqual(e['summary']['unallocated_overhead_usd'],100)
        self.assertAlmostEqual(sum(r['estimated_total_usd'] for r in e['schools'])+100,e['summary']['estimated_total_usd'])

    def test_missing_month_or_school_is_rejected(self):
        d=sample();d['usage'].pop(0)
        with self.assertRaisesRegex(ValueError,'grid'):estimate_history(d)

    def test_unassigned_school_cost_is_not_presented_as_a_named_school(self):
        d=sample();d['schools'][1]['real_school']=False;e=estimate_history(d)
        b=next(r for r in e['schools'] if r['school_id']=='b')
        self.assertEqual(e['summary']['school_unassigned_usd'],b['estimated_total_usd'])
        self.assertAlmostEqual(e['summary']['named_school_allocated_usd']+e['summary']['school_unassigned_usd'],e['summary']['school_allocated_usd'])

    def test_no_aws_baseline_is_not_zero_hosting(self):
        d=sample();d['aws_costs']=[]
        with self.assertRaisesRegex(ValueError,'AWS'):estimate_history(d)
