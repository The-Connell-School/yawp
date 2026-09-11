import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,writeFile,readFile,readdir,lstat,rm,chmod} from 'node:fs/promises';
import path from 'node:path';
const FILES=['certificate-manager.mjs','ingress-server.mjs','internal-routes.mjs','wake-preview.sh','wake-server.mjs'];
const hash=value=>createHash('sha256').update(value).digest('hex');
const mode=name=>name.endsWith('.sh') ? 0o755 : 0o644;
function identity(revision,files){return hash(JSON.stringify({version:1,revision,files}));}
export async function prepareIngressRelease({repository,revision,output}){
 if(!path.isAbsolute(repository) || !path.isAbsolute(output) || !/^[a-f0-9]{40}$/.test(revision))throw new Error('Use absolute paths and an exact commit SHA');
 const git=(...args)=>execFileSync('git',['-C',repository,...args],{maxBuffer:2*1024*1024,stdio:['ignore','pipe','pipe']});
 const snapshots=[];
 for(const name of FILES){
  const source=`scripts/preview/${name}`,entry=git('ls-tree',revision,'--',source).toString();
  if(!/^100(644|755) blob [a-f0-9]+\t/.test(entry))throw new Error('Release source must be a committed regular file');
  snapshots.push({name,content:git('show',`${revision}:${source}`)});
 }
 const entries=snapshots.map(({name,content})=>({name,sha256:hash(content),mode:mode(name),size:content.length}));
 const manifest={version:1,revision,files:entries,releaseId:identity(revision,entries)};
 // Reserve a new directory; never replace or clean up someone else's output.
 await mkdir(output,{mode:0o700});
 try {
  for(const {name,content} of snapshots){const target=path.join(output,name);await writeFile(target,content,{flag:'wx',mode:mode(name)});await chmod(target,mode(name));}
  await writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o644});
  await verifyIngressRelease(output,manifest.releaseId);
  return manifest;
 }catch(error){await rm(output,{recursive:true,force:true});throw error;}
}
export async function verifyIngressRelease(directory,expectedReleaseId){
 if(!path.isAbsolute(directory) || !/^[a-f0-9]{64}$/.test(expectedReleaseId || ''))throw new Error('Pin the externally reviewed release ID');
 const root=await lstat(directory);if(!root.isDirectory() || root.isSymbolicLink())throw new Error('Invalid release directory');
 const names=(await readdir(directory)).sort();
 if(JSON.stringify(names)!==JSON.stringify([...FILES,'manifest.json'].sort()))throw new Error('Unexpected release contents');
 for(const name of names){const info=await lstat(path.join(directory,name));if(!info.isFile() || info.isSymbolicLink() || info.size>2*1024*1024)throw new Error('Invalid release file');}
 const manifest=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8'));
 if(manifest.version!==1 || !/^[a-f0-9]{40}$/.test(manifest.revision) || !Array.isArray(manifest.files) || manifest.files.length!==FILES.length)throw new Error('Invalid manifest');
 const actual=[];
 for(const name of FILES){
  const file=path.join(directory,name),content=await readFile(file),info=await lstat(file);
  if((info.mode&0o777)!==mode(name))throw new Error('Unexpected release permissions');
  actual.push({name,sha256:hash(content),mode:mode(name),size:content.length});
 }
 if(JSON.stringify(actual)!==JSON.stringify(manifest.files) || identity(manifest.revision,actual)!==expectedReleaseId || manifest.releaseId!==expectedReleaseId)throw new Error('Release identity mismatch');
 return manifest;
}
