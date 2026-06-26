/**
 * All monetary values MUST be in their smallest denomination (paise for INR).
 * JavaScript's Number.MAX_SAFE_INTEGER can safely hold up to ₹900 Billion.
 */
export type Paise = number;

/**
 * Standardized ULID String
 */
export type ULID = string;
