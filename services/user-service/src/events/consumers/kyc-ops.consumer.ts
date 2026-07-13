import type { AmqpConnectionManager } from 'amqp-connection-manager';
import { createConsumer, type Consumer } from '@fintech/shared-messaging';
import type { UserRepository } from '../../repositories/user.repository';
import type { KycRepository } from '../../repositories/kyc.repository';
import type { InboxRepository } from '../../repositories/inbox.repository';
import type { UserPublisher } from '../publishers/user.publisher';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../db/schema';
import type {
  ApprovalApprovedEvent,
  ApprovalApprovedEventData,
  ApprovalRejectedEvent,
  ApprovalRejectedEventData,
  EventEnvelope,
} from '@fintech/shared-events';

export interface OperationsKycApprovedEventData {
  userId: string;
  verifiedBy?: string;
  changedBy?: string;
}

export interface OperationsKycRejectedEventData {
  userId: string;
  rejectedBy?: string;
  changedBy?: string;
  reason?: string;
}

export type OperationsKycApprovedEvent = EventEnvelope<OperationsKycApprovedEventData>;
export type OperationsKycRejectedEvent = EventEnvelope<OperationsKycRejectedEventData>;

/**
 * Creates consumers that handle KYC approval events from operations or approvals.
 */
export function createKycApprovedConsumer(
  connection: AmqpConnectionManager,
  db: NodePgDatabase<typeof schema>,
  userRepo: UserRepository,
  kycRepo: KycRepository,
  inboxRepo: InboxRepository,
  publisher: UserPublisher,
): Consumer[] {
  const handleApproval = async (
    event: ApprovalApprovedEvent | OperationsKycApprovedEvent,
    isOperationsEvent: boolean,
  ) => {
    let userId: string;
    let checkerId: string;
    const correlationId = event.correlationId;

    if (isOperationsEvent) {
      const opsEvent = event as OperationsKycApprovedEvent;
      userId = opsEvent.data.userId;
      checkerId = opsEvent.data.verifiedBy || opsEvent.data.changedBy || '';
    } else {
      // approval.approved event
      const approvalEvent = event as ApprovalApprovedEvent;
      if (approvalEvent.data.actionType !== 'KYC_CLEAR') {
        return; // Skip non-KYC approvals
      }
      userId = approvalEvent.data.targetResourceId;
      checkerId = approvalEvent.data.checkerId;
    }

    process.stdout.write(
      JSON.stringify({
        level: 'info',
        msg: 'KYC_APPROVAL_EVENT_RECEIVED',
        userId,
        checkerId,
        eventId: event.id,
        correlationId,
        timestamp: new Date().toISOString(),
      }) + '\n',
    );

    await db.transaction(async (tx) => {
      // Idempotency check via inboxMessages
      const isNewMessage = await inboxRepo.insertMessage(event.id, event.type, tx);
      if (!isNewMessage) {
        process.stdout.write(
          JSON.stringify({
            level: 'info',
            msg: 'KYC_APPROVAL_EVENT_DUPLICATE_SKIPPED',
            userId,
            eventId: event.id,
            correlationId,
            timestamp: new Date().toISOString(),
          }) + '\n',
        );
        return;
      }

      // Fetch user profile
      const profile = await userRepo.findById(userId, tx);
      if (!profile) {
        process.stderr.write(
          JSON.stringify({
            level: 'error',
            msg: 'KYC_APPROVAL_USER_NOT_FOUND',
            userId,
            eventId: event.id,
            correlationId,
            timestamp: new Date().toISOString(),
          }) + '\n',
        );
        throw new Error(`User profile not found for KYC approval: ${userId}`);
      }

      const oldStatus = profile.kycStatus;

      // Update user kyc_status to verified
      await userRepo.updateKycStatus(userId, 'APPROVED', checkerId, tx);

      // Update submission status
      const submission = await kycRepo.findLatestByUserId(userId, tx);
      if (submission && submission.status === 'pending') {
        await kycRepo.updateStatus(submission.id, 'approved', checkerId, undefined, tx);
      }

      // Publish downstream event
      await publisher.publishKycStatusChanged(
        userId,
        oldStatus,
        'APPROVED',
        'KYC check approved by compliance operations',
        checkerId,
        correlationId,
      );

      process.stdout.write(
        JSON.stringify({
          level: 'info',
          msg: 'KYC_STATUS_TRANSITION_VERIFIED',
          userId,
          oldStatus,
          newStatus: 'APPROVED',
          correlationId,
          timestamp: new Date().toISOString(),
        }) + '\n',
      );
    });
  };

  const opsConsumer = createConsumer<OperationsKycApprovedEventData>(
    connection,
    {
      queueName: 'user-service.kyc-approved',
      routingKey: 'operations.kyc_approved',
      prefetch: 1,
    },
    async (event) => {
      await handleApproval(event, true);
    },
  );

  const approvalConsumer = createConsumer<ApprovalApprovedEventData>(
    connection,
    {
      queueName: 'user-service.kyc-approved-approval',
      routingKey: 'approval.approved',
      prefetch: 1,
    },
    async (event) => {
      await handleApproval(event, false);
    },
  );

  return [opsConsumer, approvalConsumer];
}

