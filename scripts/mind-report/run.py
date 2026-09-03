"""Read-only production reporting via the existing AWS secret and bastion."""
import argparse
import datetime as dt
import hashlib
import json
import os
import pathlib
import shutil
import socket
import subprocess
import time
from urllib.parse import unquote, urlparse
from report import brief, render, validate, month_start_before

HERE = pathlib.Path(__file__).resolve().parent


class HistoryUnavailable(RuntimeError):
    pass


def command(args, **kwargs):
    result = subprocess.run(args, text=True, capture_output=True, timeout=90, **kwargs)
    if result.returncode:
        if 'get-cost-and-usage' in args and 'historical data beyond 14 months' in result.stderr:
            raise HistoryUnavailable('AWS historical cost data beyond 14 months is not enabled')
        raise RuntimeError(f'{pathlib.Path(args[0]).name} failed (exit {result.returncode}); check access/configuration')
    return result.stdout


def aws(profile, *args):
    return json.loads(command(['aws', '--profile', profile, '--region', 'us-east-1', *args, '--output', 'json']))


def production_snapshot(profile, ssh_key, psql, months=12):
    if not isinstance(months, int) or not 1 <= months <= 24:
        raise ValueError('months must be an integer from 1 through 24')
    db = urlparse(aws(profile, 'secretsmanager', 'get-secret-value', '--secret-id', 'yawp-production-db-url')['SecretString'])
    if db.scheme not in ('postgres', 'postgresql') or not db.hostname or not db.username or not db.password:
        raise RuntimeError('Database secret is not a complete PostgreSQL URL')
    hosts = aws(profile, 'ec2', 'describe-instances', '--filters', 'Name=tag:Name,Values=yawp-production-bastion',
                'Name=instance-state-name,Values=running', '--query', 'Reservations[].Instances[].PublicIpAddress')
    if len(hosts) != 1:
        raise RuntimeError('Expected exactly one running production bastion')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    tunnel = subprocess.Popen(['ssh', '-N', '-L', f'127.0.0.1:{port}:{db.hostname}:{db.port or 5432}',
                               f'ec2-user@{hosts[0]}', '-i', str(ssh_key), '-o', 'BatchMode=yes',
                               '-o', 'StrictHostKeyChecking=yes', '-o', 'ExitOnForwardFailure=yes',
                               '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=30'],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        ready = False
        for _ in range(150):
            if tunnel.poll() is not None:
                raise RuntimeError('SSH failed; check the existing trusted host/key configuration')
            try:
                with socket.create_connection(('127.0.0.1', port), timeout=.2):
                    ready = True
                    break
            except OSError:
                time.sleep(.1)
        if not ready:
            raise RuntimeError('SSH tunnel did not become ready within 15 seconds')
        env = {**os.environ, 'PGPASSWORD': unquote(db.password), 'PGSSLMODE': 'require', 'PGCONNECT_TIMEOUT': '10',
               'PGOPTIONS': '-c default_transaction_read_only=on -c statement_timeout=60000 -c lock_timeout=3000 -c timezone=UTC'}
        return json.loads(command([psql, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', f'lookback_months={months}', '-h', '127.0.0.1', '-p', str(port),
                                   '-U', unquote(db.username), '-d', unquote(db.path.lstrip('/')), '-f', str(HERE/'report.sql')], env=env))
    finally:
        tunnel.terminate()
        try:
            tunnel.wait(timeout=5)
        except subprocess.TimeoutExpired:
            tunnel.kill()
            tunnel.wait(timeout=5)


def costs(profile, as_of, months=3):
    end = dt.date.fromisoformat(as_of[:10]).replace(day=1)
    start = month_start_before(as_of,months)
    def fetch(since):
        return aws(profile, 'ce', 'get-cost-and-usage', '--time-period', f'Start={since},End={end}',
                   '--granularity', 'MONTHLY', '--metrics', 'UnblendedCost', '--group-by', 'Type=DIMENSION,Key=SERVICE')
    reason = None
    try:
        result = fetch(start)
    except HistoryUnavailable:
        reason = 'AWS historical data beyond 14 months is not enabled; this month is unavailable, not zero cost'
        result = fetch(max(start,month_start_before(as_of,13)))
    rows = []
    for row in result['ResultsByTime']:
        units = {g['Metrics']['UnblendedCost']['Unit'] for g in row['Groups']}
        if len(units) != 1:
            raise RuntimeError('AWS costs have missing or mixed currencies')
        rows.append({'month': row['TimePeriod']['Start'][:7], 'available': True, 'estimated': row['Estimated'], 'unit': next(iter(units)),
                     'amount': sum(float(g['Metrics']['UnblendedCost']['Amount']) for g in row['Groups']),
                     'services': [{'service': g['Keys'][0], **g['Metrics']['UnblendedCost']} for g in row['Groups']]})
    present={r['month'] for r in rows}
    for offset in range(months,0,-1):
        month=month_start_before(as_of,offset).isoformat()[:7]
        if month not in present:
            rows.append({'month':month,'available':False,'estimated':None,'unit':None,'amount':None,'services':[],
                         'reason':reason or 'AWS returned no data for this month'})
    return sorted(rows,key=lambda r:r['month'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--production', action='store_true')
    source.add_argument('--snapshot', type=pathlib.Path)
    parser.add_argument('--out-dir', type=pathlib.Path, required=True)
    parser.add_argument('--aws-profile', default='yawp')
    parser.add_argument('--ssh-key', type=pathlib.Path, default=pathlib.Path.home()/'.ssh/yawp-production-bastion')
    parser.add_argument('--psql', default=shutil.which('psql') or '/opt/homebrew/opt/libpq/bin/psql')
    parser.add_argument('--include-aws-costs', action='store_true')
    parser.add_argument('--months',type=int,choices=range(1,25),default=12)
    args = parser.parse_args()
    os.umask(0o077)
    if args.production:
        data = production_snapshot(args.aws_profile, args.ssh_key, args.psql,args.months)
        data['provenance'] = {'query_sha256': hashlib.sha256((HERE/'report.sql').read_bytes()).hexdigest(),
                              'repo_sha': command(['git', 'rev-parse', 'HEAD'], cwd=HERE).strip(),
                              'source': 'Yawp production PostgreSQL via SSH bastion',
                              'extracted_at': dt.datetime.now(dt.timezone.utc).isoformat()}
    else:
        data = json.loads(args.snapshot.read_text())
    if args.include_aws_costs:
        data['aws_costs'] = costs(args.aws_profile, data['meta']['as_of'],data['meta'].get('lookback_months',3))
        data['aws_costs_extracted_at'] = dt.datetime.now(dt.timezone.utc).isoformat()
    validate(data)
    text = render(data)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    snapshot_file, report_file, brief_file = args.out_dir/'snapshot.json', args.out_dir/'MIND-report.md', args.out_dir/'CALL-BRIEF.md'
    if any(f.exists() for f in (snapshot_file, report_file, brief_file)):
        raise RuntimeError('Output files already exist; use a new output directory to preserve dated evidence')
    snapshot_file.write_text(json.dumps(data, indent=2)+'\n')
    report_file.write_text(text)
    brief_file.write_text(brief(data))
    print(json.dumps({'status': 'passed', 'as_of': data['meta']['as_of'], 'report': str(report_file.resolve()),
                      'snapshot': str(snapshot_file.resolve()), 'brief': str(brief_file.resolve()), 'read_only': data['meta']['read_only'],
                      'included_submissions': data['quality']['included_submissions']}))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(json.dumps({'status': 'error', 'error_type': type(exc).__name__,
                          'message': str(exc) if isinstance(exc, (RuntimeError, ValueError)) else 'Report failed; check prerequisites and inputs'}))
        raise SystemExit(1)
