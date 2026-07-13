import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  char,
  text,
  bigint,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * User Profiles Table Schema
 * Maps legal identity, compliance status (KYC), and profile configurations.
 * Identifiers match core authentication user IDs exactly.
 */
export const userProfiles = pgTable('user_profiles', {
  id: uuid('id').primaryKey(), // Coordinated UUID matching auth_db users.id exactly
  email: varchar('email', { length: 255 }).notNull().unique(), // Denormalized for rapid searching
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  phoneNumber: varchar('phone_number', { length: 20 }),
  dateOfBirth: varchar('date_of_birth', { length: 10 }), // ISO string YYYY-MM-DD
  addressLine1: varchar('address_line_1', { length: 255 }),
  addressLine2: varchar('address_line_2', { length: 255 }),
  city: varchar('city', { length: 100 }),
  state: varchar('state', { length: 100 }),
  postalCode: varchar('postal_code', { length: 20 }),
  country: char('country', { length: 2 }).notNull().default('IN'),
  kycStatus: varchar('kyc_status', { length: 20 }).notNull().default('pending'), // 'pending', 'submitted', 'verified', 'rejected', 'suspended'
  kycVerifiedAt: timestamp('kyc_verified_at', { withTimezone: true }),
  kycVerifiedBy: uuid('kyc_verified_by'), // Refers to Admin checker user ID
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

/**
 * User Preferences Table Schema
 * Manages user configurations, locale, and notification threshold criteria.
 */
export const userPreferences = pgTable('user_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => userProfiles.id, { onDelete: 'cascade' }),
  language: char('language', { length: 2 }).notNull().default('en'),
  timezone: varchar('timezone', { length: 50 }).notNull().default('Asia/Kolkata'),
  emailNotificationsEnabled: boolean('email_notifications_enabled').notNull().default(true),
  smsNotificationsEnabled: boolean('sms_notifications_enabled').notNull().default(true),
  pushNotificationsEnabled: boolean('push_notifications_enabled').notNull().default(true),
  transferNotificationThreshold: bigint('transfer_notification_threshold', { mode: 'number' })
    .notNull()
    .default(0), // Stored in paise
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * KYC Submissions Table Schema
 * Records government identifier submissions for dual-control reviewer sign-off workflows.
 */
export const kycSubmissions = pgTable('kyc_submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => userProfiles.id, { onDelete: 'cascade' }),
  documentType: varchar('document_type', { length: 50 }).notNull(), // 'aadhaar', 'pan', 'passport', 'driving_licence'
  documentNumber: varchar('document_number', { length: 50 }).notNull(),
  documentReference: varchar('document_reference', { length: 255 }),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // 'pending', 'approved', 'rejected'
  rejectionReason: text('rejection_reason'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewedBy: uuid('reviewed_by'),
});

/**
 * Inbox Messages Table Schema (ADR-011)
 * Handles idempotent AMQP consumer registrations to prevent duplicate processing of event envelopes.
 */
export const inboxMessages = pgTable('inbox_messages', {
  id: varchar('id', { length: 26 }).primaryKey(), // The eventId from the EventEnvelope (ULID)
  eventType: varchar('event_type', { length: 255 }).notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── RELATIONSHIPS ───────────────────────────────────────────────────────────

export const userProfilesRelations = relations(userProfiles, ({ one, many }) => ({
  preferences: one(userPreferences, {
    fields: [userProfiles.id],
    references: [userPreferences.userId],
  }),
  kycSubmissions: many(kycSubmissions),
}));

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(userProfiles, {
    fields: [userPreferences.userId],
    references: [userProfiles.id],
  }),
}));

export const kycSubmissionsRelations = relations(kycSubmissions, ({ one }) => ({
  user: one(userProfiles, {
    fields: [kycSubmissions.userId],
    references: [userProfiles.id],
  }),
}));
