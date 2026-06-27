import { ApprovalActionType, ApprovalStatus } from '../domain/approval';
import type { ULID, UUID } from '../domain/types';

/**
 * Data Transfer Object utilized when an administrative service initiates a high-risk request.
 * This object is passed to the Approval Service to capture the action in a PENDING state.
 */
export interface CreateApprovalRequestDto {
  /** Distributed correlation identifier tracking the administrative action across cluster limits */
  correlationId: string;

  /** The administrative User ID who initiated the operation (The Maker) */
  makerId: UUID;

  /** Identifies the restricted domain mutation category being requested */
  actionType: ApprovalActionType;

  /** Reference key mapping the targeted entity row (e.g., accountId or profileId) */
  targetResourceId: string;

  /** The structural parameters required to complete the action downstream upon approval */
  payload: Record<string, unknown>;

  /** Time-To-Live duration in minutes before the verification request expires automatically */
  ttlMinutes: number;
}

/**
 * Data Transfer Object submitted by an independent administrator to clear or drop a pending ticket.
 */
export interface ReviewRequestDto {
  /** The independent checking administrator's User ID executing the evaluation pass */
  checkerId: UUID;

  /** The definitive operational governance decision choice */
  decision: 'APPROVE' | 'REJECT';

  /** Compulsory textual justification explaining the compliance reasoning behind this choice */
  justificationReason: string;
}

/**
 * Standard HTTP structural response mapping an updated review ticket state back to administrative panels.
 */
export interface ApprovalResponseDto {
  success: boolean;
  data: {
    requestId: ULID;
    status: ApprovalStatus;
  };
  meta: null;
  error: null;
}
