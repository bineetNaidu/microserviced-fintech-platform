import { SignJWT, jwtVerify, importPKCS8, importSPKI } from 'jose';
import type { KeyLike } from 'jose';
import type { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import type { UserRole } from '@fintech/shared-types';
import type { JwtPayload } from '../types/auth.types';

/**
 * TokenService handles all JWT operations for the Auth Service.
 *
 * ─── RS256 ASYMMETRIC SIGNING (ADR-005) ────────────────────────────────────────
 * This service switched from HS256 (symmetric shared secret) to RS256 (asymmetric).
 *
 * WHY RS256?
 * With HS256, every service that verifies tokens needs the SAME secret.
 * If any one of your 13 microservices is compromised, the attacker gets the
 * signing secret and can forge tokens for any user as any role. Catastrophic.
 *
 * With RS256:
 *   - Auth Service holds the RSA PRIVATE KEY → only it can SIGN tokens
 *   - All other services hold the RSA PUBLIC KEY → they can only VERIFY
 *   - A compromised downstream service cannot forge new tokens
 *
 * HOW IT WORKS (simplified):
 *   Sign:   data + private_key   → signature (only auth service can do this)
 *   Verify: data + signature + public_key → valid/invalid (anyone can do this)
 *
 * ─── KEY IMPORT (importPKCS8 / importSPKI) ─────────────────────────────────────
 * `jose` requires keys to be imported into a `KeyLike` object before use.
 * This import is async and done ONCE at class construction time, not per request.
 * This is important — RSA key parsing is non-trivial; paying the cost once at
 * startup is much better than doing it for every single token operation.
 *
 * importPKCS8(pem, algorithm) → CryptoKey for signing (private key)
 * importSPKI(pem, algorithm)  → CryptoKey for verification (public key)
 *
 * ─── REDIS BLOCKLIST ───────────────────────────────────────────────────────────
 * The Redis blocklist exists because JWTs are stateless — once issued, a valid
 * token cannot be invalidated before its natural 15-minute expiry without a
 * server-side record. We record revoked JTIs in Redis with a TTL matching the
 * token's remaining lifetime. The API Gateway checks this on every request.
 * (See ADR-007 for full rationale.)
 */
export class TokenService {
  /**
   * The RSA private key, loaded once at startup.
   * Used exclusively for signing new access tokens.
   * NEVER shared outside the auth service.
   */
  private privateKey!: KeyLike;

  /**
   * The RSA public key, loaded once at startup.
   * Used by this service to verify tokens during internal flows
   * (e.g., extracting JTI claims for blocklisting on logout).
   */
  private publicKey!: KeyLike;

  /** Redis key prefix for the JWT blocklist namespace */
  private readonly redisPrefix = 'jti:blocklist:';

  /**
   * The ioredis client, exposed publicly so event consumers (e.g., suspension.consumer.ts)
   * can write custom keys (e.g., `suspended:{userId}`) without needing a separate Redis injection.
   * All keys written externally should use well-defined namespaces to avoid collisions.
   */
  readonly redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Loads and caches the RSA key pair from config into jose KeyLike objects.
   *
   * MUST be called once during service bootstrap BEFORE any token operations.
   * Calling generateAccessToken or verifyAccessToken before initialize() will
   * throw because privateKey/publicKey will be undefined.
   *
   * This is an async factory step — jose's key import is async (WebCrypto API).
   */
  async initialize(): Promise<void> {
    // importPKCS8 parses a PKCS#8 PEM-encoded private key for use with `jose`.
    // 'RS256' here tells jose which algorithm this key will be used with.
    this.privateKey = await importPKCS8(config.JWT_PRIVATE_KEY, 'RS256');

    // importSPKI parses a SubjectPublicKeyInfo PEM-encoded public key.
    this.publicKey = await importSPKI(config.JWT_PUBLIC_KEY, 'RS256');
  }

  /**
   * Generates a short-lived (15 minutes) access token JWT signed with RS256.
   *
   * ─── TOKEN CLAIMS ──────────────────────────────────────────────────────────
   * sub         → The user's UUID (standard "subject" claim)
   * email       → User email address (for display in clients)
   * role        → UserRole — used by the API Gateway for RBAC decisions
   * sessionId   → Links this access token to a specific refresh session
   * permissions → Fine-grained action list (for maker/checker flows)
   * jti         → Unique JWT ID — stored in the Redis blocklist on logout (ADR-007)
   * iat / exp   → Issued-at and expiration timestamps (verified by jose automatically)
   *
   * The token is signed with the RSA PRIVATE KEY. Any service holding the
   * public key (gateway, user-service, etc.) can verify it independently
   * without network round-trips to the auth service.
   */
  async generateAccessToken(
    userId: string,
    email: string,
    role: UserRole,
    sessionId: string,
  ): Promise<{ token: string; jti: string }> {
    // Generate a unique token ID for this specific token issuance.
    // This is what gets pushed to the Redis blocklist on logout.
    const jti = uuidv4();
    const permissions = this.getPermissionsForRole(role);

    const token = await new SignJWT({
      email,
      role,
      sessionId,
      permissions,
    })
      .setProtectedHeader({ alg: 'RS256' }) // RS256 = RSA signature with SHA-256 hash
      .setSubject(userId)
      .setJti(jti)
      .setIssuedAt()
      .setExpirationTime('15m') // Short-lived: 15 minutes limits blast radius if stolen
      .sign(this.privateKey); // Signed with the RSA private key

    return { token, jti };
  }

  /**
   * Maps a UserRole to its corresponding fine-grained permission set.
   *
   * ─── WHY EMBED PERMISSIONS IN THE TOKEN? ───────────────────────────────────
   * Embedding permissions in the token means downstream services can perform
   * authorization checks without a database query or network call to the auth service.
   * This keeps services stateless and fast.
   *
   * ─── PERMISSION MATRIX ─────────────────────────────────────────────────────
   * CUSTOMER   → Standard end-user: own accounts + transfers only
   * MAKER      → Admin who initiates high-value operations (needs CHECKER approval)
   * CHECKER    → Admin who approves/rejects MAKER operations (4-eyes principle)
   * OPERATIONS → Full admin: account management + system config
   * AUDITOR    → Read-only: full visibility but zero mutation capabilities
   *
   * This must stay in sync with the RBAC matrix documented in the handbook.
   */
  private getPermissionsForRole(role: UserRole): string[] {
    const matrix: Record<UserRole, string[]> = {
      CUSTOMER: ['VIEW_OWN_ACCOUNTS', 'INITIATE_TRANSFER', 'VIEW_OWN_TRANSFERS'],
      MAKER: ['VIEW_OWN_ACCOUNTS', 'INITIATE_TRANSFER', 'VIEW_OWN_TRANSFERS', 'VIEW_ANY_ACCOUNT'],
      CHECKER: [
        'VIEW_OWN_ACCOUNTS',
        'VIEW_ANY_ACCOUNT',
        'APPROVE_LARGE_TRANSFERS',
        'REJECT_LARGE_TRANSFERS',
        'VIEW_ALL_TRANSFERS',
      ],
      OPERATIONS: [
        'VIEW_OWN_ACCOUNTS',
        'VIEW_ANY_ACCOUNT',
        'FREEZE_ACCOUNT',
        'UNFREEZE_ACCOUNT',
        'CREDIT_ACCOUNT',
        'MANAGE_USER_ROLES',
        'VIEW_SYSTEM_HEALTH_METRICS',
        'VIEW_REPORTING_DASHBOARDS',
      ],
      AUDITOR: [
        'VIEW_OWN_ACCOUNTS',
        'VIEW_ANY_ACCOUNT',
        'VIEW_ALL_TRANSFERS',
        'VIEW_ALL_AUDIT_LOGS',
        'VIEW_REPORTING_DASHBOARDS',
      ],
    };
    return matrix[role] ?? [];
  }

  /**
   * Verifies a JWT access token signature and returns its decoded payload.
   *
   * Uses the RSA PUBLIC KEY — no private key needed for verification.
   * jose automatically validates: signature, expiry (exp), not-before (nbf), and algorithm.
   *
   * Used internally by the auth service during logout flows to extract the JTI
   * from the access token before blocklisting it in Redis.
   */
  async verifyAccessToken(token: string): Promise<JwtPayload> {
    const { payload } = await jwtVerify(token, this.publicKey, {
      algorithms: ['RS256'], // Explicitly whitelist RS256 — rejects 'none', HS256, etc.
    });

    return {
      sub: payload.sub!,
      email: payload.email as string,
      role: payload.role as UserRole,
      sessionId: payload.sessionId as string,
      jti: payload.jti!,
      iat: payload.iat!,
      exp: payload.exp!,
      permissions: (payload.permissions as string[]) ?? [],
    };
  }

  /**
   * Writes a JTI (JWT ID) to the Redis blocklist with a TTL matching the token's remaining life.
   *
   * ─── HOW IMMEDIATE REVOCATION WORKS (ADR-007) ──────────────────────────────
   * Problem: JWTs are stateless. Once issued, a 15-minute token is valid for
   * 15 minutes — even after the user logs out. There's no built-in revocation mechanism.
   *
   * Solution: On logout, we:
   *   1. Record the token's unique `jti` in Redis with TTL = remaining token lifetime
   *   2. The API Gateway checks this Redis key on EVERY authenticated request
   *   3. If found → 401 Unauthorized, even if the token signature is valid
   *
   * The TTL ensures the Redis key automatically disappears when the token would have
   * expired anyway — the blocklist never grows unboundedly.
   *
   * @param jti - The unique JWT ID to block (from the `jti` claim)
   * @param expiresAtEpochSeconds - Token expiry timestamp (the `exp` claim value)
   */
  async blocklistToken(jti: string, expiresAtEpochSeconds: number): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const ttlSeconds = expiresAtEpochSeconds - now;

    // Only write to Redis if the token hasn't naturally expired yet.
    // A token that's already expired doesn't need to be blocklisted —
    // the gateway will reject it due to the `exp` claim check.
    if (ttlSeconds > 0) {
      await this.redis.set(`${this.redisPrefix}${jti}`, 'revoked', 'EX', ttlSeconds);
    }
  }

  /**
   * Checks if a JTI is currently in the Redis blocklist.
   * Returns true if the token has been explicitly revoked via logout.
   * The API Gateway calls this on every authenticated request.
   */
  async isTokenBlocklisted(jti: string): Promise<boolean> {
    const result = await this.redis.get(`${this.redisPrefix}${jti}`);
    return result !== null;
  }
}

export { uuidv4 as generateJti };
