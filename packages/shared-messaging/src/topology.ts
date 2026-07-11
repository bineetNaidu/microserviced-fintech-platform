import type { Channel } from 'amqplib';

/**
 * Platform-wide AMQP exchange and dead-letter queue naming constants.
 *
 * Centralizing these names prevents silent routing failures caused by typos.
 * Services should NEVER hardcode exchange or DLQ names directly.
 *
 * ─── EXCHANGE TOPOLOGY ───────────────────────────────────────────────────────
 *
 * fintech.events (topic exchange)
 * ├── Routing key pattern: {domain}.{past_tense_event}
 * │   Examples: 'transfer.initiated', 'account.frozen', 'kyc.approved'
 * ├── Services PUBLISH to this exchange with a specific routing key
 * └── Service queues BIND to this exchange with routing key patterns
 *     Example: 'notification-service.transfer.*' receives ALL transfer events
 *
 * fintech.dlx (direct exchange — dead letter exchange)
 * └── fintech.dead-letters (queue)
 *     Receives ALL messages that were:
 *       • Rejected (nack'd without requeue) by a consumer
 *       • Expired in a queue with a message TTL
 *       • Dropped from a full queue
 *
 *     Monitor this queue in production — a growing DLQ means consumers are
 *     consistently failing to process messages (schema mismatch, business logic bug, etc.)
 *
 * ─── HOW DEAD LETTERING WORKS ────────────────────────────────────────────────
 * When a consumer calls channel.nack(msg, false, false):
 *   • `false` (allUpTo) — only reject THIS message, not all unacked messages before it
 *   • `false` (requeue) — do NOT requeue: send to dead letter exchange instead
 *
 * The dead-letter exchange is declared on the SERVICE QUEUE at assertion time
 * via { deadLetterExchange: TOPOLOGY.DLX_EXCHANGE }. Without this property,
 * nack'd messages are silently dropped (gone forever, no trace).
 *
 * DLQ messages retain the original message content, routing key, and headers
 * so engineers can inspect, fix the bug, and re-publish them.
 */
export const TOPOLOGY = {
  /** Main topic exchange — all domain events are published here */
  EVENTS_EXCHANGE: 'fintech.events',

  /** Dead-letter exchange — destination for nack'd/expired/rejected messages */
  DLX_EXCHANGE: 'fintech.dlx',

  /** Dead-letter queue — all dead-lettered messages accumulate here for inspection */
  DEAD_LETTERS_QUEUE: 'fintech.dead-letters',
} as const;

/**
 * Declares all platform-level exchanges and the dead-letter queue.
 *
 * This function is called automatically in the channel setup of both createPublisher()
 * and createConsumer(). You do NOT need to call it manually in service code.
 *
 * It is idempotent — calling it multiple times with the same arguments is safe.
 * RabbitMQ verifies existing exchanges/queues match the declared configuration
 * and throws only if there is a property mismatch (e.g., durable: false vs true).
 *
 * @param channel - The AMQP channel to declare topology on
 */
export async function declareTopology(channel: Channel): Promise<void> {
  // Main topic exchange — durable: true means it survives RabbitMQ restarts
  await channel.assertExchange(TOPOLOGY.EVENTS_EXCHANGE, 'topic', {
    durable: true,
  });

  // Dead-letter exchange — direct type because we route ALL DLQ messages to one queue
  await channel.assertExchange(TOPOLOGY.DLX_EXCHANGE, 'direct', {
    durable: true,
  });

  // Dead-letter queue — messages pile up here when consumers reject them
  // Monitor this queue's depth in Grafana: a spike = consumer bug or schema mismatch
  await channel.assertQueue(TOPOLOGY.DEAD_LETTERS_QUEUE, {
    durable: true,
  });

  // Bind the DLQ to the DLX with '#' routing key — matches everything
  // '#' in a direct exchange means "all messages to this exchange go to this queue"
  await channel.bindQueue(TOPOLOGY.DEAD_LETTERS_QUEUE, TOPOLOGY.DLX_EXCHANGE, '#');
}
