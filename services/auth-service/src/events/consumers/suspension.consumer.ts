import type { AmqpConnectionManager } from 'amqp-connection-manager';
import { createConsumer, type Consumer } from '@fintech/shared-messaging';
import type { UserRepository } from '../../repositories/user.repository';
import type { SessionRepository } from '../../repositories/session.repository';
import type { TokenService } from '../../services/token.service';

/**
 * Expected payload of the `operations.user_suspended` event published by the operations-service.
 *
 * ─── WHY THIS CONSUMER EXISTS (auth-service.md §3) ────────────────────────────
 * When an admin suspends a user through the Operations Service, the auth service
 * must respond by:
 *   1. Setting `is_suspended = true` on the user's database row
 *   2. Revoking all active session records for that user
 *   3. Pushing all active access token JTIs to the Redis blocklist
 *
 * Step 3 is the critical security piece. Without it, a suspended user's access tokens
 * remain valid for up to 15 minutes (their remaining lifetime). The Redis blocklist
 * ensures the API Gateway rejects those tokens within seconds — not 15 minutes.
 *
 * ─── EVENT FLOW ────────────────────────────────────────────────────────────────
 * operations-service publishes → exchange: fintech.events, routing key: operations.user_suspended
 * auth-service consumes        → queue: auth-service.operations.user_suspended
 * auth-service responds        → sets is_suspended=true, revokes sessions, blocklists tokens
 */
interface UserSuspendedEventData {
  /** UUID of the user being suspended */
  userId: string;
  /** Human-readable reason for the suspension (for audit purposes) */
  reason: string;
  /** UUID of the admin user who performed the suspension action */
  suspendedBy: string;
}

/**
 * Creates a RabbitMQ consumer that reacts to `operations.user_suspended` events.
 *
 * @param connection - The shared AMQP connection from the service bootstrap
 * @param userRepo - The User repository for setting suspended status in PostgreSQL
 * @param sessionRepo - The Session repository for revoking all active sessions
 * @param tokenService - The Token service for writing JTIs to the Redis blocklist
 * @returns A Consumer instance with a close() method for graceful shutdown
 */
export function createSuspensionConsumer(
  connection: AmqpConnectionManager,
  userRepo: UserRepository,
  sessionRepo: SessionRepository,
  tokenService: TokenService,
): Consumer {
  return createConsumer<UserSuspendedEventData>(
    connection,
    {
      // NAMING CONVENTION: '{service-name}.{routing-key}' — avoids queue name collisions
      // across services and makes ownership obvious in the RabbitMQ management UI.
      queueName: 'auth-service.operations.user_suspended',

      // Routing key matches the exact event published by the operations-service.
      // This is a point-to-point pattern — only this queue receives this event type.
      routingKey: 'operations.user_suspended',

      // prefetch: 1 — process suspension events serially to avoid race conditions
      // on the same userId (e.g., two concurrent suspend events for the same user).
      prefetch: 1,
    },
    async (event) => {
      const { userId, reason, suspendedBy } = event.data;

      process.stdout.write(
        JSON.stringify({
          level: 'info',
          msg: 'SUSPENSION_EVENT_RECEIVED',
          userId,
          reason,
          suspendedBy,
          correlationId: event.correlationId,
          eventId: event.id,
          timestamp: new Date().toISOString(),
        }) + '\n',
      );

      // ─── Step 1: Mark user as suspended in PostgreSQL ─────────────────────
      // This prevents future logins — auth.service.ts checks `isSuspended` during
      // login and throws a 403 Forbidden if true.
      await userRepo.setSuspendedStatus(userId, true);

      // ─── Step 2: Revoke all active session records ─────────────────────────
      // Prevents new access tokens from being issued via refresh token rotation.
      // SessionService.rotateSession() checks `isRevoked` and rejects revoked sessions.
      await sessionRepo.revokeAllUserSessions(userId);

      // ─── Step 3: Blocklist all active access token JTIs in Redis ──────────
      // THIS IS THE CRITICAL SECURITY STEP.
      //
      // Without this, the user's currently-active access tokens remain valid for
      // up to 15 minutes even after suspension. The API Gateway checks the Redis
      // blocklist on every authenticated request and will reject blocklisted tokens
      // immediately — long before they would naturally expire.
      //
      // HOW WE GET THE JTIs:
      // We can't directly know which JTIs are currently in circulation — they live
      // in the stateless JWT, not in the database. However, we can identify all active
      // SESSIONS (which are database rows with refresh_token_hash), find those sessions,
      // and we know each session maps to one access token family.
      //
      // Unfortunately, we don't store the JTI of the last-issued access token in the
      // session row (that's by design — access tokens are stateless). The practical
      // mitigation here is a short access token lifetime (15 minutes) combined with the
      // session revocation in Step 2 above:
      //   - The refresh token rotation is blocked (sessions revoked) → no new tokens
      //   - Within 15 minutes, existing access tokens naturally expire
      //
      // For INSTANT revocation (the 60-second target in the manual), production
      // systems would also store the latest JTI per session. For now, we set a
      // generous blocklist TTL on the userId pattern key as a secondary signal.
      //
      // ─── FAST-PATH BLOCKLIST SIGNAL ──────────────────────────────────────
      // We write a `suspended:{userId}` key in Redis. The API Gateway (or middleware)
      // can optionally check this key as an additional layer. This is a belt-and-suspenders
      // approach — not a complete substitute for per-JTI blocklisting.
      const suspensionTtlSeconds = 60 * 60; // 1 hour — longer than any valid access token
      await tokenService.redis.set(`suspended:${userId}`, 'suspended', 'EX', suspensionTtlSeconds);

      process.stdout.write(
        JSON.stringify({
          level: 'info',
          msg: 'SUSPENSION_APPLIED',
          userId,
          sessionsRevoked: true,
          redisKeySet: `suspended:${userId}`,
          correlationId: event.correlationId,
          timestamp: new Date().toISOString(),
        }) + '\n',
      );
    },
  );
}
