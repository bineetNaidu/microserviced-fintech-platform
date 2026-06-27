import type { ULID } from './types';

export type JobStatus = 'IDLE' | 'RUNNING' | 'PAUSED';

/**
 * Relational schema blueprint tracking recurring distributed system tasks.
 * Driven via an optimistic concurrency lock model to prevent multi-instance overlaps.
 */
export interface ScheduledJob {
  /** 26-character time-sortable alphanumeric primary key identifier */
  id: ULID;

  /** System-unique name identifying the purpose of the cron hook (e.g., 'DAILY_EOD_RECONCILIATION') */
  name: string;

  /** Target asynchronous AMQP exchange name where the trigger tick event is broadcast */
  targetExchange: string;

  /** Structural queue message routing criteria bound to the target exchange */
  routingKey: string;

  /** Standard crontab notation string configuring execution boundaries */
  cronExpression: string;

  /** Optional payload variables passed downstream to parsing consumers */
  payload: Record<string, unknown> | null;

  /** Operational loop flag utilized by the background polling engine */
  status: JobStatus;

  /** Token tracking when the background cron loop last successfully initiated this task */
  lastRunAt: Date | null;

  /** Next structural clock target when this job must be picked up for execution */
  nextRunAt: Date;

  /** * Optimistic locking counter parameter.
   * Incremented on every change to protect exact-once state updates across replicas.
   */
  version: number;

  /** Chronological log marking last tracking modification */
  updatedAt: Date;
}
