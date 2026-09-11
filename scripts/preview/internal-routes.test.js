import { expect,test } from 'bun:test';
import { mkdtempSync,writeFileSync,chmodSync,symlinkSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInternalRouteReader } from './internal-routes.mjs';
test('only operator-owned registered named hosts resolve to fixed environment containers', () => {
 const directory=mkdtempSync(path.join(tmpdir(),'internal-ingress-'));
 const record={version:1,environmentId:'aeaa755d-aaca-4ae3-8ab4-1b4f95860bfe',slug:'rubric-editor',state:'active'};
 const file=path.join(directory,'rubric-editor.json');
 try {
  writeFileSync(file,JSON.stringify(record),{mode:0o644});
  const read=createInternalRouteReader({directory,domain:'preview.example.test',ownerUid:process.getuid()});
  expect(read('rubric-editor.preview.example.test')).toEqual({environmentId:record.environmentId,hostname:'rubric-editor.preview.example.test',state:'active'});
  expect(read('other.preview.example.test')).toBeNull();
  expect(read('rubric-editor.preview.example.test.attacker.test')).toBeNull();
  writeFileSync(path.join(directory,'pr-123.json'),JSON.stringify({...record,slug:'pr-123'}));
  expect(read('pr-123.preview.example.test')).toBeNull();
  writeFileSync(file,JSON.stringify({...record,upstream:'http://169.254.169.254'}));
  expect(read('rubric-editor.preview.example.test')).toBeNull();
  writeFileSync(file,JSON.stringify({...record,state:'paused'}));
  expect(read('rubric-editor.preview.example.test').state).toBe('paused');
  chmodSync(file,0o666);
  expect(read('rubric-editor.preview.example.test')).toBeNull();
  chmodSync(file,0o644);
  symlinkSync(file,path.join(directory,'other.json'));
  expect(read('other.preview.example.test')).toBeNull();
  expect(createInternalRouteReader({directory,domain:'preview.example.test',ownerUid:process.getuid()+1})('rubric-editor.preview.example.test')).toBeNull();
 } finally {rmSync(directory,{recursive:true,force:true});}
});

test('runtime registry is disabled by default and enumerates only validated registrations', async () => {
 const {internalRoutesFromEnvironment}=await import('./internal-routes.mjs');
 expect(internalRoutesFromEnvironment({},'preview.test').hostnames()).toEqual([]);
 expect(()=>internalRoutesFromEnvironment({PREVIEW_INTERNAL_ROUTES:'/tmp/routes'},'preview.test')).toThrow();
 const directory=mkdtempSync(path.join(tmpdir(),'internal-runtime-'));
 try {
  writeFileSync(path.join(directory,'rubric-editor.json'),JSON.stringify({version:1,environmentId:'aeaa755d-aaca-4ae3-8ab4-1b4f95860bfe',slug:'rubric-editor',state:'active'}));
  writeFileSync(path.join(directory,'bad.json'),'{}');
  const runtime=internalRoutesFromEnvironment({PREVIEW_INTERNAL_ROUTES:directory,PREVIEW_INTERNAL_ROUTE_UID:String(process.getuid())},'preview.test');
  expect(runtime.hostnames()).toEqual(['rubric-editor.preview.test']);
  expect(runtime.readInternalRoute('rubric-editor.preview.test').state).toBe('active');
 } finally {rmSync(directory,{recursive:true,force:true});}
});
