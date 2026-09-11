import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  certificateNeedsRenewal,
  ensureCertificate,
  importResidentTraefikCertificates,
  isDirectExecution,
  maintainCertificates,
  residentPreviewHostnames,
  validateCertificatePair,
} from './certificate-manager.mjs';

const roots = [];

function temporaryRoot(prefix) {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

function createCertificate(root, hostname, days = 90) {
  const keyPath = path.join(root, 'key.pem');
  const certPath = path.join(root, 'cert.pem');
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-subj', `/CN=${hostname}`,
    '-addext', `subjectAltName=DNS:${hostname}`,
    '-days', String(days),
    '-keyout', keyPath,
    '-out', certPath,
  ], { stdio: 'ignore' });
  return {
    key: readFileSync(keyPath, 'utf8'),
    cert: readFileSync(certPath, 'utf8'),
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('preview certificate manager', () => {
  test('includes the UA alias for every resident PR preview', async () => {
    const root = temporaryRoot('preview-cert-resident-hosts-');
    mkdirSync(path.join(root, 'previews', 'pr-241'), { recursive: true });
    mkdirSync(path.join(root, 'previews', 'demo'), { recursive: true });

    expect(
      await residentPreviewHostnames(root, 'preview.yawp.school')
    ).toEqual([
      'pr-241.preview.yawp.school',
      'ua-pr-241.preview.yawp.school',
      'blackboard-pr-241.preview.yawp.school',
    ]);
  });
  test('runs renewal when systemd invokes the release through the current symlink', () => {
    const root = temporaryRoot('preview-cert-entrypoint-');
    const target = new URL('./certificate-manager.mjs', import.meta.url);
    const current = path.join(root, 'certificate-manager.mjs');
    symlinkSync(target, current);

    expect(isDirectExecution(target.href, current)).toBe(true);
  });

  test('imports valid Traefik certificates only for resident PR previews', async () => {
    const root = temporaryRoot('preview-cert-import-');
    const certRoot = path.join(root, 'ingress', 'certs');
    mkdirSync(path.join(root, 'previews', 'pr-241'), { recursive: true });
    mkdirSync(path.join(root, 'previews', 'pr-267'), { recursive: true });
    const valid = createCertificate(root, 'pr-241.preview.yawp.school');
    const stale = createCertificate(root, 'pr-999.preview.yawp.school');
    const acmePath = path.join(root, 'acme.json');
    writeFileSync(acmePath, JSON.stringify({
      letsencrypt: {
        Certificates: [
          {
            domain: { main: 'pr-241.preview.yawp.school' },
            certificate: Buffer.from(valid.cert).toString('base64'),
            key: Buffer.from(valid.key).toString('base64'),
          },
          {
            domain: { main: 'pr-999.preview.yawp.school' },
            certificate: Buffer.from(stale.cert).toString('base64'),
            key: Buffer.from(stale.key).toString('base64'),
          },
        ],
      },
    }));

    const imported = await importResidentTraefikCertificates({
      acmePath,
      root,
      certRoot,
      domain: 'preview.yawp.school',
    });

    expect(imported).toEqual(['pr-241.preview.yawp.school']);
    const keyPath = path.join(certRoot, 'pr-241.preview.yawp.school', 'privkey.pem');
    const certPath = path.join(certRoot, 'pr-241.preview.yawp.school', 'fullchain.pem');
    expect(existsSync(keyPath)).toBe(true);
    expect(existsSync(certPath)).toBe(true);
    expect(await validateCertificatePair({
      hostname: 'pr-241.preview.yawp.school',
      keyPath,
      certPath,
    })).toBe(true);
    expect(existsSync(path.join(certRoot, 'pr-999.preview.yawp.school'))).toBe(false);
  });

  test('renews only certificates inside the configured renewal window', () => {
    const root = temporaryRoot('preview-cert-renew-');
    const current = createCertificate(root, 'pr-241.preview.yawp.school', 90);
    expect(certificateNeedsRenewal(current.cert, { renewalDays: 30 })).toBe(false);
    expect(certificateNeedsRenewal(current.cert, { renewalDays: 120 })).toBe(true);
    expect(certificateNeedsRenewal('not a certificate', { renewalDays: 30 })).toBe(true);
  });

  test('completes HTTP-01 issuance and atomically publishes the new pair', async () => {
    const root = temporaryRoot('preview-cert-acme-');
    const certRoot = path.join(root, 'ingress', 'certs');
    const accountRoot = path.join(root, 'ingress', 'acme');
    const challengeRoot = path.join(root, 'ingress', 'challenges');
    const hostname = 'pr-267.preview.yawp.school';
    const issued = createCertificate(root, hostname);
    let authPolls = 0;
    let orderPolls = 0;
    let sawChallenge = false;
    const calls = [];
    const response = (body, { status = 200, location, nonce = 'nonce-next' } = {}) => new Response(
      typeof body === 'string' ? body : JSON.stringify(body),
      {
        status,
        headers: {
          'content-type': typeof body === 'string' ? 'application/pem-certificate-chain' : 'application/json',
          'replay-nonce': nonce,
          ...(location ? { location } : {}),
        },
      },
    );
    const fetchFn = async (url, options = {}) => {
      calls.push({ url: String(url), method: options.method || 'GET' });
      if (url === 'https://acme.test/directory') {
        return response({
          newNonce: 'https://acme.test/nonce',
          newAccount: 'https://acme.test/account',
          newOrder: 'https://acme.test/order/new',
        });
      }
      if (url === 'https://acme.test/nonce') return response('', { nonce: 'nonce-1' });
      if (url === 'https://acme.test/account') {
        return response({}, { status: 201, location: 'https://acme.test/account/1' });
      }
      if (url === 'https://acme.test/order/new') {
        return response({
          authorizations: ['https://acme.test/auth/1'],
          finalize: 'https://acme.test/order/1/finalize',
        }, { status: 201, location: 'https://acme.test/order/1' });
      }
      if (url === 'https://acme.test/auth/1') {
        authPolls += 1;
        return response(authPolls === 1 ? {
          status: 'pending',
          challenges: [{ type: 'http-01', token: 'challenge_token-1', url: 'https://acme.test/challenge/1' }],
        } : { status: 'valid' });
      }
      if (url === 'https://acme.test/challenge/1') {
        sawChallenge = readFileSync(
          path.join(challengeRoot, 'challenge_token-1'),
          'utf8',
        ).startsWith('challenge_token-1.');
        return response({ status: 'pending' });
      }
      if (url === 'https://acme.test/order/1/finalize') return response({ status: 'processing' });
      if (url === 'https://acme.test/order/1') {
        orderPolls += 1;
        return response(orderPolls === 1
          ? { status: 'processing' }
          : { status: 'valid', certificate: 'https://acme.test/certificate/1' });
      }
      if (url === 'https://acme.test/certificate/1') return response(issued.cert);
      throw new Error(`Unexpected ACME URL ${url}`);
    };

    const result = await ensureCertificate({
      hostname,
      domain: 'preview.yawp.school',
      certRoot,
      accountRoot,
      challengeRoot,
      email: 'admin@example.com',
      directoryUrl: 'https://acme.test/directory',
      fetchFn,
      pollIntervalMs: 0,
      createKeyAndCsr: async () => ({
        privateKeyPem: issued.key,
        csrDer: Buffer.from('test-csr'),
      }),
    });

    expect(result).toEqual({ hostname, status: 'issued' });
    expect(sawChallenge).toBe(true);
    expect(calls.some((call) => call.url.endsWith('/order/1/finalize'))).toBe(true);
    expect(readFileSync(path.join(certRoot, hostname, 'privkey.pem'), 'utf8')).toBe(issued.key);
    expect(readFileSync(path.join(certRoot, hostname, 'fullchain.pem'), 'utf8')).toBe(issued.cert);
    expect(existsSync(path.join(challengeRoot, 'challenge_token-1'))).toBe(false);
  });

  test('attempts every resident renewal even when an earlier hostname fails', async () => {
    const calls = [];
    const report = await maintainCertificates({
      hostnames: ['pr-241.preview.yawp.school', 'pr-267.preview.yawp.school'],
      ensure: async ({ hostname }) => {
        calls.push(hostname);
        if (hostname.startsWith('pr-241.')) throw new Error('simulated renewal failure');
        return { hostname, status: 'current' };
      },
      options: {},
    });

    expect(calls).toEqual(['pr-241.preview.yawp.school', 'pr-267.preview.yawp.school']);
    expect(report.results).toEqual([{
      hostname: 'pr-267.preview.yawp.school',
      status: 'current',
    }]);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0].hostname).toBe('pr-241.preview.yawp.school');
  });
});

