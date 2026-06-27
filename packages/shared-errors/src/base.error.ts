import { type ErrorCodeType, type ApiErrorDetail } from '@fintech/shared-types';

/**
 * Base Application Error.
 * The foundational abstract class from which all domain-specific HTTP and operational
 * exceptions must inherit. Enforces contract conformance with the global API error response template.
 */
export abstract class BaseAppError extends Error {
  /** The standard HTTP status code associated with this error class (e.g., 400, 404, 500) */
  public abstract readonly statusCode: number;

  constructor(
    /** Strictly typed machine-readable identification token used for client-side routing and UI localization */
    public readonly code: ErrorCodeType,
    /** Human-readable explanation of why the application exception occurred */
    message: string,
    /** Optional collection of targeted array objects detailing sub-field validation issues */
    public readonly details: ApiErrorDetail[] = [],
  ) {
    super(message);

    // Dynamic runtime assignment ensuring the execution logs capture the precise error name
    this.name = this.constructor.name;

    // Explicitly restore native prototype chain for correct 'instanceof' lookups across compiled modules
    Object.setPrototypeOf(this, new.target.prototype);

    // Capture V8 stack trace excluding this constructor call to preserve clean debugging vectors
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}
