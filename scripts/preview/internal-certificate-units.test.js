import {expect,test} from 'bun:test';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

test('Linux systemd validates the rendered first-certificate path and service units', async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'internal-certificate-units-'));
 const names=['yawp-preview-internal-certificates.service','yawp-preview-internal-certificates.path'];
 try {
  const source=await readFile(new URL('./bootstrap-host.sh',import.meta.url),'utf8');
  for(const name of names){
   const marker=`sudo tee /etc/systemd/system/${name} >/dev/null <<`;
   const start=source.indexOf(marker);expect(start).toBeGreaterThan(-1);
   const after=source.slice(start+marker.length), body=after.slice(after.indexOf('\n')+1,after.indexOf('\nUNIT'));
   const render=Bun.spawn(['bash','-c',`cat <<UNIT\n${body}\nUNIT`],{env:{PATH:process.env.PATH,ROOT:'/srv/yawp-preview',WAKE_USER:'nobody',DOMAIN:'preview.test',ACME_EMAIL:'operator@example.test',node_path:'/usr/bin/node'},stdout:'pipe',stderr:'pipe'});
   expect(await render.exited).toBe(0);
   await writeFile(path.join(directory,name),await new Response(render.stdout).text());
  }
  const child=Bun.spawn(['docker','run','--rm','--pull=never','--network','none','--read-only','--tmpfs','/tmp','--mount',`type=bind,src=${directory},dst=/units,readonly`,'--entrypoint','/usr/bin/systemd-analyze','mcr.microsoft.com/playwright:v1.61.1-noble','verify','--man=no',...names.map(name=>`/units/${name}`)],{stdout:'pipe',stderr:'pipe'});
  const errors=await new Response(child.stderr).text();
  expect(await child.exited,errors).toBe(0);
 } finally {await rm(directory,{recursive:true,force:true});}
},30000);
