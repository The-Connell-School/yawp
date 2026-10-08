import { describe, expect, test } from 'bun:test';
import {
  LoginEmailOrHandleSchema,
  parseLoginIdentifier,
} from './login-identifier.server';

describe('parseLoginIdentifier', () => {
  test('detects email vs handle', () => {
    expect(parseLoginIdentifier('sam@school.edu').kind).toBe('email');
    expect(parseLoginIdentifier('cool_writer').kind).toBe('username');
  });
});

describe('LoginEmailOrHandleSchema', () => {
  test('accepts valid handle', () => {
    expect(LoginEmailOrHandleSchema.parse('my_handle')).toBe('my_handle');
  });

  test('rejects reserved handle', () => {
    expect(() => LoginEmailOrHandleSchema.parse('teacher')).toThrow();
  });
});