test('registered named certificates can be reused and selected for SNI, unknown names cannot', async () => {
 const {createInternalRouteReader}=await import('./internal-routes.mjs');
 const {createCertificateStore}=await import('./ingress-server.mjs');
 const root=temporaryRoot('named-certificate-'), hostname='rubric-editor.preview.test';
 const registry=path.join(root,'routes'); mkdirSync(registry);
 writeFileSync(path.join(registry,'rubric-editor.json'),JSON.stringify({version:1,environmentId:'aeaa755d-aaca-4ae3-8ab4-1b4f95860bfe',slug:'rubric-editor',state:'active'}));
 const readInternalRoute=createInternalRouteReader({directory:registry,domain:'preview.test',ownerUid:process.getuid()});
 const pair=createCertificate(root,hostname), certRoot=path.join(root,'certs');
 mkdirSync(path.join(certRoot,hostname),{recursive:true});
 writeFileSync(path.join(certRoot,hostname,'privkey.pem'),pair.key);
 writeFileSync(path.join(certRoot,hostname,'fullchain.pem'),pair.cert);
 const result=await ensureCertificate({hostname,domain:'preview.test',certRoot,readInternalRoute,fetchFn:async()=>{throw new Error('current certificate must not issue');}});
 expect(result.status).toBe('current');
 const store=createCertificateStore({certRoot,domain:'preview.test',defaultHostname:hostname,readInternalRoute});
 expect(await new Promise(resolve=>store.sniCallback(hostname,(error,context)=>resolve(!error && !!context)))).toBe(true);
 expect(await new Promise(resolve=>store.sniCallback('unknown.preview.test',error=>resolve(!!error)))).toBe(true);
 await expect(ensureCertificate({hostname:'unknown.preview.test',domain:'preview.test',certRoot,readInternalRoute})).rejects.toThrow();
});

