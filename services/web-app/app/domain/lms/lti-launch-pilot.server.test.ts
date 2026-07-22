import { describe, expect, test } from 'bun:test';
import {
  buildLtiOidcAuthorizationUrl,
  deriveLtiSubjectHash,
  hashLtiOneTimeValue,
  mapLtiRolesToMembershipRole,
  parseLtiLoginInitiation,
  resolveLtiLaunchDestination,
} from './lti-launch-pilot.server';

const INSTRUCTOR =
  'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor';
const INSTRUCTOR_SUBROLE =
  'http://purl.imsglobal.org/vocab/lis/v2/membership/Instructor#TeachingAssistant';
const LEARNER = 'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner';
const TEST_USER = 'http://purl.imsglobal.org/vocab/lti/system/person#TestUser';

describe('LTI launch pilot primitives', () => {
  test('hashes state and nonce without persisting their raw values', () => {
    expect(hashLtiOneTimeValue('state-123')).toBe(
      '52648fc33445b62f32592b7d6fdfe4030820f26a0517ac1ae79c3da96b2b34c9'
    );
    expect(hashLtiOneTimeValue('state-123')).not.toContain('state-123');
  });

  test('scopes an external subject HMAC to one registration', () => {
    const first = deriveLtiSubjectHash({
      hmacSecret: 'identity-secret',
      registrationId: 'registration-a',
      subject: 'student-42',
    });
    const second = deriveLtiSubjectHash({
      hmacSecret: 'identity-secret',
      registrationId: 'registration-b',
      subject: 'student-42',
    });
    expect(first).toHaveLength(64);
    expect(second).toHaveLength(64);
    expect(first).not.toBe(second);
    expect(first).not.toContain('student-42');
  });

  test.each([
    [[INSTRUCTOR], 'TEACHER'],
    [[INSTRUCTOR_SUBROLE], 'TEACHER'],
    [[LEARNER], 'STUDENT'],
    [[TEST_USER, LEARNER], 'STUDENT'],
  ] as const)('maps standards roles %j to %s', (roles, expected) => {
    expect(mapLtiRolesToMembershipRole([...roles])).toBe(expected);
  });

  test.each([
    [[]],
    [[TEST_USER]],
    [[INSTRUCTOR, LEARNER]],
    [['https://roles.example.test/Instructor']],
    [['http://purl.imsglobal.org/vocab/lis/v2/membership#Mentor']],
  ])('rejects absent, mixed, or unauthorized role sets %j', (roles) => {
    expect(() => mapLtiRolesToMembershipRole(roles)).toThrow(
      'exactly one Yawp membership role'
    );
  });

  test('parses a bounded OIDC login initiation and preserves opaque hints', () => {
    expect(
      parseLtiLoginInitiation(
        new URLSearchParams({
          iss: 'https://blackboard.example.edu',
          client_id: 'yawp-client',
          lti_deployment_id: 'deployment-1',
          login_hint: 'opaque-login-hint',
          lti_message_hint: 'opaque-message-hint',
          target_link_uri: 'https://yawp.example/lti/launch',
        })
      )
    ).toEqual({
      issuer: 'https://blackboard.example.edu',
      clientId: 'yawp-client',
      deploymentId: 'deployment-1',
      loginHint: 'opaque-login-hint',
      messageHint: 'opaque-message-hint',
      targetLinkUri: 'https://yawp.example/lti/launch',
    });
  });

  test.each([
    new URLSearchParams(),
    new URLSearchParams({
      iss: 'not-a-url',
      client_id: 'yawp-client',
      lti_deployment_id: 'deployment-1',
      login_hint: 'hint',
      target_link_uri: 'https://yawp.example/lti/launch',
    }),
    new URLSearchParams({
      iss: 'https://blackboard.example.edu',
      client_id: 'yawp-client',
      lti_deployment_id: 'deployment-1',
      login_hint: 'hint',
      target_link_uri: 'javascript:alert(1)',
    }),
  ])('rejects malformed login initiation parameters', (parameters) => {
    expect(() => parseLtiLoginInitiation(parameters)).toThrow();
  });

  test('builds the registered OIDC authorization redirect exactly', () => {
    const url = buildLtiOidcAuthorizationUrl({
      authorizationEndpoint: 'https://blackboard.example.edu/oidc/auth',
      clientId: 'yawp-client',
      launchUrl: 'https://yawp.example/lti/launch',
      loginHint: 'opaque-login-hint',
      messageHint: 'opaque-message-hint',
      state: 'state-value',
      nonce: 'nonce-value',
    });
    expect(url.origin + url.pathname).toBe(
      'https://blackboard.example.edu/oidc/auth'
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      scope: 'openid',
      response_type: 'id_token',
      response_mode: 'form_post',
      prompt: 'none',
      client_id: 'yawp-client',
      redirect_uri: 'https://yawp.example/lti/launch',
      login_hint: 'opaque-login-hint',
      lti_message_hint: 'opaque-message-hint',
      state: 'state-value',
      nonce: 'nonce-value',
    });
  });

  test('omits an absent optional message hint', () => {
    const url = buildLtiOidcAuthorizationUrl({
      authorizationEndpoint: 'https://blackboard.example.edu/oidc/auth',
      clientId: 'yawp-client',
      launchUrl: 'https://yawp.example/lti/launch',
      loginHint: 'opaque-login-hint',
      messageHint: null,
      state: 'state-value',
      nonce: 'nonce-value',
    });
    expect(url.searchParams.has('lti_message_hint')).toBe(false);
  });

  test('routes teachers to class management and students to their workspace', () => {
    expect(
      resolveLtiLaunchDestination({ classId: 'class/unsafe', role: 'TEACHER' })
    ).toBe('/app/my-classes/class%2Funsafe');
    expect(
      resolveLtiLaunchDestination({ classId: 'class-1', role: 'STUDENT' })
    ).toBe('/app?ltiClassId=class-1');
  });
});
