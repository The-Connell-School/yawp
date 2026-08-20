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
