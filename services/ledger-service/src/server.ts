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
import { LedgerRepository } from './repositories/ledger.repository';
import { InboxRepository } from './repositories/inbox.repository';
import { LedgerService } from './services/ledger.service';
import { LedgerPublisher } from './events/publishers/ledger.publisher';
import { LedgerController } from './controllers/ledger.controller';
import { createSnapshotSweepConsumer } from './events/consumers/snapshot-sweep.consumer';
import { createApp } from './app';

/**
 * Entry point bootstrapping the Ledger Service.
 */
async function bootstrap() {
  const loggerPrefix = `[${config.SERVICE_NAME}]`;
  console.log(`${loggerPrefix} Starting service bootstrap...`);

  // ─── 1. DATABASE SETUP ─────────────────────────────────────────────────────
  // Connect to postgres using application_runtime_user credentials
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
  const ledgerRepo = new LedgerRepository(db);
  const inboxRepo = new InboxRepository(db);

  const ledgerPublisher = new LedgerPublisher(amqpPublisher);
  const ledgerService = new LedgerService(db, ledgerRepo, ledgerPublisher);
  const controller = new LedgerController(ledgerService);

  // ─── 5. EVENT CONSUMERS ─────────────────────────────────────────────────────
  const snapshotSweepConsumer = createSnapshotSweepConsumer(
    amqpConnection,
    db,
    ledgerService,
    inboxRepo,
  );
  console.log(`${loggerPrefix} Registered consumer for 'scheduler.trigger.snapshot_sweep'.`);

  const allConsumers: Consumer[] = [snapshotSweepConsumer];

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
