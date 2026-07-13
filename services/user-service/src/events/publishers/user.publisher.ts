import type { Publisher } from '@fintech/shared-messaging';
import { createEnvelope } from '@fintech/shared-events';
import { config } from '../../config';
import type { KycStatus } from '@fintech/shared-types';

export class UserPublisher {
  constructor(private readonly amqpPublisher: Publisher) {}

  /**
   * Broadcasts a user.kyc_status_changed event downstream to other microservices.
   */
  async publishKycStatusChanged(
    userId: string,
    oldStatus: KycStatus,
    newStatus: KycStatus,
    reason: string | undefined,
    changedBy: string | undefined,
    correlationId: string,
  ): Promise<void> {
    const event = createEnvelope('user.kyc_status_changed', config.SERVICE_NAME, correlationId, {
      userId,
      oldStatus, // For consumers expecting shared-events/shared-types model
      previousStatus: oldStatus, // For manual compliance check
      newStatus,
      changedBy: changedBy || null, // For manual compliance check
      verifiedBy: changedBy || null, // For shared-events model
      reason: reason || null,
      occurredAt: new Date().toISOString(),
    });

    await this.amqpPublisher.publish('user.kyc_status_changed', event);
  }

  /**
   * Broadcasts a user.kyc_submitted event to notify operations/audit services.
   */
  async publishKycSubmitted(
    userId: string,
    documentType: string,
    documentNumber: string,
    correlationId: string,
  ): Promise<void> {
    const event = createEnvelope('user.kyc_submitted', config.SERVICE_NAME, correlationId, {
      userId,
      documentType,
      documentNumber,
      submittedAt: new Date().toISOString(),
    });

    await this.amqpPublisher.publish('user.kyc_submitted', event);
  }
}
