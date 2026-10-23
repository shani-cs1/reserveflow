import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { getDatabase } from '../db/index.ts';
import { users } from '../db/schema.ts';
import { config } from '../config.ts';
import { AuthenticationError } from '../utils/errors.ts';

export interface TokenPayload {
  userId: string;
  email: string;
  role: 'ADMIN' | 'OPERATOR';
  name: string;
}

export class AuthService {
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  static generateToken(payload: TokenPayload): string {
    return jwt.sign(payload, config.JWT_SECRET, {
      expiresIn: '24h',
    });
  }

  static verifyToken(token: string): TokenPayload {
    try {
      return jwt.verify(token, config.JWT_SECRET) as TokenPayload;
    } catch {
      throw new AuthenticationError('Invalid or expired authentication token');
    }
  }

  static async login(email: string, password: string): Promise<{ token: string; user: TokenPayload }> {
    const db = getDatabase();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.trim().toLowerCase()))
      .limit(1);

    if (!user) {
      throw new AuthenticationError('Invalid email or password');
    }

    const isValid = await this.verifyPassword(password, user.passwordHash);
    if (!isValid) {
      throw new AuthenticationError('Invalid email or password');
    }

    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    };

    const token = this.generateToken(payload);

    return { token, user: payload };
  }
}
