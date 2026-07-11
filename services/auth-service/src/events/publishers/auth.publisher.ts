import type { Publisher } from '@fintech/shared-messaging';
import { createEnvelope } from '@fintech/shared-events';
import { config } from '../../config';
import type { UserRole } from '@fintech/shared-types';

export class AuthPublisher {
  constructor(private readonly amqpPublisher: Publisher) {}

  /** Publishes user.registered event when a customer registration completes */
  async publishUserRegistered(
    userId: string,
    email: string,
    role: UserRole,
    verificationToken: string,
    correlationId: string,
  ): Promise<void> {
    const event = createEnvelope('user.registered', config.SERVICE_NAME, correlationId, {
      userId,
      email,
      role,
      verificationToken,
      occurredAt: new Date().toISOString(),
    });

    await this.amqpPublisher.publish('user.registered', event);
  }

  /** Publishes user.email_verified event when email is confirmed successfully */
  async publishEmailVerified(userId: string, email: string, correlationId: string): Promise<void> {
    const event = createEnvelope('user.email_verified', config.SERVICE_NAME, correlationId, {
      userId,
      email,
      occurredAt: new Date().toISOString(),
    });

    await this.amqpPublisher.publish('user.email_verified', event);
  }

  /** Publishes user.logged_in event on successful session verification */
  async publishLoggedIn(
    userId: string,
    sessionId: string,
    ipAddress: string | null,
    userAgent: string | null,
    correlationId: string,
  ): Promise<void> {
    const event = createEnvelope('user.logged_in', config.SERVICE_NAME, correlationId, {
      userId,
      sessionId,
      ipAddress: ipAddress ?? 'unknown',
      userAgent: userAgent ?? 'unknown',
      occurredAt: new Date().toISOString(),
    });

    await this.amqpPublisher.publish('user.logged_in', event);
  }

  /** Publishes user.password_reset_requested event */
  async publishPasswordResetRequested(
    userId: string,
    email: string,
    resetToken: string,
    correlationId: string,
  ): Promise<void> {
    const event = createEnvelope(
      'user.password_reset_requested',
      config.SERVICE_NAME,
      correlationId,
      {
        userId,
        email,
        resetToken,
        occurredAt: new Date().toISOString(),
      },
    );

    await this.amqpPublisher.publish('user.password_reset_requested', event);
  }

  /** Publishes user.password_changed event on password changes or resets */
  async publishPasswordChanged(userId: string, correlationId: string): Promise<void> {
    const event = createEnvelope('user.password_changed', config.SERVICE_NAME, correlationId, {
      userId,
      occurredAt: new Date().toISOString(),
    });

    await this.amqpPublisher.publish('user.password_changed', event);
  }

  /** Publishes user.session_revoked event when session is closed or revoked */
  async publishSessionRevoked(
    userId: string,
    sessionId: string,
    revokedAll: boolean,
    correlationId: string,
  ): Promise<void> {
    const event = createEnvelope('user.session_revoked', config.SERVICE_NAME, correlationId, {
      userId,
      sessionId,
      revokedAll,
      occurredAt: new Date().toISOString(),
    });

    await this.amqpPublisher.publish('user.session_revoked', event);
  }

  /** Publishes user.suspended event when operations action occurs */
  async publishUserSuspended(
    userId: string,
    reason: string,
    suspendedBy: string,
    correlationId: string,
  ): Promise<void> {
    const event = createEnvelope('user.suspended', config.SERVICE_NAME, correlationId, {
      userId,
      reason,
      suspendedBy,
      occurredAt: new Date().toISOString(),
    });

    await this.amqpPublisher.publish('user.suspended', event);
  }
}
