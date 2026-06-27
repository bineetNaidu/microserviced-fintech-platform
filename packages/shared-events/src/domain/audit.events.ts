import type { UUID } from '@fintech/shared-types';
import type { EventEnvelope } from '../envelope';

export interface AuditLogEmittedEventData {
  action: string;
  actorId: UUID | 'SYSTEM';
  actorType: 'USER' | 'ADMIN' | 'SYSTEM';
  resourceTarget: string;
  status: 'SUCCESS' | 'FAILURE';
  metadataPayload: Record<string, unknown>;
}

export type AuditLogEmittedEvent = EventEnvelope<AuditLogEmittedEventData>;
