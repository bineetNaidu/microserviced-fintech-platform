import 'dotenv/config';
import Redis from 'ioredis';
import { config } from './config';
import { createApp } from './app';
import { ApiRoutes } from '@fintech/shared-config';

/**
 * API Gateway Bootstrap.
 *
 * ─── WHAT THE GATEWAY NEEDS (MINIMAL DEPENDENCIES) ───────────────────────────
 * Unlike microservices (PostgreSQL + Redis + RabbitMQ + Drizzle), the gateway is
 * deliberately simple — it has NO database, NO message broker, NO domain logic.
 *
 * It only needs:
 *   1. Redis — for JWT blocklist checks and rate limiting counters
 *
 * That's it. This is by design. The gateway is a thin, fast, stateless proxy.
 * Adding a DB to the gateway would violate the separation of concerns and make it
 * a bottleneck — every single API request would need to hit a DB just to route.
 *
 * ─── GRACEFUL SHUTDOWN ────────────────────────────────────────────────────────
 * On SIGTERM (sent by Kubernetes before killing the pod), we:
 *   1. Stop accepting new HTTP connections (server.close())
 *   2. Close the Redis connection cleanly (redis.quit())
 *   3. Exit 0 — clean exit signals to Kubernetes that shutdown was successful
 *
 * The 10-second force-exit timeout ensures we don't hang indefinitely if a
 * connection takes too long to drain (e.g., a long-polling connection).
 */
async function bootstrap() {
  const loggerPrefix = `[${config.SERVICE_NAME}]`;
  console.log(`${loggerPrefix} Starting gateway bootstrap...`);

  // ─── Redis (for blocklist + rate limiter) ─────────────────────────────────
  const redis = new Redis(config.REDIS_URL);
  redis.on('connect', () => console.log(`${loggerPrefix} Connected to Redis.`));
  redis.on('error', (err) => console.error(`${loggerPrefix} Redis error:`, err));

  // ─── Express Application ─────────────────────────────────────────────────
  const app = createApp(redis);
  const server = app.listen(config.PORT, () => {
    console.log(
      `${loggerPrefix} Gateway HTTP server listening on port ${config.PORT} [env: ${config.NODE_ENV}]`,
    );
    console.log(
      `${loggerPrefix} Proxying:`,
      JSON.stringify(
        {
          [ApiRoutes.ApiPrefixes.Auth]: config.AUTH_SERVICE_URL,
          [ApiRoutes.ApiPrefixes.Users]: config.USER_SERVICE_URL,
          [ApiRoutes.ApiPrefixes.Accounts]: config.ACCOUNT_SERVICE_URL,
          [ApiRoutes.ApiPrefixes.Transfers]: config.TRANSFER_SERVICE_URL,
        },
        null,
        2,
      ),
    );
  });

  // ─── Graceful Shutdown ────────────────────────────────────────────────────
  let isShuttingDown = false;

  const handleShutdown = async (signal: string) => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    console.warn(`\n${loggerPrefix} Received ${signal}. Starting graceful shutdown...`);

    // Force exit if graceful shutdown takes more than 10 seconds
    const forceExitTimeout = setTimeout(() => {
      console.error(`${loggerPrefix} Graceful shutdown timed out. Forcing process exit.`);
      process.exit(1);
    }, 10_000);

    // Stop accepting new connections
    server.close(() => {
      console.log(`${loggerPrefix} HTTP server closed.`);
    });

    try {
      // Close Redis connection — pending commands will complete before disconnecting
      await redis.quit();
      console.log(`${loggerPrefix} Redis connection closed.`);

      clearTimeout(forceExitTimeout);
      console.log(`${loggerPrefix} Graceful shutdown completed. Exiting.`);
      process.exit(0);
    } catch (err) {
      console.error(`${loggerPrefix} Error during graceful shutdown:`, err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Fatal error during gateway bootstrap:', err);
  process.exit(1);
});
