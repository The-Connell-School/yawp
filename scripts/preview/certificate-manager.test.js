import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
  certificateStorageName,
  certificateNeedsRenewal,
  createRoute53Dns01Provider,
  ensureCertificate,
  ensureWildcardCertificate,
  importResidentTraefikCertificates,
  isDirectExecution,
  maintainCertificates,
  residentPreviewHostnames,
  validateCertificatePair,
  wildcardCertificateHostname,
} from './certificate-manager.mjs';

const roots = [];

function temporaryRoot(prefix) {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

function createCertificate(root, hostname, days = 90, subjectAltNames = [hostname]) {
  const keyPath = path.join(root, 'key.pem');
  const certPath = path.join(root, 'cert.pem');
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-subj', `/CN=${hostname}`,
    '-addext', `subjectAltName=${subjectAltNames.map((name) => `DNS:${name}`).join(',')}`,
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
  test('stores wildcard certificates in a filesystem-safe resident slot', () => {
    expect(wildcardCertificateHostname('Preview.Yawp.School')).toBe('*.preview.yawp.school');
    expect(certificateStorageName('*.preview.yawp.school')).toBe('_wildcard.preview.yawp.school');
    expect(certificateStorageName('pr-241.preview.yawp.school')).toBe(
      'pr-241.preview.yawp.school'
    );
  });

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

  test('completes DNS-01 wildcard issuance and publishes one reusable pair', async () => {
    const root = temporaryRoot('preview-cert-wildcard-acme-');
    const certRoot = path.join(root, 'ingress', 'certs');
    const accountRoot = path.join(root, 'ingress', 'acme');
    const challengeRoot = path.join(root, 'ingress', 'challenges');
    const hostname = '*.preview.yawp.school';
    const issued = createCertificate(root, hostname);
    const dnsEvents = [];
    let authPolls = 0;
    let orderPolls = 0;
    let csrSubjectAltNames;
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
    const fetchFn = async (url) => {
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
          identifier: { type: 'dns', value: hostname },
          challenges: [{ type: 'dns-01', token: 'dns_token-1', url: 'https://acme.test/challenge/1' }],
        } : { status: 'valid' });
      }
      if (url === 'https://acme.test/challenge/1') return response({ status: 'pending' });
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

    const result = await ensureWildcardCertificate({
      domain: 'preview.yawp.school',
      certRoot,
      accountRoot,
      challengeRoot,
      email: 'admin@example.com',
      directoryUrl: 'https://acme.test/directory',
      fetchFn,
      pollIntervalMs: 0,
      dnsProvider: {
        present: async (challenge) => {
          dnsEvents.push(['present', challenge.identifier]);
          return { recordName: '_acme-challenge.preview.yawp.school.', recordValue: 'value', zoneId: 'Z1' };
        },
        cleanup: async (challenge) => {
          dnsEvents.push(['cleanup', challenge.recordName]);
        },
      },
      createKeyAndCsr: async (_commonName, { subjectAltNames }) => {
        csrSubjectAltNames = subjectAltNames;
        return {
          privateKeyPem: issued.key,
          csrDer: Buffer.from('test-csr'),
        };
      },
    });

    expect(result).toEqual({ hostname, status: 'issued' });
    expect(csrSubjectAltNames).toEqual([hostname]);
    expect(dnsEvents).toEqual([
      ['present', hostname],
      ['cleanup', '_acme-challenge.preview.yawp.school.'],
    ]);
    expect(readFileSync(path.join(certRoot, '_wildcard.preview.yawp.school', 'privkey.pem'), 'utf8')).toBe(
      issued.key
    );
    expect(await validateCertificatePair({
      hostname,
      keyPath: path.join(certRoot, '_wildcard.preview.yawp.school', 'privkey.pem'),
      certPath: path.join(certRoot, '_wildcard.preview.yawp.school', 'fullchain.pem'),
    })).toBe(true);
  });

  test('falls back to ZeroSSL with email EAB when Let\'s Encrypt hits the registered-domain limit', async () => {
    const root = temporaryRoot('preview-cert-zerossl-fallback-');
    const certRoot = path.join(root, 'ingress', 'certs');
    const accountRoot = path.join(root, 'ingress', 'acme');
    const challengeRoot = path.join(root, 'ingress', 'challenges');
    const hostname = '*.preview.yawp.school';
    const issued = createCertificate(root, hostname);
    const originalAccessKey = process.env.PREVIEW_ZEROSSL_ACCESS_KEY;
    const originalKid = process.env.PREVIEW_ZEROSSL_EAB_KID;
    const originalHmac = process.env.PREVIEW_ZEROSSL_EAB_HMAC_KEY;
    delete process.env.PREVIEW_ZEROSSL_ACCESS_KEY;
    delete process.env.PREVIEW_ZEROSSL_EAB_KID;
    delete process.env.PREVIEW_ZEROSSL_EAB_HMAC_KEY;
    const hmacKey = Buffer.from('zerossl-hmac-key').toString('base64url');
    let sawZeroSslEmailEabRequest = false;
    let sawZeroSslExternalAccountBinding = false;
    let zeroAuthPolls = 0;
    let zeroOrderPolls = 0;
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
      if (url === 'https://acme-v02.api.letsencrypt.org/directory') {
        return response({
          newNonce: 'https://le.test/nonce',
          newAccount: 'https://le.test/account',
          newOrder: 'https://le.test/order/new',
        });
      }
      if (url === 'https://le.test/nonce') return response('', { nonce: 'le-nonce-1' });
      if (url === 'https://le.test/account') {
        return response({}, { status: 201, location: 'https://le.test/account/1' });
      }
      if (url === 'https://le.test/order/new') {
        return response({
          type: 'urn:ietf:params:acme:error:rateLimited',
          detail: 'too many certificates (50) already issued for "yawp.school" in the last 168h0m0s',
        }, { status: 429 });
      }
      if (url === 'https://api.zerossl.com/acme/eab-credentials-email') {
        sawZeroSslEmailEabRequest = options.body === 'email=admin%40example.com';
        return response({
          success: 1,
          eab_kid: 'zerossl-kid',
          eab_hmac_key: hmacKey,
        });
      }
      if (url === 'https://zerossl.test/directory') {
        return response({
          newNonce: 'https://zerossl.test/nonce',
          newAccount: 'https://zerossl.test/account',
          newOrder: 'https://zerossl.test/order/new',
        });
      }
      if (url === 'https://zerossl.test/nonce') return response('', { nonce: 'zero-nonce-1' });
      if (url === 'https://zerossl.test/account') {
        const jws = JSON.parse(options.body);
        const payload = JSON.parse(Buffer.from(jws.payload, 'base64url').toString('utf8'));
        sawZeroSslExternalAccountBinding = payload.externalAccountBinding?.protected
          && payload.externalAccountBinding?.payload
          && payload.externalAccountBinding?.signature;
        return response({}, { status: 201, location: 'https://zerossl.test/account/1' });
      }
      if (url === 'https://zerossl.test/order/new') {
        return response({
          authorizations: ['https://zerossl.test/auth/1'],
          finalize: 'https://zerossl.test/order/1/finalize',
        }, { status: 201, location: 'https://zerossl.test/order/1' });
      }
      if (url === 'https://zerossl.test/auth/1') {
        zeroAuthPolls += 1;
        return response(zeroAuthPolls === 1 ? {
          status: 'pending',
          identifier: { type: 'dns', value: hostname },
          challenges: [{ type: 'dns-01', token: 'zero_dns_token-1', url: 'https://zerossl.test/challenge/1' }],
        } : { status: 'valid' });
      }
      if (url === 'https://zerossl.test/challenge/1') return response({ status: 'pending' });
      if (url === 'https://zerossl.test/order/1/finalize') return response({ status: 'processing' });
      if (url === 'https://zerossl.test/order/1') {
        zeroOrderPolls += 1;
        return response(zeroOrderPolls === 1
          ? { status: 'processing' }
          : { status: 'valid', certificate: 'https://zerossl.test/certificate/1' });
      }
      if (url === 'https://zerossl.test/certificate/1') return response(issued.cert);
      throw new Error(`Unexpected ACME URL ${url}`);
    };

    try {
      const result = await ensureWildcardCertificate({
        domain: 'preview.yawp.school',
        certRoot,
        accountRoot,
        challengeRoot,
        email: 'admin@example.com',
        fetchFn,
        pollIntervalMs: 0,
        zeroSslDirectoryUrl: 'https://zerossl.test/directory',
        dnsProvider: {
          present: async () => ({ recordName: '_acme-challenge.preview.yawp.school.', recordValue: 'value', zoneId: 'Z1' }),
          cleanup: async () => {},
        },
        createKeyAndCsr: async () => ({
          privateKeyPem: issued.key,
          csrDer: Buffer.from('test-csr'),
        }),
      });

      expect(result).toEqual({ hostname, status: 'issued' });
      expect(sawZeroSslEmailEabRequest).toBe(true);
      expect(sawZeroSslExternalAccountBinding).toBeTruthy();
      expect(JSON.parse(readFileSync(path.join(accountRoot, 'zerossl-eab.json'), 'utf8'))).toEqual({
        kid: 'zerossl-kid',
        hmacKey,
      });
      expect(readFileSync(path.join(certRoot, '_wildcard.preview.yawp.school', 'fullchain.pem'), 'utf8')).toBe(
        issued.cert
      );
    } finally {
      if (originalAccessKey === undefined) delete process.env.PREVIEW_ZEROSSL_ACCESS_KEY;
      else process.env.PREVIEW_ZEROSSL_ACCESS_KEY = originalAccessKey;
      if (originalKid === undefined) delete process.env.PREVIEW_ZEROSSL_EAB_KID;
      else process.env.PREVIEW_ZEROSSL_EAB_KID = originalKid;
      if (originalHmac === undefined) delete process.env.PREVIEW_ZEROSSL_EAB_HMAC_KEY;
      else process.env.PREVIEW_ZEROSSL_EAB_HMAC_KEY = originalHmac;
    }
  });

  test('Route53 DNS-01 provider preserves unrelated wildcard challenge TXT values', async () => {
    const calls = [];
    const changes = [];
    let listCalls = 0;
    const expectedDigest = Buffer.from(createHash('sha256').update('authorization').digest())
      .toString('base64url');
    const provider = createRoute53Dns01Provider({
      hostedZoneId: 'ZONE123',
      pollIntervalMs: 0,
      resolveTxtFn: async () => [[expectedDigest]],
      execFileFn: async (_command, args) => {
        calls.push(args);
        if (args[1] === 'list-resource-record-sets') {
          listCalls += 1;
          const values = listCalls === 1 ? ['unrelated'] : ['unrelated', expectedDigest];
          return {
            stdout: JSON.stringify({
              ResourceRecordSets: [{
                Name: '_acme-challenge.preview.yawp.school.',
                Type: 'TXT',
                ResourceRecords: values.map((value) => ({ Value: JSON.stringify(value) })),
              }],
            }),
          };
        }
        if (args[1] === 'change-resource-record-sets') {
          changes.push(JSON.parse(args[args.indexOf('--change-batch') + 1]));
          return { stdout: JSON.stringify({ ChangeInfo: { Id: 'change-1', Status: 'PENDING' } }) };
        }
        if (args[1] === 'get-change') {
          return { stdout: JSON.stringify({ ChangeInfo: { Status: 'INSYNC' } }) };
        }
        throw new Error(`Unexpected aws args: ${args.join(' ')}`);
      },
    });

    const result = await provider.present({
      identifier: '*.preview.yawp.school',
      keyAuthorization: 'authorization',
    });

    expect(result.recordName).toBe('_acme-challenge.preview.yawp.school.');
    await provider.cleanup(result);
    expect(calls.some((call) => call.includes('change-resource-record-sets'))).toBe(true);
    expect(changes[0].Changes[0].Action).toBe('UPSERT');
    expect(changes[0].Changes[0].ResourceRecordSet.ResourceRecords).toEqual([
      { Value: '"unrelated"' },
      { Value: JSON.stringify(expectedDigest) },
    ]);
    expect(changes[1].Changes[0].Action).toBe('UPSERT');
    expect(changes[1].Changes[0].ResourceRecordSet.ResourceRecords).toEqual([
      { Value: '"unrelated"' },
    ]);
  });

  test('Route53 hosted-zone discovery is bounded to the preview domain zone', async () => {
    const dnsNames = [];
    const expectedDigest = Buffer.from(createHash('sha256').update('authorization').digest())
      .toString('base64url');
    const provider = createRoute53Dns01Provider({
      zoneName: 'preview.yawp.school',
      pollIntervalMs: 0,
      resolveTxtFn: async () => [[expectedDigest]],
      execFileFn: async (_command, args) => {
        if (args[1] === 'list-hosted-zones-by-name') {
          dnsNames.push(args[args.indexOf('--dns-name') + 1]);
          return {
            stdout: JSON.stringify({
              HostedZones: [{ Name: 'preview.yawp.school.', Id: '/hostedzone/ZONE123' }],
            }),
          };
        }
        if (args[1] === 'list-resource-record-sets') {
          return { stdout: JSON.stringify({ ResourceRecordSets: [] }) };
        }
        if (args[1] === 'change-resource-record-sets') {
          return { stdout: JSON.stringify({ ChangeInfo: { Id: 'change-1', Status: 'PENDING' } }) };
        }
        if (args[1] === 'get-change') {
          return { stdout: JSON.stringify({ ChangeInfo: { Status: 'INSYNC' } }) };
        }
        throw new Error(`Unexpected aws args: ${args.join(' ')}`);
      },
    });

    await provider.present({
      identifier: '*.preview.yawp.school',
      keyAuthorization: 'authorization',
    });

    expect(dnsNames).toEqual(['preview.yawp.school.']);
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
