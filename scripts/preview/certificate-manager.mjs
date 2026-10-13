import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import {
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  X509Certificate,
} from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { parsePreviewPr } from './wake-server.mjs';

const execFileAsync = promisify(execFile);
const DEFAULT_DIRECTORY_URL = 'https://acme-v02.api.letsencrypt.org/directory';
const ZEROSSL_DIRECTORY_URL = 'https://acme.zerossl.com/v2/DV90';
const ZEROSSL_EAB_URL = 'https://api.zerossl.com/acme/eab-credentials';

export function isDirectExecution(moduleUrl, argv1 = process.argv[1]) {
  if (!argv1) return false;
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function publicKeyDer(key) {
  return createPublicKey(key).export({ type: 'spki', format: 'der' });
}

function validCertificatePair({ hostname, keyPem, certPem }) {
  try {
    const certificate = new X509Certificate(certPem);
    const validationHostname = hostname.startsWith('*.') ? `wildcard-probe.${hostname.slice(2)}` : hostname;
    if (!certificate.checkHost(validationHostname)) return false;
    const privatePublic = publicKeyDer(createPrivateKey(keyPem));
    const certificatePublic = certificate.publicKey.export({ type: 'spki', format: 'der' });
    return Buffer.from(privatePublic).equals(Buffer.from(certificatePublic));
  } catch {
    return false;
  }
}

export async function validateCertificatePair({ hostname, keyPath, certPath }) {
  try {
    const [keyPem, certPem] = await Promise.all([
      readFile(keyPath, 'utf8'),
      readFile(certPath, 'utf8'),
    ]);
    return validCertificatePair({ hostname, keyPem, certPem });
  } catch {
    return false;
  }
}

export function certificateNeedsRenewal(certPem, {
  renewalDays = 30,
  now = Date.now(),
} = {}) {
  try {
    const certificate = new X509Certificate(certPem);
    const expires = Date.parse(certificate.validTo);
    return !Number.isFinite(expires) || expires - now <= renewalDays * 24 * 60 * 60 * 1000;
  } catch {
    return true;
  }
}

async function atomicWrite(target, data, mode) {
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, data, { mode });
  await rename(temporary, target);
  await chmod(target, mode);
}

function certificateEntries(value, entries = []) {
  if (!value || typeof value !== 'object') return entries;
  if (Array.isArray(value.Certificates)) entries.push(...value.Certificates);
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') certificateEntries(child, entries);
  }
  return entries;
}

