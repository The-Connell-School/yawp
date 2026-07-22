import { describe, expect, test } from 'bun:test';
import {
  BLACKBOARD_REFERENCE_PROFILE,
  parseLtiRegistration,
} from './lti-registration';

const validRegistration = {
  id: 'registration-blackboard-001',
  organizationId: 'organization-ua-001',
  provider: 'blackboard',
  displayName: 'Blackboard Reference',
  transportMode: 'https',
  issuer: 'https://blackboard.com',
  clientId: 'yawp-summer-client',
  allowedAudiences: ['yawp-summer-client'],
  deploymentId: 'deployment-blackboard-001',
  authorizationEndpoint:
    'https://developer.blackboard.com/api/v1/gateway/oidcauth',
  tokenEndpoint:
    'https://developer.blackboard.com/api/v1/gateway/oauth2/jwttoken',
  jwksUrl: 'https://example.blackboard.com/.well-known/jwks.json',
  allowedServiceOrigins: ['https://example.blackboard.com'],
  loginInitiationUrl: 'https://app.yawp.school/lti/login',
  launchUrl: 'https://app.yawp.school/lti/launch',
  deepLinkingLaunchUrl: 'https://app.yawp.school/lti/deep-link',
  toolJwksUrl: 'https://app.yawp.school/.well-known/jwks.json',
  allowedTargetLinkUris: [
    'https://app.yawp.school/lti/launch',
    'https://app.yawp.school/lti/deep-link',
  ],
  enabledScopes: [
    'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly',
    'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
    'https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly',
    'https://purl.imsglobal.org/spec/lti-ags/scope/score',
  ],
  enabled: false,
};

describe('LTI registration contract', () => {
  test('parses a strict, default-off Blackboard registration', () => {
    expect(parseLtiRegistration(validRegistration)).toMatchObject({
      provider: 'blackboard',
      issuer: 'https://blackboard.com',
      enabled: false,
    });
  });

  test('publishes the documented Blackboard reference metadata', () => {
    expect(BLACKBOARD_REFERENCE_PROFILE).toEqual({
      provider: 'blackboard',
      displayName: 'Blackboard Learn Ultra / SaaS',
      issuer: 'https://blackboard.com',
      tokenEndpoint:
        'https://developer.blackboard.com/api/v1/gateway/oauth2/jwttoken',
      supportedAlgorithms: ['RS256'],
    });
  });

  test('rejects non-loopback HTTP endpoints', () => {
    expect(() =>
      parseLtiRegistration({
        ...validRegistration,
        jwksUrl: 'http://lms.example.test/.well-known/jwks.json',
      })
    ).toThrow('HTTPS');
  });

  test('allows HTTP only for an explicit loopback integration endpoint', () => {
    const registration = parseLtiRegistration({
      ...validRegistration,
      transportMode: 'loopback-http',
      issuer: 'http://127.0.0.1:43123',
      authorizationEndpoint: 'http://127.0.0.1:43123/oidc/auth',
      tokenEndpoint: 'http://127.0.0.1:43123/oauth2/token',
      jwksUrl: 'http://127.0.0.1:43123/.well-known/jwks.json',
      allowedServiceOrigins: ['http://127.0.0.1:43123'],
      loginInitiationUrl: 'http://127.0.0.1:5174/lti/login',
      launchUrl: 'http://127.0.0.1:5174/lti/launch',
      deepLinkingLaunchUrl: 'http://127.0.0.1:5174/lti/deep-link',
      toolJwksUrl: 'http://127.0.0.1:5174/.well-known/jwks.json',
      allowedTargetLinkUris: [
        'http://127.0.0.1:5174/lti/launch',
        'http://127.0.0.1:5174/lti/deep-link',
      ],
    });

    expect(registration.jwksUrl).toBe(
      'http://127.0.0.1:43123/.well-known/jwks.json'
    );
  });

  test('does not allow loopback HTTP without the explicit transport capability', () => {
    expect(() =>
      parseLtiRegistration({
        ...validRegistration,
        issuer: 'http://127.0.0.1:43123',
      })
    ).toThrow('transport');
  });

  test('rejects private destinations even when they use HTTPS', () => {
    for (const endpoint of [
      'https://127.0.0.1/jwks',
      'https://10.0.0.8/jwks',
      'https://169.254.169.254/latest/meta-data',
      'https://[::1]/jwks',
      'https://[fd00::1]/jwks',
    ]) {
      expect(() =>
        parseLtiRegistration({ ...validRegistration, jwksUrl: endpoint })
      ).toThrow('private');
    }
  });

  test('reports malformed URLs as structured registration validation errors', () => {
    let caught: unknown;
    try {
      parseLtiRegistration({ ...validRegistration, issuer: 'not a URL' });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ name: 'ZodError' });
    expect((caught as Error).message).toContain('absolute URL');
  });

  test('rejects issuer query strings and audiences that exclude the client', () => {
    expect(() =>
      parseLtiRegistration({
        ...validRegistration,
        issuer: 'https://blackboard.com?tenant=other',
      })
    ).toThrow('issuer');

    expect(() =>
      parseLtiRegistration({
        ...validRegistration,
        allowedAudiences: ['other-client'],
      })
    ).toThrow('client');
  });

  test('rejects credentials and fragments in network endpoints', () => {
    expect(() =>
      parseLtiRegistration({
        ...validRegistration,
        tokenEndpoint: 'https://client:secret@lms.example.test/token',
      })
    ).toThrow('credentials');

    expect(() =>
      parseLtiRegistration({
        ...validRegistration,
        jwksUrl: 'https://lms.example.test/jwks#untrusted',
      })
    ).toThrow('fragment');
  });

  test('rejects registrations without a tenant, deployment, or service allowlist', () => {
    for (const field of [
      'organizationId',
      'deploymentId',
      'allowedServiceOrigins',
      'enabledScopes',
    ] as const) {
      expect(() =>
        parseLtiRegistration({ ...validRegistration, [field]: '' })
      ).toThrow();
    }
  });
});
