import { constants,openSync,closeSync,fstatSync,readFileSync,lstatSync } from 'node:fs';
import path from 'node:path';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const SLUG=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
// No feature-supplied upstreams. Caller derives the Docker target from environmentId.
export function createInternalRouteReader({directory,domain,ownerUid}={}) {
 return (hostname) => {
  if (!directory || !path.isAbsolute(directory) || !Number.isSafeInteger(ownerUid) || ownerUid<0 || typeof hostname!=='string' || !domain) return null;
  const suffix=`.${domain}`;
  if(!hostname.endsWith(suffix)) return null;
  const slug=hostname.slice(0,-suffix.length);
  if(!SLUG.test(slug) || /^pr-\d+(?:-|$)/.test(slug)) return null;
  let fd;
  try {
   const parent=lstatSync(directory);
   if(!parent.isDirectory() || parent.isSymbolicLink() || parent.uid!==ownerUid || (parent.mode&0o022)) return null;
   fd=openSync(path.join(directory,`${slug}.json`),constants.O_RDONLY|constants.O_NOFOLLOW);
   const stat=fstatSync(fd);
   if(!stat.isFile() || stat.uid!==ownerUid || (stat.mode&0o022) || stat.size>4096) return null;
   const route=JSON.parse(readFileSync(fd,'utf8'));
   if(!route || Object.keys(route).sort().join(',')!=='environmentId,slug,state,version' || route.version!==1 || !UUID.test(route.environmentId) || route.slug!==slug || !['active','paused'].includes(route.state)) return null;
   return {environmentId:route.environmentId,hostname,state:route.state};
  } catch {return null;} finally {if(fd!==undefined) closeSync(fd);}
 };
}
