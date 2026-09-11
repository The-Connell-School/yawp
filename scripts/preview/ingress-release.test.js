import {expect,test} from 'bun:test';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,symlink} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {prepareIngressRelease,verifyIngressRelease} from './ingress-release.mjs';
const files=['certificate-manager.mjs','ingress-server.mjs','internal-routes.mjs','wake-preview.sh','wake-server.mjs'];
test('release packages exact committed ingress files and detects tampering without including app or secrets',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'ingress-release-')),repo=path.join(root,'repo'),output=path.join(root,'release');
 const git=(...args)=>execFileSync('git',['-C',repo,...args],{encoding:'utf8'}).trim();
 try {
  await mkdir(path.join(repo,'scripts/preview'),{recursive:true});git('init','-b','main');git('config','user.name','Test');git('config','user.email','test@example.test');
  for(const name of files)await writeFile(path.join(repo,'scripts/preview',name),`// ${name}\n`);
  await writeFile(path.join(repo,'.env'),'not-a-real-secret');git('add','.');git('commit','-m','fixture');
  const revision=git('rev-parse','HEAD');
  await writeFile(path.join(repo,'scripts/preview/ingress-server.mjs'),'dirty working copy');
  const manifest=await prepareIngressRelease({repository:repo,revision,output});
  expect(manifest.revision).toBe(revision);
  expect((await readdir(output)).sort()).toEqual([...files,'manifest.json'].sort());
  expect(await readFile(path.join(output,'ingress-server.mjs'),'utf8')).toBe('// ingress-server.mjs\n');
  expect((await verifyIngressRelease(output,manifest.releaseId)).releaseId).toBe(manifest.releaseId);
  await expect(prepareIngressRelease({repository:repo,revision,output})).rejects.toThrow();
  await writeFile(path.join(output,'ingress-server.mjs'),'tampered');
  await expect(verifyIngressRelease(output,manifest.releaseId)).rejects.toThrow();
  await rm(path.join(output,'ingress-server.mjs'));await symlink(path.join(repo,'.env'),path.join(output,'ingress-server.mjs'));
  await expect(verifyIngressRelease(output,manifest.releaseId)).rejects.toThrow();
 }finally{await rm(root,{recursive:true,force:true});}
});

test('project CLI prepares and verifies an exact committed release without activation',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'ingress-release-cli-'));
 const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const output=path.join(root,'release');
 async function invoke(args){const child=Bun.spawn(['./bin/project','ingress-release',...args,'--json'],{stdout:'pipe',stderr:'pipe'});const stdout=await new Response(child.stdout).text();return {code:await child.exited,stdout};}
 try{
  const prepared=await invoke(['prepare','--revision',revision,'--output',output]);expect(prepared.code,prepared.stdout).toBe(0);
  const manifest=JSON.parse(prepared.stdout);expect(manifest.revision).toBe(revision);
  expect((await invoke(['verify','--output',output,'--release-id',manifest.releaseId])).code).toBe(0);
  expect((await invoke(['verify','--output',output,'--release-id','a'.repeat(64)])).code).not.toBe(0);
 }finally{await rm(root,{recursive:true,force:true});}
});
