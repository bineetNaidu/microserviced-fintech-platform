import type { ULID, UUID } from './types';

export type ApprovalActionType =
  | 'LIMIT_OVERRIDE'
  | 'KYC_CLEAR'
  | 'ACCOUNT_UNFREEZE'
  | 'MANUAL_CREDIT';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

/**
 * Represents an administrative transaction review task requiring dual-control sign-off.
 * Prevents a single internal administrator from executing high-risk balance or configuration mutations.
 */
export interface ApprovalRequest {
  /** 26-character time-sortable alphanumeric unique primary key */
  id: ULID;

  /** Distributed correlation identifier tracking the action across administrative boundaries */
  correlationId: string;

  /** The unique administrative User ID who initiated the operation (The Maker) */
  makerId: UUID;

  /** Identifies the exact restricted mutation category requested */
  actionType: ApprovalActionType;

  /** Reference string tracking the resource being targeted for alteration (e.g., accountId) */
  targetResourceId: string;

  /** The complete, serialized payload parameters required to complete the action upon approval */
  payload: Record<string, unknown>;

  /** Current state of the verification ticket loop */
  status: ApprovalStatus;

  /** Time token when the pending request automatically invalidates if not approved */
  expiresAt: Date;

  /** Chronological marker tracking request creation */
  createdAt: Date;
}

/**
 * Historical log detailing an independent administrator's decision regarding an Approval Request.
 */
export interface ApprovalReview {
  /** Unique primary key identifier for the review action */
  id: ULID;

  /** Foreign key pointing directly back to the parent target approval request */
  requestId: ULID;

  /** The independent administrative User ID executing the evaluation pass (The Checker) */
  checkerId: UUID;

  /** The ultimate verification choice executed */
  decision: 'APPROVE' | 'REJECT';

  /** Compulsory textual justification explaining the operational or compliance context for the choice */
  justificationReason: string;

  /** Chronological marker tracking when the decision was finalized */
  reviewed_at: Date;
}
