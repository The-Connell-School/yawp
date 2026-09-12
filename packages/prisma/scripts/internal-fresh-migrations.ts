import {Client} from 'pg';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

// Only disposable databases on the claimed workspace's local PostgreSQL host.
const source=new URL(process.env.INTERNAL_DIRECTORY_TEST_DATABASE_URL??'');
assert(['127.0.0.1','localhost'].includes(source.hostname)&&source.pathname.startsWith('/yawp_'),'Owned local database required');
const name=`yawp_internal_fresh_${randomUUID().replaceAll('-','')}`;
const admin=new Client({connectionString:source.toString()});
const isolated=new URL(source);isolated.pathname=`/${name}`;
const db=new Client({connectionString:isolated.toString()});
let created=false;
await admin.connect();
try{
 await admin.query(`CREATE DATABASE "${name}"`);created=true;
 const result=spawnSync(process.execPath,['run','prisma','migrate','deploy'],{cwd:resolve(import.meta.dir,'..'),env:{...process.env,DATABASE_URL:isolated.toString()},encoding:'utf8',timeout:180000});
 if(result.status!==0)throw new Error(`Fresh migration deploy failed: ${result.stderr}\n${result.stdout}`);
 await db.connect();
 const migrations=await db.query('SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');
 assert(migrations.rows[0].count>0);
 const coverage=async()=>{
  const result=await db.query(`SELECT c.relname AS name,
   EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid=c.oid AND t.tgname='internal_impersonation_mutation_audit' AND t.tgfoid=to_regprocedure('internal_impersonation_mutation_audit()') AND t.tgtype=29 AND t.tgenabled IN ('O','A')) AS mutation,
   EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid=c.oid AND t.tgname='internal_impersonation_truncate_guard' AND t.tgfoid=to_regprocedure('internal_impersonation_truncate_guard()') AND t.tgtype=34 AND t.tgenabled IN ('O','A')) AS truncation
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relkind='r'
   AND c.relname NOT IN ('_prisma_migrations','InternalImpersonationSession','InternalImpersonationEvent')`);
  assert(result.rows.some(r=>r.name==='DocumentImage'));
  assert.deepEqual(result.rows.filter(r=>!r.mutation||!r.truncation),[]);
  return result.rows.length;
 };
 const tables=await coverage();
 // The catch-up migration is harmless on a fresh install where generic audit
 // migrations have already installed DocumentImage's triggers.
 const catchup=readFileSync(resolve(import.meta.dir,'../migrations/20260912190000_document_image_impersonation_audit/migration.sql'),'utf8');
 await db.query(catchup);assert.equal(await coverage(),tables);
 // Exercise the upgrade branch too, only within this disposable database.
 await db.query('DROP TRIGGER internal_impersonation_mutation_audit ON "DocumentImage"; DROP TRIGGER internal_impersonation_truncate_guard ON "DocumentImage"');
 await db.query(catchup);assert.equal(await coverage(),tables);
 console.log(JSON.stringify({status:'passed',migrations:migrations.rows[0].count,auditedTables:tables,existingTriggerReplay:true,missingTriggerRepair:true}));
}finally{
 try { await db.end(); } finally {
  try { if(created)await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); } finally { await admin.end(); }
 }
}
