import type { AmqpConnectionManager } from 'amqp-connection-manager';
import { createConsumer, type Consumer } from '@fintech/shared-messaging';
import type { UserRepository } from '../../repositories/user.repository';
import type { InboxRepository } from '../../repositories/inbox.repository';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../db/schema';
import type { UserRegisteredEvent } from '@fintech/shared-events';

/**
 * Consumer that listens to 'user.registered' events and provisions default profiles.
 */
export function createUserRegisteredConsumer(
  connection: AmqpConnectionManager,
  db: NodePgDatabase<typeof schema>,
  userRepo: UserRepository,
  inboxRepo: InboxRepository,
): Consumer {
  return createConsumer<UserRegisteredEvent['data']>(
    connection,
    {
      // NAMING CONVENTION: '{service-name}.{routing-key}'
      queueName: 'user-service.profile',
      routingKey: 'user.registered',
      prefetch: 1,
    },
    async (event) => {
      const { userId, email } = event.data;

      process.stdout.write(
        JSON.stringify({
          level: 'info',
          msg: 'USER_REGISTERED_EVENT_RECEIVED',
          userId,
          email,
          eventId: event.id,
          correlationId: event.correlationId,
          timestamp: new Date().toISOString(),
        }) + '\n',
      );

      // Execute within a database transaction context to coordinate idempotency and insertion
      await db.transaction(async (tx) => {
        // Idempotency check via inboxMessages
        const isNewMessage = await inboxRepo.insertMessage(event.id, event.type, tx);
        if (!isNewMessage) {
          process.stdout.write(
            JSON.stringify({
              level: 'info',
              msg: 'USER_REGISTERED_EVENT_DUPLICATE_SKIPPED',
              userId,
              eventId: event.id,
              correlationId: event.correlationId,
              timestamp: new Date().toISOString(),
            }) + '\n',
          );
          return; // Acknowledges message cleanly
        }

        // Verify if a profile already exists (resilience)
        const profile = await userRepo.findById(userId, tx);
        if (profile) {
          process.stdout.write(
            JSON.stringify({
              level: 'info',
              msg: 'USER_PROFILE_ALREADY_EXISTS',
              userId,
              correlationId: event.correlationId,
              timestamp: new Date().toISOString(),
            }) + '\n',
          );
          return;
        }

        // Provision profile + default preferences
        await userRepo.createProfile({ id: userId, email }, tx);

        process.stdout.write(
          JSON.stringify({
            level: 'info',
            msg: 'USER_PROFILE_PROVISIONED',
            userId,
            correlationId: event.correlationId,
            timestamp: new Date().toISOString(),
          }) + '\n',
        );
      });
    },
  );
}
