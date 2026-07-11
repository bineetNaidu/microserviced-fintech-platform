import 'dotenv/config';
import { createPool, drainPool } from '@fintech/shared-db';
import { drizzle } from 'drizzle-orm/node-postgres';
import Redis from 'ioredis';
import {
  createMessagingConnection,
  createPublisher,
  type Consumer,
} from '@fintech/shared-messaging';
import { config } from './config';
import * as schema from './db/schema';
import { UserRepository } from './repositories/user.repository';
import { SessionRepository } from './repositories/session.repository';
import { TokenRepository } from './repositories/token.repository';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';
import { SessionService } from './services/session.service';
import { AuthService } from './services/auth.service';
import { AuthPublisher } from './events/publishers/auth.publisher';
import { AuthController } from './controllers/auth.controller';
import { createSuspensionConsumer } from './events/consumers/suspension.consumer';
import { createApp } from './app';

/**
 * Entry point bootstrapping the Auth Service.
 * Coordinates initialization of PostgreSQL, Redis, RabbitMQ, and starts the HTTP server.
 */
async function bootstrap() {
  const loggerPrefix = `[${config.SERVICE_NAME}]`;
  console.log(`${loggerPrefix} Starting service bootstrap...`);

  // ─── 1. DATABASE SETUP (PostgreSQL via Drizzle) ──────────────────────────
  const pool = createPool(config.DATABASE_URL, {
    application_name: config.SERVICE_NAME,
  });

  const db = drizzle(pool, { schema });
  console.log(`${loggerPrefix} PostgreSQL connection pool initialized.`);

  // ─── 2. CACHE SETUP (Redis) ──────────────────────────────────────────────
  const redis = new Redis(config.REDIS_URL);
  redis.on('connect', () => console.log(`${loggerPrefix} Connected to Redis.`));
  redis.on('error', (err) => console.error(`${loggerPrefix} Redis error:`, err));

  // ─── 3. MESSAGING SETUP (RabbitMQ) ───────────────────────────────────────
  const amqpConnection = createMessagingConnection({ url: config.RABBITMQ_URL });
  amqpConnection.on('connect', () => console.log(`${loggerPrefix} Connected to RabbitMQ.`));
  amqpConnection.on('disconnect', (err) =>
    console.error(`${loggerPrefix} RabbitMQ disconnect:`, err),
  );

  const amqpPublisher = createPublisher(amqpConnection);
  console.log(`${loggerPrefix} RabbitMQ event publisher channel wrapper created.`);

  // ─── 4. REPOSITORIES & SERVICES DEPLOYMENT ───────────────────────────────
  const userRepo = new UserRepository(db);
  const sessionRepo = new SessionRepository(db);
  const tokenRepo = new TokenRepository(db);

  const authPublisher = new AuthPublisher(amqpPublisher);
  const passwordService = new PasswordService();
  const tokenService = new TokenService(redis);

  // ─── 4a. ASYNC KEY INITIALIZATION (RS256) ─────────────────────────────────
  // TokenService must import the RSA private/public keys from PEM strings into
  // jose KeyLike objects before it can sign or verify any tokens.
  // This is an async operation (WebCrypto API) done ONCE at startup — not per request.
  // See token.service.ts → TokenService.initialize() for full rationale.
  await tokenService.initialize();
  console.log(`${loggerPrefix} RS256 key pair loaded into TokenService.`);

  const sessionService = new SessionService(sessionRepo, userRepo, tokenService);

  const authService = new AuthService(
    userRepo,
    tokenRepo,
    sessionService,
    tokenService,
    passwordService,
    authPublisher,
  );

  const controller = new AuthController(authService, sessionService);

  // ─── 5. EVENT CONSUMERS ───────────────────────────────────────────────────
  // The suspension consumer listens for `operations.user_suspended` events from
  // the Operations Service. When received, it suspends the user in the DB,
  // revokes their sessions, and writes a Redis blocklist key for fast-path rejection.
  // See: src/events/consumers/suspension.consumer.ts for full rationale.
  const suspensionConsumer: Consumer = createSuspensionConsumer(
    amqpConnection,
    userRepo,
    sessionRepo,
    tokenService,
  );
  console.log(
    `${loggerPrefix} Suspension consumer registered on 'auth-service.operations.user_suspended'.`,
  );

  // ─── 6. HTTP SERVER ──────────────────────────────────────────────────────
  const app = createApp(controller, pool, redis);
  const server = app.listen(config.PORT, () => {
    console.log(
      `${loggerPrefix} HTTP server listening on port ${config.PORT} [env: ${config.NODE_ENV}]`,
    );
  });

  // ─── 6. GRACEFUL SHUTDOWN HANDLERS ───────────────────────────────────────

  let isShuttingDown = false;

  const handleShutdown = async (signal: string) => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    console.warn(`\n${loggerPrefix} Received ${signal}. Starting graceful shutdown...`);

    // Set a force-exit timeout to prevent hanging process during shutdown
    const forceExitTimeout = setTimeout(() => {
      console.error(`${loggerPrefix} Graceful shutdown timed out. Forcing process exit.`);
      process.exit(1);
    }, 10_000);

    // Stop accepting new HTTP requests
    server.close(() => {
      console.log(`${loggerPrefix} HTTP server closed. No longer accepting new connections.`);
    });

    try {
      // Close the suspension consumer channel FIRST — lets in-flight messages finish acking
      // before the underlying connection is torn down. If we close the connection first,
      // the consumer's in-flight nack/ack calls would throw on a closed channel.
      await suspensionConsumer.close();
      console.log(`${loggerPrefix} Suspension consumer channel closed.`);

      // Close RabbitMQ channels and connection
      await amqpPublisher.close();
      console.log(`${loggerPrefix} RabbitMQ publisher channel closed.`);
      await amqpConnection.close();
      console.log(`${loggerPrefix} RabbitMQ connection closed.`);

      // Disconnect Redis
      await redis.quit();
      console.log(`${loggerPrefix} Redis connection closed.`);

      // Drain PostgreSQL Pool
      await drainPool(pool);
      console.log(`${loggerPrefix} PostgreSQL pool drained.`);

      clearTimeout(forceExitTimeout);
      console.log(`${loggerPrefix} Graceful shutdown completed cleanly. Exiting.`);
      process.exit(0);
    } catch (shutdownError) {
      console.error(`${loggerPrefix} Error during graceful shutdown:`, shutdownError);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