/**
 * Creates consumers that handle KYC rejection events from operations or approvals.
 */
export function createKycRejectedConsumer(
  connection: AmqpConnectionManager,
  db: NodePgDatabase<typeof schema>,
  userRepo: UserRepository,
  kycRepo: KycRepository,
  inboxRepo: InboxRepository,
  publisher: UserPublisher,
): Consumer[] {
  const handleRejection = async (
    event: ApprovalRejectedEvent | OperationsKycRejectedEvent,
    isOperationsEvent: boolean,
  ) => {
    let userId: string;
    let checkerId: string;
    let reason = 'KYC check rejected by compliance operations';
    const correlationId = event.correlationId;

    if (isOperationsEvent) {
      const opsEvent = event as OperationsKycRejectedEvent;
      userId = opsEvent.data.userId;
      checkerId = opsEvent.data.rejectedBy || opsEvent.data.changedBy || '';
      reason = opsEvent.data.reason || reason;
    } else {
      // approval.rejected event
      const approvalEvent = event as ApprovalRejectedEvent;
      if (approvalEvent.data.actionType !== 'KYC_CLEAR') {
        return; // Skip non-KYC rejections
      }
      userId = approvalEvent.data.targetResourceId;
      checkerId = approvalEvent.data.checkerId;
      reason = approvalEvent.data.justificationReason || reason;
    }

    process.stdout.write(
      JSON.stringify({
        level: 'info',
        msg: 'KYC_REJECTION_EVENT_RECEIVED',
        userId,
        checkerId,
        eventId: event.id,
        correlationId,
        timestamp: new Date().toISOString(),
      }) + '\n',
    );

    await db.transaction(async (tx) => {
      // Idempotency check via inboxMessages
      const isNewMessage = await inboxRepo.insertMessage(event.id, event.type, tx);
      if (!isNewMessage) {
        process.stdout.write(
          JSON.stringify({
            level: 'info',
            msg: 'KYC_REJECTION_EVENT_DUPLICATE_SKIPPED',
            userId,
            eventId: event.id,
            correlationId,
            timestamp: new Date().toISOString(),
          }) + '\n',
        );
        return;
      }

      // Fetch user profile
      const profile = await userRepo.findById(userId, tx);
      if (!profile) {
        process.stderr.write(
          JSON.stringify({
            level: 'error',
            msg: 'KYC_REJECTION_USER_NOT_FOUND',
            userId,
            eventId: event.id,
            correlationId,
            timestamp: new Date().toISOString(),
          }) + '\n',
        );
        throw new Error(`User profile not found for KYC rejection: ${userId}`);
      }

      const oldStatus = profile.kycStatus;

      // Update user kyc_status to rejected
      await userRepo.updateKycStatus(userId, 'REJECTED', checkerId, tx);

      // Update submission status
      const submission = await kycRepo.findLatestByUserId(userId, tx);
      if (submission && submission.status === 'pending') {
        await kycRepo.updateStatus(submission.id, 'rejected', checkerId, reason, tx);
      }

      // Publish downstream event
      await publisher.publishKycStatusChanged(
        userId,
        oldStatus,
        'REJECTED',
        reason,
        checkerId,
        correlationId,
      );

      process.stdout.write(
        JSON.stringify({
          level: 'info',
          msg: 'KYC_STATUS_TRANSITION_REJECTED',
          userId,
          oldStatus,
          newStatus: 'REJECTED',
          correlationId,
          timestamp: new Date().toISOString(),
        }) + '\n',
      );
    });
  };

  const opsConsumer = createConsumer<OperationsKycRejectedEventData>(
    connection,
    {
      queueName: 'user-service.kyc-rejected',
      routingKey: 'operations.kyc_rejected',
      prefetch: 1,
    },
    async (event) => {
      await handleRejection(event, true);
    },
  );

  const approvalConsumer = createConsumer<ApprovalRejectedEventData>(
    connection,
    {
      queueName: 'user-service.kyc-rejected-approval',
      routingKey: 'approval.rejected',
      prefetch: 1,
    },
    async (event) => {
      await handleRejection(event, false);
    },
  );

  return [opsConsumer, approvalConsumer];
}
