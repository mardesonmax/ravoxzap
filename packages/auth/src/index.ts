import bcrypt from 'bcryptjs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function createApiKey(): string {
  return `ravox_live_${randomBytes(24).toString('base64url')}`;
}

export function hashApiKey(token: string, secret: string): string {
  return createHash('sha256').update(`${secret}:${token}`).digest('hex');
}

export function getApiKeyPreview(token: string) {
  return {
    prefix: token.slice(0, 11),
    lastFour: token.slice(-4),
  };
}

export function safeCompare(value: string, expected: string): boolean {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);

  return valueBuffer.length === expectedBuffer.length && timingSafeEqual(valueBuffer, expectedBuffer);
}
