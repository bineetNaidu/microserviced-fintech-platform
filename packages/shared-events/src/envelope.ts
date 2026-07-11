import type { ULID, UUID } from '@fintech/shared-types';

/**
 * Global Generic Event Envelope — Schema Version 1.
 *
 * Every microservice publishing message payloads onto the AMQP exchange
 * MUST wrap their domain data inside this common tracking envelope.
 * Never publish raw domain objects directly to RabbitMQ.
 *
 * ─── CRITICAL: WHY timestamp IS A string (NOT Date) ───────────────────────────
 * When JavaScript objects are serialized to JSON (which RabbitMQ must do to store
 * messages), `Date` objects are silently converted to ISO 8601 strings:
 *   `new Date()` → `"2024-01-15T10:30:00.000Z"`
 *
 * On the consumer side, the JSON is deserialized back to a plain object. But
 * `JSON.parse()` does NOT convert ISO strings back to Date objects — they remain
 * strings. If `timestamp` were typed as `Date`, the TypeScript type would say
 * `Date` but the runtime value would be `string`. This is a silent type lie that
 * would crash any consumer that calls `.toISOString()` or `.getTime()` on it.
 *
 * Solution: Type it as `string` from the start. It's always a string at runtime.
 * Use `new Date(event.timestamp)` in consumers if you need a Date object.
 *
 * ─── WHY version FIELD ────────────────────────────────────────────────────────
 * As the platform evolves, event schemas WILL change. The `version` field allows
 * consumers to handle breaking changes gracefully without a full lock-step deploy:
 *
 *   if (event.version === 1) { /* handle old shape *\/ }
 *   if (event.version === 2) { /* handle new shape *\/ }
 *
 * Start at 1. Increment when making BREAKING changes to the event data shape.
 * Never delete version 1 consumer handlers until all producers have migrated.
 * Adding new optional fields to `data` is non-breaking — no version bump needed.
 */
export interface EventEnvelope<T = unknown> {
  /** Unique 26-character time-sortable ULID for this specific event instance */
  id: ULID;

  /**
   * Dot-notation event type identifier (e.g., 'transfer.initiated', 'account.frozen').
   * Used by RabbitMQ topic exchange routing keys and by consumers to dispatch handlers.
   * Convention: '{domain}.{past_tense_verb}'
   */
  type: string;

  /** Distributed correlation identifier propagated from OpenTelemetry request headers */
  correlationId: UUID;

  /**
   * ISO 8601 UTC timestamp string — when this event was created.
   * Typed as `string`, NOT `Date` — see class-level comment above for full explanation.
   * Parse with `new Date(event.timestamp)` if you need arithmetic or comparison.
   */
  timestamp: string;

  /**
   * Schema version number for forward compatibility.
   * Currently: 1. Bump when making breaking changes to the `data` field shape.
   */
  version: number;

  /**
   * Identifier of the microservice that produced this event.
   * Should match the SERVICE_NAME environment variable of the producing service.
   * Example values: 'transfer-service', 'auth-service', 'ledger-service'
   */
  producer: string;

  /** The typed domain event payload specific to this event type */
  data: T;
}
