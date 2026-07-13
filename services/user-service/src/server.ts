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
import { KycRepository } from './repositories/kyc.repository';
import { InboxRepository } from './repositories/inbox.repository';
import { UserService } from './services/user.service';
import { UserPublisher } from './events/publishers/user.publisher';
import { UserController } from './controllers/user.controller';
import { createUserRegisteredConsumer } from './events/consumers/user-registered.consumer';
import {
  createKycApprovedConsumer,
  createKycRejectedConsumer,
} from './events/consumers/kyc-ops.consumer';
import { createApp } from './app';

/**
 * Entry point bootstrapping the User Service.
 */
async function bootstrap() {
  const loggerPrefix = `[${config.SERVICE_NAME}]`;
  console.log(`${loggerPrefix} Starting service bootstrap...`);

  // ─── 1. DATABASE SETUP ─────────────────────────────────────────────────────
  const pool = createPool(config.DATABASE_URL, {
    application_name: config.SERVICE_NAME,
  });
  const db = drizzle(pool, { schema });
  console.log(`${loggerPrefix} PostgreSQL connection pool initialized.`);

  // ─── 2. CACHE SETUP ────────────────────────────────────────────────────────
  const redis = new Redis(config.REDIS_URL);
  redis.on('connect', () => console.log(`${loggerPrefix} Connected to Redis.`));
  redis.on('error', (err) => console.error(`${loggerPrefix} Redis error:`, err));

  // ─── 3. MESSAGING SETUP ─────────────────────────────────────────────────────
  const amqpConnection = createMessagingConnection({ url: config.RABBITMQ_URL });
  amqpConnection.on('connect', () => console.log(`${loggerPrefix} Connected to RabbitMQ.`));
  amqpConnection.on('disconnect', (err) =>
    console.error(`${loggerPrefix} RabbitMQ disconnect:`, err),
  );

  const amqpPublisher = createPublisher(amqpConnection);
  console.log(`${loggerPrefix} RabbitMQ event publisher channel wrapper created.`);

  // ─── 4. REPOSITORIES & SERVICES DEPLOYMENT ──────────────────────────────────
  const userRepo = new UserRepository(db);
  const kycRepo = new KycRepository(db);
  const inboxRepo = new InboxRepository(db);

  const userPublisher = new UserPublisher(amqpPublisher);
  const userService = new UserService(db, userRepo, kycRepo, userPublisher);
  const controller = new UserController(userService);

  // ─── 5. EVENT CONSUMERS ─────────────────────────────────────────────────────
  const userRegisteredConsumer = createUserRegisteredConsumer(
    amqpConnection,
    db,
    userRepo,
    inboxRepo,
  );
  console.log(`${loggerPrefix} Registered consumer for 'user.registered'.`);

  const kycApprovedConsumers = createKycApprovedConsumer(
    amqpConnection,
    db,
    userRepo,
    kycRepo,
    inboxRepo,
    userPublisher,
  );
  console.log(`${loggerPrefix} Registered consumers for 'kyc approved' events.`);

  const kycRejectedConsumers = createKycRejectedConsumer(
    amqpConnection,
    db,
    userRepo,
    kycRepo,
    inboxRepo,
    userPublisher,
  );
  console.log(`${loggerPrefix} Registered consumers for 'kyc rejected' events.`);

  const allConsumers: Consumer[] = [
    userRegisteredConsumer,
    ...kycApprovedConsumers,
    ...kycRejectedConsumers,
  ];

  // ─── 6. HTTP SERVER ────────────────────────────────────────────────────────
  const app = createApp(controller, pool, redis);
  const server = app.listen(config.PORT, () => {
    console.log(
      `${loggerPrefix} HTTP server listening on port ${config.PORT} [env: ${config.NODE_ENV}]`,
    );
  });

  // ─── 7. GRACEFUL SHUTDOWN HANDLERS ──────────────────────────────────────────
  let isShuttingDown = false;

  const handleShutdown = async (signal: string) => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;

    console.warn(`\n${loggerPrefix} Received ${signal}. Starting graceful shutdown...`);

    const forceExitTimeout = setTimeout(() => {
      console.error(`${loggerPrefix} Graceful shutdown timed out. Forcing process exit.`);
      process.exit(1);
    }, 10_000);

    server.close(() => {
      console.log(`${loggerPrefix} HTTP server closed. No longer accepting new connections.`);
    });

    try {
      // Close all consumer channels
      for (const consumer of allConsumers) {
        await consumer.close();
      }
      console.log(`${loggerPrefix} All consumer channels closed.`);

      // Close RabbitMQ connection and publisher
      await amqpPublisher.close();
      await amqpConnection.close();
      console.log(`${loggerPrefix} RabbitMQ connection and publisher closed.`);

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
