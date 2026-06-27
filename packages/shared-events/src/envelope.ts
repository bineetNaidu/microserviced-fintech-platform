import type { ULID, UUID } from '@fintech/shared-types';

/**
 * Global Generic Event Envelope.
 * Every microservice publishing message payloads onto the AMQP exchange
 * must wrap their domain data inside this common tracking envelope.
 */
export interface EventEnvelope<T = unknown> {
  /** Unique 26-character time-sortable alphanumeric identification string for this specific event instance */
  id: ULID;

  /** Strictly typed system event topic string identifier using dot-notation (e.g., 'transfer.initiated') */
  type: string;

  /** Distributed correlation identifier tracking string pulled directly from OpenTelemetry headers */
  correlationId: UUID;

  /** Chronological marker specifying exactly when the event instance was assembled */
  timestamp: Date;

  /** Microservice identifier name tracking which system container produced the event */
  producer: string;

  /** The target structural domain event record payload matching the specific event type criteria */
  data: T;
}