export function wildcardCertificateHostname(domain) {
  if (!/^([A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?$/.test(domain)) {
    throw new Error('Preview domain must be a valid DNS domain');
  }
  return `*.${domain.toLowerCase()}`;
}

export function certificateStorageName(hostname) {
  return hostname.startsWith('*.') ? `_wildcard.${hostname.slice(2)}` : hostname;
}

function certificatePaths(certRoot, hostname) {
  const storageName = certificateStorageName(hostname);
  return {
    keyPath: path.join(certRoot, storageName, 'privkey.pem'),
    certPath: path.join(certRoot, storageName, 'fullchain.pem'),
  };
}

export async function importResidentTraefikCertificates({
  acmePath,
  root,
  certRoot,
  domain,
}) {
  let acme;
  try {
    acme = JSON.parse(await readFile(acmePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const imported = [];
  for (const entry of certificateEntries(acme)) {
    const hostname = String(entry?.domain?.main || '').toLowerCase();
    const pr = parsePreviewPr(hostname, domain);
    if (pr === null) continue;
    try {
      const resident = await stat(path.join(root, 'previews', `pr-${pr}`));
      if (!resident.isDirectory()) continue;
      const certPem = Buffer.from(String(entry.certificate || ''), 'base64').toString('utf8');
      const keyPem = Buffer.from(String(entry.key || ''), 'base64').toString('utf8');
      if (!validCertificatePair({ hostname, keyPem, certPem })) continue;
      const target = path.join(certRoot, hostname);
      await atomicWrite(path.join(target, 'privkey.pem'), keyPem, 0o600);
      await atomicWrite(path.join(target, 'fullchain.pem'), certPem, 0o644);
      imported.push(hostname);
    } catch {
      // Ignore removed residents and malformed legacy entries. Neither should block cutover.
    }
  }
  return [...new Set(imported)].sort();
}

function canonicalJwk(publicJwk) {
  return {
    e: publicJwk.e,
    kty: 'RSA',
    n: publicJwk.n,
  };
}

function responseMessage(body) {
  try {
    const parsed = JSON.parse(body);
    return parsed.detail || parsed.type || body;
  } catch {
    return body;
  }
}

async function delay(milliseconds) {
  if (milliseconds > 0) await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchWithTimeout(fetchFn, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    return await fetchFn(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

class AcmeSession {
  constructor({ directory, directoryUrl, fetchFn, privateKeyPem, kid }) {
    this.directory = directory;
    this.directoryUrl = directoryUrl;
    this.fetchFn = fetchFn;
    this.privateKeyPem = privateKeyPem;
    this.privateKey = createPrivateKey(privateKeyPem);
    this.jwk = canonicalJwk(createPublicKey(this.privateKey).export({ format: 'jwk' }));
    this.kid = kid;
    this.nonce = null;
  }

  async nextNonce() {
    if (this.nonce) {
      const nonce = this.nonce;
      this.nonce = null;
      return nonce;
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await this.fetchFn(this.directory.newNonce, { method: 'HEAD' });
        const nonce = response.headers.get('replay-nonce');
        if (response.ok && nonce) return nonce;
      } catch (error) {
        if (attempt === 2) throw error;
      }
      await delay(250 * (attempt + 1));
    }
    throw new Error('ACME server did not provide a nonce');
  }

  async post(url, payload, { useJwk = false } = {}) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const protectedHeader = {
        alg: 'RS256',
        nonce: await this.nextNonce(),
        url,
        ...(useJwk || !this.kid ? { jwk: this.jwk } : { kid: this.kid }),
      };
      const protectedValue = base64url(JSON.stringify(protectedHeader));
      const payloadValue = payload === null ? '' : base64url(JSON.stringify(payload));
      const signature = sign(
        'RSA-SHA256',
        Buffer.from(`${protectedValue}.${payloadValue}`),
        this.privateKey,
      );
      try {
        const response = await this.fetchFn(url, {
          method: 'POST',
          headers: { 'content-type': 'application/jose+json' },
          body: JSON.stringify({
            protected: protectedValue,
            payload: payloadValue,
            signature: base64url(signature),
          }),
        });
        this.nonce = response.headers.get('replay-nonce') || null;
        if (response.ok) return response;
        const body = await response.text();
        let problemType = '';
        try {
          problemType = String(JSON.parse(body)?.type || '');
        } catch {
          // Non-JSON ACME errors are reported below.
        }
        const retryable = response.status >= 500 || problemType.endsWith(':badNonce');
        if (!retryable || attempt === 2) {
          throw new Error(`ACME request failed (${response.status}): ${responseMessage(body)}`);
        }
      } catch (error) {
        if (attempt === 2 || /^ACME request failed/.test(error.message)) throw error;
        this.nonce = null;
      }
      await delay(250 * (attempt + 1));
    }
    throw new Error('ACME request retry budget exhausted');
  }

  async json(url, payload, options) {
    const response = await this.post(url, payload, options);
    const body = await response.text();
    return { response, body: body ? JSON.parse(body) : {} };
  }
}

function generateAccountKey() {
  return generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  }).privateKey;
}

function registrationFilename(directoryUrl) {
  if (directoryUrl === DEFAULT_DIRECTORY_URL) return 'registration.json';
  const digest = createHash('sha256').update(directoryUrl).digest('hex').slice(0, 16);
  return `registration-${digest}.json`;
}

function externalAccountBindingJws({ jwk, kid, hmacKey, url }) {
  const protectedValue = base64url(JSON.stringify({ alg: 'HS256', kid, url }));
  const payloadValue = base64url(JSON.stringify(jwk));
  const signature = createHmac('sha256', Buffer.from(hmacKey, 'base64url'))
    .update(`${protectedValue}.${payloadValue}`)
    .digest('base64url');
  return {
    protected: protectedValue,
    payload: payloadValue,
    signature,
  };
}

async function createSession({
  directoryUrl,
  fetchFn,
  accountRoot,
  email,
  externalAccountBinding,
}) {
  await mkdir(accountRoot, { recursive: true, mode: 0o700 });
  const keyPath = path.join(accountRoot, 'account-key.pem');
  const registrationPath = path.join(accountRoot, registrationFilename(directoryUrl));
  let privateKeyPem;
  try {
    privateKeyPem = await readFile(keyPath, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    privateKeyPem = generateAccountKey();
    await atomicWrite(keyPath, privateKeyPem, 0o600);
  }
  let directoryResponse;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      directoryResponse = await fetchFn(directoryUrl);
      if (directoryResponse.ok) break;
      if (directoryResponse.status < 500 || attempt === 2) {
        throw new Error(`Unable to load ACME directory (${directoryResponse.status})`);
      }
    } catch (error) {
      if (attempt === 2 || /^Unable to load ACME directory/.test(error.message)) throw error;
    }
    await delay(250 * (attempt + 1));
  }
  if (!directoryResponse?.ok) throw new Error('Unable to load ACME directory');
  const directory = await directoryResponse.json();
  let registration = null;
  try {
    registration = JSON.parse(await readFile(registrationPath, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const session = new AcmeSession({
    directory,
    directoryUrl,
    fetchFn,
    privateKeyPem,
    kid: registration?.directoryUrl === directoryUrl ? registration.kid : null,
  });
  if (!session.kid) {
    const accountPayload = {
      termsOfServiceAgreed: true,
      ...(email ? { contact: [`mailto:${email}`] } : {}),
    };
    if (externalAccountBinding) {
      accountPayload.externalAccountBinding = externalAccountBindingJws({
        jwk: session.jwk,
        kid: externalAccountBinding.kid,
        hmacKey: externalAccountBinding.hmacKey,
        url: directory.newAccount,
      });
    }
    const { response } = await session.json(directory.newAccount, {
      ...accountPayload,
    }, { useJwk: true });
    session.kid = response.headers.get('location');
    if (!session.kid) throw new Error('ACME account response omitted its account URL');
    await atomicWrite(registrationPath, `${JSON.stringify({ directoryUrl, kid: session.kid })}\n`, 0o600);
  }
  return session;
}

async function defaultCreateKeyAndCsr(hostname, { subjectAltNames = [hostname] } = {}) {
  const temporary = await mkdtemp(path.join(tmpdir(), 'yawp-preview-csr-'));
  try {
    const privateKeyPem = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    }).privateKey;
    const keyPath = path.join(temporary, 'privkey.pem');
    const csrPath = path.join(temporary, 'request.der');
    await writeFile(keyPath, privateKeyPem, { mode: 0o600 });
    await execFileAsync('openssl', [
      'req', '-new', '-sha256',
      '-key', keyPath,
      '-subj', `/CN=${hostname}`,
      '-addext', `subjectAltName=${subjectAltNames.map((name) => `DNS:${name}`).join(',')}`,
      '-outform', 'DER',
      '-out', csrPath,
    ], { timeout: 30_000, maxBuffer: 1024 * 1024 });
    return { privateKeyPem, csrDer: await readFile(csrPath) };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

function challengeDomainForIdentifier(identifier) {
  return identifier.startsWith('*.') ? identifier.slice(2) : identifier;
}

function dnsChallengeName(identifier) {
  return `_acme-challenge.${challengeDomainForIdentifier(identifier)}`;
}

function hostedZoneCandidates(name) {
  const labels = name.replace(/\.$/, '').split('.');
  const candidates = [];
  for (let index = 0; index < labels.length - 1; index += 1) {
    candidates.push(`${labels.slice(index).join('.')}.`);
  }
  return candidates;
}

function route53ChangeBatch(recordName, recordValue, action) {
  return JSON.stringify({
    Changes: [{
      Action: action,
      ResourceRecordSet: {
        Name: recordName,
        Type: 'TXT',
        TTL: 30,
        ResourceRecords: [{ Value: JSON.stringify(recordValue) }],
      },
    }],
  });
}

function route53Args(extra = []) {
  return ['route53', ...extra];
}

async function execAwsJson(execFileFn, args, options = {}) {
  const { stdout } = await execFileFn('aws', route53Args(args), {
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
    ...options,
  });
  return stdout ? JSON.parse(stdout) : {};
}

async function discoverRoute53HostedZoneId({ recordName, execFileFn }) {
  for (const candidate of hostedZoneCandidates(recordName)) {
    const response = await execAwsJson(execFileFn, [
      'list-hosted-zones-by-name',
      '--dns-name', candidate,
      '--max-items', '1',
      '--output', 'json',
    ]);
    const zone = response.HostedZones?.[0];
    if (zone?.Name === candidate && zone?.Config?.PrivateZone !== true) {
      return String(zone.Id || '').replace(/^\/hostedzone\//, '');
    }
  }
  throw new Error(`No public Route53 hosted zone found for ${recordName}`);
}

async function waitForRoute53Change({ changeId, execFileFn, pollIntervalMs }) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await execAwsJson(execFileFn, [
      'get-change',
      '--id', changeId,
      '--output', 'json',
    ]);
    if (response.ChangeInfo?.Status === 'INSYNC') return;
    await delay(pollIntervalMs);
  }
  throw new Error(`Route53 change ${changeId} did not become INSYNC`);
}

async function waitForDnsTxt({ recordName, expectedValue, resolveTxtFn, pollIntervalMs }) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const records = await resolveTxtFn(recordName);
      if (records.some((parts) => parts.join('') === expectedValue)) return;
    } catch {
      // DNS propagation is expected to race the first few reads.
    }
    await delay(pollIntervalMs);
  }
  throw new Error(`DNS TXT challenge did not propagate for ${recordName}`);
}

export function createRoute53Dns01Provider({
  hostedZoneId = process.env.PREVIEW_ROUTE53_ZONE_ID || '',
  execFileFn = execFileAsync,
  resolveTxtFn = resolveTxt,
  pollIntervalMs = 2000,
} = {}) {
  return {
    async present({ identifier, keyAuthorization }) {
      const recordName = `${dnsChallengeName(identifier)}.`;
      const zoneId = hostedZoneId || await discoverRoute53HostedZoneId({ recordName, execFileFn });
      const recordValue = base64url(createHash('sha256').update(keyAuthorization).digest());
      const response = await execAwsJson(execFileFn, [
        'change-resource-record-sets',
        '--hosted-zone-id', zoneId,
        '--change-batch', route53ChangeBatch(recordName, recordValue, 'UPSERT'),
        '--output', 'json',
      ]);
      if (response.ChangeInfo?.Id) {
        await waitForRoute53Change({
          changeId: response.ChangeInfo.Id,
          execFileFn,
          pollIntervalMs,
        });
      }
      await waitForDnsTxt({
        recordName,
        expectedValue: recordValue,
        resolveTxtFn,
        pollIntervalMs,
      });
      return { recordName, recordValue, zoneId };
    },
    async cleanup({ recordName, recordValue, zoneId }) {
      if (!recordName || !recordValue || !zoneId) return;
      try {
        await execAwsJson(execFileFn, [
          'change-resource-record-sets',
          '--hosted-zone-id', zoneId,
          '--change-batch', route53ChangeBatch(recordName, recordValue, 'DELETE'),
          '--output', 'json',
        ]);
      } catch (error) {
        console.error(`Warning: failed to remove ACME DNS challenge ${recordName}: ${error.message}`);
      }
    },
  };
}

async function waitForStatus({ session, url, valid, pollIntervalMs, attempts = 60 }) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0 && pollIntervalMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    const { body } = await session.json(url, null);
    if (valid(body)) return body;
    if (body.status === 'invalid') {
      throw new Error(`ACME resource became invalid: ${JSON.stringify(body.error || {})}`);
    }
  }
  throw new Error('ACME validation timed out');
}

