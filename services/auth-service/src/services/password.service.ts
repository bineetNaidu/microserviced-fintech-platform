import bcrypt from 'bcrypt';

/**
 * Service orchestrating password security, bcrypt hashing, and timing-safe password validations.
 *
 * bcrypt cost factor is configured to 12.
 * Adheres strictly to Chapter 5 Section 5.3.5 design guidelines.
 */
export class PasswordService {
  private readonly saltRounds = 12;

  /**
   * Hashes a plain-text password using bcrypt.
   * Resolves with the secure hashed string ready for database storage.
   */
  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  /**
   * Timing-safe verification of plain-text passwords against storage hashes.
   * Enforces O(1) comparison matching times to defend against side-channel analysis timing attacks.
   */
  async verify(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
