import importlib.util
import pathlib
import sys
import unittest
from unittest import mock

MODULE = pathlib.Path(__file__).with_name('report.py')


class ReportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location('mind_report', MODULE)
        cls.report = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.report)

    def test_zero_denominator_is_unknown_not_zero(self):
        self.assertEqual(self.report.rate(0, 0), 'N/A')
        self.assertEqual(self.report.rate(0, 4), '0.0%')
        self.assertEqual(self.report.rate(3, 4), '75.0%')

    def test_comparison_never_uses_partial_periods(self):
        rows = [{'grain': 'week', 'period': '2026-08-17', 'complete': True},
                {'grain': 'week', 'period': '2026-08-24', 'complete': True},
                {'grain': 'week', 'period': '2026-08-31', 'complete': False}]
        self.assertEqual(self.report.last_complete_periods(rows, 'week'),
                         ['2026-08-17', '2026-08-24'])

    def test_change_from_zero_does_not_invent_growth(self):
        self.assertEqual(self.report.change(10, 0), 'N/A (prior 0)')
        self.assertEqual(self.report.change(15, 10), '+50.0%')

    def test_markdown_escapes_school_labels(self):
        self.assertEqual(self.report.cell('A|B\nC'), 'A\\|B C')

    def test_missing_history_is_not_rendered_as_zero(self):
        self.assertEqual(self.report.observed_count(0, '2024-10-01', '2026-02-22T00:00:00+00:00'), 'N/A')
        self.assertEqual(self.report.observed_count(0, '2026-03-01', '2026-02-22T00:00:00+00:00'), 0)
        self.assertEqual(self.report.observed_count(4, '2026-02-01', '2026-02-22T00:00:00+00:00'), 4)

    def test_month_window_covers_two_complete_years(self):
        import datetime
        self.assertEqual(self.report.month_start_before('2026-09-03T13:30:00+00:00', 24), datetime.date(2024,9,1))

    def test_historical_sql_keeps_human_tutor_messages_separate_from_assistant(self):
        sql = MODULE.with_name('report.sql').read_text()
        self.assertIn("msg.agent='user'", sql)
        self.assertIn('student_tutor_message', sql)
        self.assertIn('documents_created', sql)

    def test_cost_history_fallback_keeps_unavailable_months_null(self):
        sys.path.insert(0,str(MODULE.parent))
        try:
            import run
        finally:
            sys.path.pop(0)
        response={'ResultsByTime':[{'TimePeriod':{'Start':self.report.month_start_before('2026-09-03',n).isoformat()},
                   'Estimated':False,'Groups':[{'Keys':['Fixture service'],'Metrics':{'UnblendedCost':{'Unit':'USD','Amount':'1'}}}]} for n in range(13,0,-1)]}
        with mock.patch.object(run,'aws',side_effect=[run.HistoryUnavailable('history disabled'),response]) as call:
            rows=run.costs('fixture','2026-09-03',24)
            self.assertEqual(len(rows),24)
            self.assertEqual(sum(r['amount'] is None for r in rows),11)
            self.assertEqual(sum(r['amount'] or 0 for r in rows),13)
            self.assertIn('Start=2025-08-01,End=2026-09-01',call.call_args.args)

    def test_week_before_source_history_is_unknown(self):
        self.assertEqual(self.report.observed_count(0,'2026-02-09','2026-02-22T00:00:00+00:00','week'),'N/A')
        self.assertEqual(self.report.observed_count(3,'2026-02-16','2026-02-22T00:00:00+00:00','week'),3)

    def test_reconciliation_rejects_missing_submissions(self):
        data = {'quality': {'all_submissions': 10, 'included_submissions': 7,
                            'excluded_submissions': 2}}
        with self.assertRaisesRegex(ValueError, 'reconcile'):
            self.report.validate(data)

    def test_production_query_enforces_read_only_and_closes_tunnel_on_error(self):
        sys.path.insert(0, str(MODULE.parent))
        try:
            import run
        finally:
            sys.path.pop(0)
        process = mock.Mock()
        process.poll.return_value = None
        secret = {'SecretString': 'postgresql://fixture:fake-password@fixture.invalid/db'}
        with mock.patch.object(run, 'aws', side_effect=[secret, ['192.0.2.1']]), \
             mock.patch.object(run.subprocess, 'Popen', return_value=process), \
             mock.patch.object(run.socket, 'create_connection'), \
             mock.patch.object(run, 'command', side_effect=RuntimeError('query failed')) as query:
            with self.assertRaisesRegex(RuntimeError, 'query failed'):
                run.production_snapshot('fixture', pathlib.Path('/fake/key'), '/fake/psql')
            self.assertIn('default_transaction_read_only=on', query.call_args.kwargs['env']['PGOPTIONS'])
            self.assertEqual(query.call_args.kwargs['env']['PGSSLMODE'], 'require')
            self.assertNotIn('fake-password', ' '.join(query.call_args.args[0]))
            process.terminate.assert_called_once()
            process.wait.assert_called_once()

    def test_sql_protects_snapshot_and_preserves_old_class_links(self):
        sql = MODULE.with_name('report.sql').read_text()
        self.assertIn('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;', sql)
        self.assertTrue(sql.rstrip().endswith('ROLLBACK;'))
        self.assertIn('"DocumentClassForensic"', sql)
        self.assertIn("SELECT id FROM eligible_members WHERE role='STUDENT'", sql)
        self.assertNotIn('u.email,', sql)
        self.assertNotIn('d.text,', sql)


if __name__ == '__main__':
    unittest.main()
