import type { UserRole } from '@fintech/shared-types';

/**
 * Clean domain object representation of a User.
 * Keeps internal DB hashes (like passwordHash) separated.
 */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  isEmailVerified: boolean;
  isSuspended: boolean;
  createdAt: Date;
}

/** Hashed refresh session details used internally inside authentication flows */
export interface Session {
  id: string;
  userId: string;
  refreshTokenHash: string;
  userAgent: string | null;
  ipAddress: string | null;
  isRevoked: boolean;
  expiresAt: Date;
  createdAt: Date;
  lastUsedAt: Date;
}

/** Token envelope returned on registration/reset queries */
export interface VerificationToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

/** JWT Payload structure mapping standard and custom claims */
export interface JwtPayload {
  sub: string; // user ID
  email: string;
  role: UserRole;
  sessionId: string;
  jti: string; // unique access token identity for Redis blocklist
  iat: number;
  exp: number;
  permissions: string[];
}

/** Credentials token pair returned upon successful login or rotation */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** User details returned in HTTP response */
export interface UserPayload {
  id: string;
  email: string;
  role: UserRole;
}

/** Login response data payload */
export interface LoginResponse {
  accessToken: string;
  user: UserPayload;
}
