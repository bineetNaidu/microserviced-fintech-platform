import { z } from 'zod';

export const CreateAccountSchema = z.object({
  type: z.enum(['CHECKING', 'SAVINGS'], {
    errorMap: () => ({ message: "Account type must be either 'CHECKING' or 'SAVINGS'" }),
  }),
  currency: z.enum(['INR'], {
    errorMap: () => ({ message: "Only currency 'INR' is supported at this time" }),
  }),
});

export const FreezeAccountSchema = z.object({
  reason: z.string().min(1, { message: 'Reason for freezing must be provided' }),
});

export const ValidateBoundsSchema = z.object({
  fromAccountId: z
    .string()
    .length(26, { message: 'fromAccountId must be a valid 26-character ULID' }),
  toAccountId: z.string().length(26, { message: 'toAccountId must be a valid 26-character ULID' }),
  amountPaise: z.number().int().positive({ message: 'amountPaise must be a positive integer' }),
});
