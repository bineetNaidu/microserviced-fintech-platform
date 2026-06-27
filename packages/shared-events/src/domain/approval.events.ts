import type { ULID, UUID, ApprovalActionType } from '@fintech/shared-types';
import type { EventEnvelope } from '../envelope';

export interface ApprovalApprovedEventData {
  requestId: ULID;
  correlationId: string;
  actionType: ApprovalActionType;
  targetResourceId: string;
  checkerId: UUID;
  payload: Record<string, unknown>;
}

export interface ApprovalRejectedEventData {
  requestId: ULID;
  correlationId: string;
  actionType: ApprovalActionType;
  targetResourceId: string;
  checkerId: UUID;
  justificationReason: string;
}

// Strictly typed structural envelopes
export type ApprovalApprovedEvent = EventEnvelope<ApprovalApprovedEventData>;
export type ApprovalRejectedEvent = EventEnvelope<ApprovalRejectedEventData>;