export async function ensureCertificate({
  hostname,
  domain,
  certRoot,
  accountRoot,
  challengeRoot,
  email,
  directoryUrl = DEFAULT_DIRECTORY_URL,
  fetchFn = globalThis.fetch,
  pollIntervalMs = 2000,
  renewalDays = 30,
  createKeyAndCsr = defaultCreateKeyAndCsr,
  requestTimeoutMs = 15_000,
}) {
  if (parsePreviewPr(hostname, domain) === null || hostname !== hostname.toLowerCase()) {
    throw new Error('Certificate hostname must be an exact lowercase PR preview host');
  }
  const { keyPath, certPath } = certificatePaths(certRoot, hostname);
  try {
    const certPem = await readFile(certPath, 'utf8');
    if (
      !certificateNeedsRenewal(certPem, { renewalDays })
      && await validateCertificatePair({ hostname, keyPath, certPath })
    ) return { hostname, status: 'current' };
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  return issueCertificate({
    hostname,
    identifiers: [hostname],
    challengeType: 'http-01',
    certRoot,
    accountRoot,
    challengeRoot,
    email,
    directoryUrl,
    fetchFn,
    pollIntervalMs,
    createKeyAndCsr,
    requestTimeoutMs,
  });
}

async function issueCertificate({
  hostname,
  identifiers,
  challengeType,
  certRoot,
  accountRoot,
  challengeRoot,
  email,
  directoryUrl,
  fetchFn,
  pollIntervalMs,
  createKeyAndCsr,
  requestTimeoutMs,
  dnsProvider,
  externalAccountBinding,
}) {
  const { keyPath, certPath } = certificatePaths(certRoot, hostname);
  const boundedFetch = (url, options) => fetchWithTimeout(
    fetchFn,
    url,
    options,
    requestTimeoutMs,
  );
  const session = await createSession({
    directoryUrl,
    fetchFn: boundedFetch,
    accountRoot,
    email,
    externalAccountBinding,
  });
  const { response: orderResponse, body: order } = await session.json(
    session.directory.newOrder,
    { identifiers: identifiers.map((value) => ({ type: 'dns', value })) },
  );
  const orderUrl = orderResponse.headers.get('location');
  if (!orderUrl || !Array.isArray(order.authorizations) || !order.finalize) {
    throw new Error('ACME order response is incomplete');
  }
  const { privateKeyPem, csrDer } = await createKeyAndCsr(hostname, {
    subjectAltNames: identifiers,
  });
  await mkdir(challengeRoot, { recursive: true, mode: 0o755 });
  let challengePath = null;
  const dnsChallenges = [];
  try {
    for (const authorizationUrl of order.authorizations) {
      const { body: authorization } = await session.json(authorizationUrl, null);
      if (authorization.status === 'valid') continue;
      const challenge = authorization.challenges?.find((candidate) => candidate.type === challengeType);
      if (!challenge || !/^[A-Za-z0-9_-]{1,256}$/.test(challenge.token) || !challenge.url) {
        throw new Error(`ACME authorization has no usable ${challengeType} challenge`);
      }
      const thumbprint = base64url(createHash('sha256').update(JSON.stringify(session.jwk)).digest());
      const keyAuthorization = `${challenge.token}.${thumbprint}`;
      if (challengeType === 'http-01') {
        challengePath = path.join(challengeRoot, challenge.token);
        await atomicWrite(challengePath, `${keyAuthorization}\n`, 0o644);
      } else if (challengeType === 'dns-01') {
        if (!dnsProvider) throw new Error('DNS-01 challenge requires a DNS provider');
        const identifier = String(authorization.identifier?.value || identifiers[0] || hostname);
        dnsChallenges.push(await dnsProvider.present({ identifier, keyAuthorization }));
      }
      await session.json(challenge.url, {});
      await waitForStatus({
        session,
        url: authorizationUrl,
        valid: (body) => body.status === 'valid',
        pollIntervalMs,
      });
      if (challengePath) {
        await rm(challengePath, { force: true });
        challengePath = null;
      }
    }
    await session.json(order.finalize, { csr: base64url(csrDer) });
    const completed = await waitForStatus({
      session,
      url: orderUrl,
      valid: (body) => body.status === 'valid' && typeof body.certificate === 'string',
      pollIntervalMs,
    });
    const certificateResponse = await session.post(completed.certificate, null);
    const certPem = await certificateResponse.text();
    if (!validCertificatePair({ hostname, keyPem: privateKeyPem, certPem })) {
      throw new Error('ACME returned a certificate that does not match the hostname and private key');
    }
    await atomicWrite(keyPath, privateKeyPem, 0o600);
    await atomicWrite(certPath, certPem, 0o644);
    return { hostname, status: 'issued' };
  } finally {
    if (challengePath) await rm(challengePath, { force: true });
    if (dnsProvider) {
      await Promise.all(dnsChallenges.map((challenge) => dnsProvider.cleanup(challenge)));
    }
  }
}

async function readZeroSslEabCredentials(accountRoot) {
  try {
    const parsed = JSON.parse(await readFile(path.join(accountRoot, 'zerossl-eab.json'), 'utf8'));
    if (parsed?.kid && parsed?.hmacKey) return parsed;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return null;
}

async function resolveZeroSslEabCredentials({
  accountRoot,
  fetchFn,
  requestTimeoutMs,
  accessKey = process.env.PREVIEW_ZEROSSL_ACCESS_KEY || '',
  kid = process.env.PREVIEW_ZEROSSL_EAB_KID || '',
  hmacKey = process.env.PREVIEW_ZEROSSL_EAB_HMAC_KEY || '',
}) {
  if (kid && hmacKey) return { kid, hmacKey };
  const stored = await readZeroSslEabCredentials(accountRoot);
  if (stored) return stored;
  if (!accessKey) return null;
  const url = new URL(ZEROSSL_EAB_URL);
  url.searchParams.set('access_key', accessKey);
  const response = await fetchWithTimeout(fetchFn, url, { method: 'POST' }, requestTimeoutMs);
  if (!response.ok) {
    throw new Error(`ZeroSSL EAB credential request failed (${response.status})`);
  }
  const body = await response.json();
  if (body?.success !== 1 || !body.eab_kid || !body.eab_hmac_key) {
    throw new Error('ZeroSSL EAB credential response was incomplete');
  }
  const credentials = { kid: body.eab_kid, hmacKey: body.eab_hmac_key };
  await atomicWrite(
    path.join(accountRoot, 'zerossl-eab.json'),
    `${JSON.stringify(credentials)}\n`,
    0o600,
  );
  return credentials;
}

function isLetsEncryptRegisteredDomainRateLimit(error) {
  return /^ACME request failed \(429\):/.test(String(error?.message || ''))
    && /too many certificates .*already issued for .* in the last 168h/i.test(error.message);
}

export async function ensureWildcardCertificate({
  domain,
  certRoot,
  accountRoot,
  challengeRoot,
  email,
  directoryUrl = DEFAULT_DIRECTORY_URL,
  fetchFn = globalThis.fetch,
  pollIntervalMs = 2000,
  renewalDays = 30,
  createKeyAndCsr = defaultCreateKeyAndCsr,
  requestTimeoutMs = 15_000,
  dnsProvider = createRoute53Dns01Provider({ pollIntervalMs }),
  zeroSslDirectoryUrl = ZEROSSL_DIRECTORY_URL,
}) {
  const hostname = wildcardCertificateHostname(domain);
  const { keyPath, certPath } = certificatePaths(certRoot, hostname);
  try {
    const certPem = await readFile(certPath, 'utf8');
    if (
      !certificateNeedsRenewal(certPem, { renewalDays })
      && await validateCertificatePair({ hostname, keyPath, certPath })
    ) return { hostname, status: 'current' };
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  try {
    return await issueCertificate({
      hostname,
      identifiers: [hostname],
      challengeType: 'dns-01',
      certRoot,
      accountRoot,
      challengeRoot,
      email,
      directoryUrl,
      fetchFn,
      pollIntervalMs,
      createKeyAndCsr,
      requestTimeoutMs,
      dnsProvider,
    });
  } catch (error) {
    if (!isLetsEncryptRegisteredDomainRateLimit(error) || directoryUrl !== DEFAULT_DIRECTORY_URL) {
      throw error;
    }
    const externalAccountBinding = await resolveZeroSslEabCredentials({
      accountRoot,
      fetchFn,
      requestTimeoutMs,
    });
    if (!externalAccountBinding) {
      throw new Error(
        `${error.message}; ZeroSSL fallback is not configured (set PREVIEW_ZEROSSL_ACCESS_KEY or PREVIEW_ZEROSSL_EAB_KID/PREVIEW_ZEROSSL_EAB_HMAC_KEY)`,
      );
    }
    return issueCertificate({
      hostname,
      identifiers: [hostname],
      challengeType: 'dns-01',
      certRoot,
      accountRoot,
      challengeRoot,
      email,
      directoryUrl: zeroSslDirectoryUrl,
      fetchFn,
      pollIntervalMs,
      createKeyAndCsr,
      requestTimeoutMs,
      dnsProvider,
      externalAccountBinding,
    });
  }
}

export async function residentPreviewHostnames(root, domain) {
  const entries = await readdir(path.join(root, 'previews'), { withFileTypes: true });
  const hostnames = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^pr-[1-9][0-9]*$/.test(entry.name)) continue;
    hostnames.push(`${entry.name}.${domain}`);
    hostnames.push(`ua-${entry.name}.${domain}`);
    hostnames.push(`blackboard-${entry.name}.${domain}`);
  }
  return hostnames.sort((a, b) => parsePreviewPr(a, domain) - parsePreviewPr(b, domain));
}

export async function maintainCertificates({ hostnames, ensure = ensureCertificate, options }) {
  const results = [];
  const failures = [];
  for (const hostname of hostnames) {
    try {
      results.push(await ensure({ hostname, ...options }));
    } catch (error) {
      failures.push({ hostname, error });
    }
  }
  return { results, failures };
}

if (isDirectExecution(import.meta.url)) {
  const root = process.env.PREVIEW_ROOT || '/srv/yawp-preview';
  const domain = process.env.PREVIEW_DOMAIN || '';
  const email = process.env.PREVIEW_ACME_EMAIL || '';
  const certRoot = process.env.PREVIEW_CERT_ROOT || path.join(root, 'ingress', 'certs');
  const accountRoot = process.env.PREVIEW_ACME_ROOT || path.join(root, 'ingress', 'acme');
  const challengeRoot = process.env.PREVIEW_CHALLENGE_ROOT || path.join(root, 'ingress', 'challenges');
  const mode = process.argv[2];
  if (mode === '--import-traefik') {
    const acmePath = process.env.PREVIEW_TRAEFIK_ACME_PATH
      || path.join(root, 'traefik', 'letsencrypt', 'acme.json');
    const imported = await importResidentTraefikCertificates({ acmePath, root, certRoot, domain });
    console.log(`Imported ${imported.length} resident preview certificate(s)`);
  } else {
    const hostnames = mode === '--wildcard'
      ? [wildcardCertificateHostname(domain)]
      : mode === '--resident'
      ? await residentPreviewHostnames(root, domain)
      : [String(mode || '')];
    if (hostnames.length === 0) throw new Error('No resident preview certificates to maintain');
    if (mode === '--wildcard') {
      const result = await ensureWildcardCertificate({
        domain,
        certRoot,
        accountRoot,
        challengeRoot,
        email,
      });
      console.log(`${result.hostname}: ${result.status}`);
    } else {
      const report = await maintainCertificates({
        hostnames,
        options: {
          domain,
          certRoot,
          accountRoot,
          challengeRoot,
          email,
        },
      });
      for (const result of report.results) {
        console.log(`${result.hostname}: ${result.status}`);
      }
      for (const failure of report.failures) {
        console.error(`${failure.hostname}: ${failure.error.message}`);
      }
      if (report.failures.length > 0) process.exitCode = 1;
    }
  }
}
