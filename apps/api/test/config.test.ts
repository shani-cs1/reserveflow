import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { validEnv } from './helpers.js';

describe('loadConfig', () => {
  it('parses a valid environment and applies defaults', () => {
    const config = loadConfig(validEnv);
    expect(config.PORT).toBe(3000);
    expect(config.SHUTDOWN_TIMEOUT_MS).toBe(10_000);
    expect(config.CORS_ORIGINS).toEqual(['http://localhost:5173', 'http://example.test']);
  });

  it('fails fast and names the missing variable', () => {
    const { DATABASE_URL: _omit, ...rest } = validEnv;
    void _omit;
    expect(() => loadConfig(rest)).toThrow(/DATABASE_URL/);
  });

  it('rejects a short JWT secret without printing its value', () => {
    const secret = 'short-secret';
    try {
      loadConfig({ ...validEnv, JWT_SECRET: secret });
      expect.unreachable('should have thrown');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toMatch(/JWT_SECRET/);
      expect(message).not.toContain(secret);
    }
  });

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ ...validEnv, PORT: '99999' })).toThrow(/PORT/);
  });
});
