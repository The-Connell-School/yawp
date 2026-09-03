import unittest
from costs import price_tokens, estimate_costs


def group(school_id=None, calls=1, **kwargs):
    return dict(month='2026-08', provider='anthropic', model='claude-sonnet-4-6',
                school_id=school_id, attribution='metadata' if school_id else 'unattributed', calls=calls,
                input_tokens=1000000, output_tokens=0, cache_creation_tokens=0, cache_read_tokens=0,
                missing_token_calls=0, missing_cache_calls=0, **kwargs)


def fixture(groups):
    return dict(meta=dict(as_of='2026-09-03', start_at='2024-09-01'),
        llm=dict(earliest='2026-02-21T00:00:00Z', groups=groups, calls=sum(g['calls'] for g in groups)),
        aws_costs=[dict(month='2026-08', amount=100, available=True, unit='USD')],
        schools=[dict(school_id='a', school='A', organization='Org', real_school=True),dict(school_id='b',school='B',organization='Org', real_school=True)],
        usage=[dict(grain='month',period='2026-08-01',complete=True,school_id=s,students_with_observed_activity=n,student_tutor_messages=t) for s,n,t in [('a',1,30),('b',3,10)]])


class CostTests(unittest.TestCase):
    def test_cache_tokens_are_additive_not_subtracted_from_input(self):
        r=group();r.update(output_tokens=2000000,cache_creation_tokens=3000000,cache_read_tokens=4000000)
        self.assertAlmostEqual(price_tokens(r),45.45)

    def test_unknown_model_or_provider_is_not_free(self):
        r=group();r['model']='new-unknown-model';self.assertIsNone(price_tokens(r))
        r['model']='claude-sonnet-4-6';r['provider']='openai';self.assertIsNone(price_tokens(r))

    def test_negative_tokens_rejected(self):
        r=group();r['input_tokens']=-1
        with self.assertRaises(ValueError):price_tokens(r)

    def test_cost_allocation_reconciles_and_uses_distinct_drivers(self):
        d=fixture([group('a'),group()]);e=estimate_costs(d);a,b=e['schools']
        self.assertAlmostEqual(a['aws_allocated_usd'],25)
        self.assertAlmostEqual(a['shared_ai_allocated_usd'],2.25)
        self.assertAlmostEqual(a['combined_estimated_usd'],30.25)
        self.assertAlmostEqual(b['combined_estimated_usd'],75.75)
        self.assertAlmostEqual(sum(r['combined_estimated_usd'] for r in e['schools']),106)

    def test_unknown_rate_suppresses_combined_cost(self):
        r=group();r['model']='unknown';e=estimate_costs(fixture([r]))
        self.assertIsNone(e['months'][0]['combined_estimated_usd'])

    def test_pre_log_month_is_unavailable(self):
        d=fixture([]);d['usage'][0]['period']=d['usage'][1]['period']='2025-08-01'
        d['aws_costs'][0]['month']='2025-08';e=estimate_costs(d)
        self.assertIsNone(e['months'][0]['anthropic_estimated_usd'])
        self.assertIsNone(e['months'][0]['cost_per_active_student_usd'])

    def test_partial_first_month_does_not_become_unit_cost(self):
        d=fixture([group()]);d['llm']['earliest']='2026-08-21T00:00:00Z'
        e=estimate_costs(d);self.assertIsNone(e['months'][0]['cost_per_active_student_usd'])
        self.assertEqual(e['months'][0]['coverage'],'partial log month')

    def test_no_usage_leaves_overhead_unallocated(self):
        d=fixture([group()]);
        for r in d['usage']:r['students_with_observed_activity']=r['student_tutor_messages']=0
        e=estimate_costs(d);self.assertEqual(e['months'][0]['unallocated_overhead_usd'],103)
        self.assertTrue(all(r['cost_per_active_student_usd'] is None for r in e['schools']))

    def test_excluded_cost_not_charged_to_students(self):
        r=group();r['attribution']='excluded';e=estimate_costs(fixture([r]))
        self.assertEqual(e['months'][0]['excluded_ai_usd'],3)
        self.assertAlmostEqual(sum(s['combined_estimated_usd'] for s in e['schools']),100)

    def test_duplicate_school_period_rejected(self):
        d=fixture([group()]);d['usage'].append(d['usage'][0])
        with self.assertRaises(ValueError):estimate_costs(d)

    def test_comparable_rollup_uses_student_months(self):
        d=fixture([group('a')]);e=estimate_costs(d)
        self.assertEqual(e['comparable']['student_months'],4)
        self.assertAlmostEqual(e['comparable']['cost_per_student_month_usd'],25.75)
        self.assertAlmostEqual(sum(r['combined_estimated_usd'] for r in e['school_rollup']),103)

    def test_log_group_counts_must_reconcile(self):
        d=fixture([group()]);d['llm']['calls']=2
        with self.assertRaises(ValueError):estimate_costs(d)
