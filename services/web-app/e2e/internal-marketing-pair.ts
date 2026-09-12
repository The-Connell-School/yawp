import assert from 'node:assert/strict';
import {constants,openSync,fstatSync,readFileSync,closeSync} from 'node:fs';
import {isAbsolute} from 'node:path';
/** Optional local acceptance bridge. Never loaded by application routes or deployed code. */
export async function captureMarketingPair(input:{origin:string;organizationId:string;code:string;teacherEmail:string;classroomId:string}){
 const path=process.env.YAWP_MARKETING_PAIR_CONFIG;if(!path)return;
 assert(isAbsolute(path),'Pair configuration must be absolute');
 const file=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);let pair:{origin:string;token:string};
 try{const stat=fstatSync(file);assert(stat.isFile()&&stat.nlink===1&&stat.size<16000&&stat.uid===process.getuid!()&&(stat.mode&0o077)===0,'Pair config must be private');pair=JSON.parse(readFileSync(file,'utf8'));}finally{closeSync(file);}
 const url=new URL(pair.origin);
 assert(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)&&url.pathname==='/'&&!url.username&&!url.password&&!url.search&&!url.hash,'Pair endpoint must be local');
 assert(/^[A-Za-z0-9_-]{43}$/.test(pair.token),'Invalid local pair token');
 const response=await fetch(`${url.origin}/capture`,{method:'POST',redirect:'error',headers:{authorization:`Bearer ${pair.token}`,'content-type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(120000)});
 assert(response.ok,'Internal renderer must complete its local capture');const result=await response.json();
 assert(result.ok===true&&result.organizationId===input.organizationId&&Number.isInteger(result.artifacts)&&result.artifacts>=2&&result.artifacts<=50,'Capture receipt must match this organization');
}
