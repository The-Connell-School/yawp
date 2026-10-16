import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { expect, test } from 'bun:test';
import {
  captureSavedFeedback,
  sanitizeDemoFeedbackEvent,
} from './demo-feedback-context';

test('the real PostHog SDK cannot attach secret URL, referrer, campaign or person fields to saved feedback', async () => {
  try {
    GlobalRegistrator.register({
      url: 'https://demo.yawp.school/app/assignments?token=qa-secret#password',
    });
  } catch {}
  const { PostHog } = await import('posthog-js');
  const client = new PostHog();
  const raw: unknown[] = [];
  const clean: unknown[] = [];
  // Suppress every request, including initialization. No delivery leaves this test.
  client._send_request = () => {};
  client.init('phc_local_feedback_test', {
    api_host: 'https://analytics.invalid',
    persistence: 'memory',
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    advanced_disable_flags: true,
    disable_external_dependency_loading: true,
    opt_out_useragent_filter: true,
    before_send: (event) => {
      raw.push(event);
      clean.push(sanitizeDemoFeedbackEvent(event));
      return null;
    },
  });
  try {
    client.register({
      $current_url: 'https://demo.yawp.school/app?token=super-secret',
      $referrer: 'https://demo.yawp.school/app?password=referrer-secret',
      arbitrary_private_property: 'private-value',
    });
    captureSavedFeedback(client, '/app/assignments', [
      { type: 'route', path: '/app' },
    ]);
    expect(raw).toHaveLength(1);
    expect(JSON.stringify(raw)).toContain('super-secret');
    expect(clean).toHaveLength(1);
    expect(JSON.stringify(clean)).not.toMatch(
      /qa-secret|super-secret|referrer-secret|private-value|token|password/
    );
    expect(clean[0]).toMatchObject({
      event: 'feedback_submitted',
      properties: {
        location: '/app/assignments',
        recent_actions: [{ type: 'route', path: '/app' }],
        distinct_id: expect.any(String),
      },
    });
  } finally {
    client.opt_out_capturing();
    client.stopSessionRecording();
  }
});

test('the final-event hook removes nested person URLs and leaves other analytics unchanged', () => {
  const event = {
    uuid: 'test',
    event: 'feedback_submitted',
    properties: {
      location: '/app?token=secret',
      recent_actions: [{ type: 'route', path: '/app?token=secret' }],
      $set: { url: 'private' },
    },
    $set_once: { $initial_current_url: 'private' },
  };
  const result = sanitizeDemoFeedbackEvent(event);
  expect(result).toEqual({
    uuid: 'test',
    event: 'feedback_submitted',
    timestamp: undefined,
    properties: {
      location: '/app',
      $current_url: '/app',
      $pathname: '/app',
      recent_actions: [{ type: 'route', path: '/app' }],
    },
  });
  const other = {
    uuid: 'other',
    event: 'existing_event',
    properties: { existing: true },
  };
  expect(sanitizeDemoFeedbackEvent(other)).toBe(other);
  expect(sanitizeDemoFeedbackEvent(null)).toBeNull();
});
