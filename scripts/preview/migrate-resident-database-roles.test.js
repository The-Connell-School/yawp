import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const script = readFileSync(
  path.join(import.meta.dir, 'migrate-resident-database-roles.sh'),
  'utf8',
);

test('fails closed when database enumeration fails', () => {
  expect(script).toContain('database_list="$($DOCKER exec');
  expect(script).toContain('Could not enumerate preview databases before role isolation');
  expect(script).not.toContain('done < <($DOCKER exec');
});

test('revokes public connect again after changing each database owner', () => {
  const owner = script.indexOf('ALTER DATABASE \\"${database}\\" OWNER TO \\"${role}\\"');
  const revoke = script.indexOf(
    'REVOKE CONNECT ON DATABASE \\"${database}\\" FROM PUBLIC',
    owner,
  );
  const grant = script.indexOf(
    'GRANT CONNECT ON DATABASE \\"${database}\\" TO \\"${role}\\"',
    revoke,
  );
  expect(owner).toBeGreaterThan(-1);
  expect(revoke).toBeGreaterThan(owner);
  expect(grant).toBeGreaterThan(revoke);
});
