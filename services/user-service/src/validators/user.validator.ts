import { z } from 'zod';

export const createProfileSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  phoneNumber: z.string().min(5, 'Phone number is required'), // Relax regex slightly to cover diverse inputs
});

export const updateProfileSchema = z.object({
  firstName: z.string().min(1, 'First name must not be empty').optional(),
  lastName: z.string().min(1, 'Last name must not be empty').optional(),
  phoneNumber: z
    .string()
    .min(5, 'Phone number must be at least 5 characters')
    .optional()
    .nullable(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD format')
    .optional()
    .nullable(),
  addressLine1: z.string().optional().nullable(),
  addressLine2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  country: z.string().length(2, 'Country must be a 2-character ISO code (e.g. IN)').optional(),
  preferences: z
    .object({
      language: z.string().length(2).optional(),
      timezone: z.string().optional(),
      emailNotificationsEnabled: z.boolean().optional(),
      smsNotificationsEnabled: z.boolean().optional(),
      pushNotificationsEnabled: z.boolean().optional(),
      transferNotificationThreshold: z.number().min(0).optional(),
    })
    .optional(),
});

export const submitKycSchema = z.object({
  documentType: z.enum(['aadhaar', 'pan', 'passport', 'driving_licence'], {
    errorMap: () => ({
      message: "Document type must be one of: 'aadhaar', 'pan', 'passport', 'driving_licence'",
    }),
  }),
  documentNumber: z.string().min(4, 'Document number must be at least 4 characters long'),
  documentReference: z.string().optional(),
});