test('actual ingress process starts with only a registered named certificate and serves verified TLS', async () => {
 const {request}=await import('node:https');
 const root=temporaryRoot('named-ingress-process-'), hostname='rubric-editor.preview.test';
 const registry=path.join(root,'routes'), certRoot=path.join(root,'certs');
 mkdirSync(registry);mkdirSync(path.join(certRoot,hostname),{recursive:true});
 writeFileSync(path.join(registry,'rubric-editor.json'),JSON.stringify({version:1,environmentId:'aeaa755d-aaca-4ae3-8ab4-1b4f95860bfe',slug:'rubric-editor',state:'paused'}));
 const pair=createCertificate(root,hostname);
 writeFileSync(path.join(certRoot,hostname,'privkey.pem'),pair.key);
 writeFileSync(path.join(certRoot,hostname,'fullchain.pem'),pair.cert);
 const child=Bun.spawn([process.execPath,path.join(import.meta.dir,'ingress-server.mjs')],{
  env:{...process.env,PREVIEW_ROOT:root,PREVIEW_DOMAIN:'preview.test',PREVIEW_CERT_ROOT:certRoot,PREVIEW_INTERNAL_ROUTES:registry,PREVIEW_INTERNAL_ROUTE_UID:String(process.getuid()),PREVIEW_HTTP_PORT:'0',PREVIEW_HTTPS_PORT:'0',PREVIEW_INGRESS_BIND:'127.0.0.1'},stdout:'pipe',stderr:'pipe',
 });
 let timer;
 try {
  const port=await Promise.race([
   (async()=>{let log='';for await(const chunk of child.stdout){log+=Buffer.from(chunk).toString();const match=log.match(/HTTPS ingress listening on 127\.0\.0\.1:(\d+)/);if(match)return Number(match[1]);}throw new Error('Ingress exited before TLS listener');})(),
   new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Ingress startup deadline')),10000);}),
  ]);
  clearTimeout(timer);
  const response=await new Promise((resolve,reject)=>{
   const req=request({host:'127.0.0.1',port,servername:hostname,ca:pair.cert,headers:{host:hostname}},res=>{let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,body}));});
   req.on('error',reject);req.setTimeout(3000,()=>req.destroy(new Error('HTTPS deadline')));req.end();
  });
  expect(response.status).toBe(503);expect(response.body).toContain('paused');
 } finally {clearTimeout(timer);child.kill();await child.exited;}
},15000);

test('internal-only certificate command scans new registered routes without a PR directory', async () => {
 const root=temporaryRoot('internal-certificate-command-'), hostname='rubric-editor.preview.test';
 const registry=path.join(root,'routes'), certRoot=path.join(root,'certs');
 mkdirSync(registry);mkdirSync(path.join(certRoot,hostname),{recursive:true});
 const env={...process.env,PREVIEW_ROOT:root,PREVIEW_DOMAIN:'preview.test',PREVIEW_CERT_ROOT:certRoot,PREVIEW_INTERNAL_ROUTES:registry,PREVIEW_INTERNAL_ROUTE_UID:String(process.getuid())};
 const invoke=()=>Bun.spawn([process.execPath,path.join(import.meta.dir,'certificate-manager.mjs'),'--internal'],{env,stdout:'pipe',stderr:'pipe'});
 const empty=invoke();expect(await empty.exited).toBe(0);
 const pair=createCertificate(root,hostname);
 writeFileSync(path.join(certRoot,hostname,'privkey.pem'),pair.key);writeFileSync(path.join(certRoot,hostname,'fullchain.pem'),pair.cert);
 writeFileSync(path.join(registry,'rubric-editor.json'),JSON.stringify({version:1,environmentId:'aeaa755d-aaca-4ae3-8ab4-1b4f95860bfe',slug:'rubric-editor',state:'active'}));
 writeFileSync(path.join(registry,'untrusted.json'),'{}');
 const registered=invoke();expect(await registered.exited).toBe(0);
 expect(await new Response(registered.stdout).text()).toContain(`${hostname}: current`);
});
