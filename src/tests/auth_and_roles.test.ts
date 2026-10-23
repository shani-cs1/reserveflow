import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initDatabase, closeDatabase } from '../server/db/index.ts';
import { seedDatabase } from '../server/db/seed.ts';
import { AuthService } from '../server/services/authService.ts';
import { AuthenticationError } from '../server/utils/errors.ts';

describe('Authentication & Roles', () => {
  beforeAll(async () => {
    await initDatabase();
    await seedDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('authenticates seeded ADMIN user with valid credentials', async () => {
    const result = await AuthService.login('admin@reserveflow.local', 'AdminPass123!');
    expect(result).toHaveProperty('token');
    expect(result.user.role).toBe('ADMIN');
    expect(result.user.email).toBe('admin@reserveflow.local');

    // Verify token can be decoded
    const decoded = AuthService.verifyToken(result.token);
    expect(decoded.role).toBe('ADMIN');
    expect(decoded.userId).toBe(result.user.userId);
  });

  it('authenticates seeded OPERATOR user with valid credentials', async () => {
    const result = await AuthService.login('operator@reserveflow.local', 'OperatorPass123!');
    expect(result.user.role).toBe('OPERATOR');
    expect(result.user.email).toBe('operator@reserveflow.local');
  });

  it('rejects authentication with invalid password', async () => {
    await expect(
      AuthService.login('admin@reserveflow.local', 'WrongPassword!')
    ).rejects.toThrow(AuthenticationError);
  });

  it('rejects authentication with non-existent user email', async () => {
    await expect(
      AuthService.login('nonexistent@reserveflow.local', 'AnyPass123!')
    ).rejects.toThrow(AuthenticationError);
  });

  it('rejects malformed or expired JWT tokens', () => {
    expect(() => AuthService.verifyToken('invalid.jwt.token')).toThrow(AuthenticationError);
  });
});
