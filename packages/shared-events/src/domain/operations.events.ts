import type { UUID } from '@fintech/shared-types';
import type { EventEnvelope } from '../envelope';

export interface SystemConfigUpdatedEventData {
  configKey: string;
  oldValue: string;
  newValue: string;
  updatedBy: UUID;
}

export interface ScheduledJobExecutedEventData {
  jobId: string;
  jobName: string;
  executionStatus: 'SUCCESS' | 'FAILED';
  durationMs: number;
  failureReason?: string;
}

export type SystemConfigUpdatedEvent = EventEnvelope<SystemConfigUpdatedEventData>;
export type ScheduledJobExecutedEvent = EventEnvelope<ScheduledJobExecutedEventData>;
