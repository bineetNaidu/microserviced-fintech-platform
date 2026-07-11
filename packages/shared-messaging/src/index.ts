/**
 * @fintech/shared-messaging
 * RabbitMQ AMQP Infrastructure Layer for all microservices.
 *
 * QUICK START:
 * ```typescript
 * import {
 *   createMessagingConnection,
 *   createPublisher,
 *   createConsumer,
 *   TOPOLOGY,
 * } from '@fintech/shared-messaging';
 * import { createEnvelope } from '@fintech/shared-events';
 *
 * // 1. Establish connection (auto-reconnects on drop)
 * const connection = createMessagingConnection({ url: config.RABBITMQ_URL });
 *
 * // 2. Create publisher (for services that emit events)
 * const publisher = createPublisher(connection);
 * await publisher.publish('transfer.initiated', createEnvelope(...));
 *
 * // 3. Create consumer (for services that react to events)
 * const consumer = createConsumer(connection, {
 *   queueName: 'ledger-service.transfer.initiated',
 *   routingKey: 'transfer.initiated',
 * }, async (event) => { ... });
 *
 * // 4. Graceful shutdown
 * process.on('SIGTERM', async () => {
 *   await consumer.close();
 *   await publisher.close();
 *   await connection.close();
 * });
 * ```
 */

export { createMessagingConnection } from './connection';
export { createPublisher } from './publisher';
export { createConsumer } from './consumer';
export { TOPOLOGY, declareTopology } from './topology';
export type { MessagingConnectionOptions } from './connection';
export type { Publisher, PublishOptions } from './publisher';
export type { Consumer, ConsumerOptions, EventHandler } from './consumer';
