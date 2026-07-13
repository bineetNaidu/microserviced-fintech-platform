import type { NodePgDatabase, NodePgTransaction } from 'drizzle-orm/node-postgres';
import { eq, desc, ExtractTablesWithRelations } from 'drizzle-orm';
import * as schema from '../db/schema';

export interface KycSubmissionDomain {
  id: string;
  userId: string;
  documentType: string;
  documentNumber: string;
  documentReference: string | null;
  status: string;
  rejectionReason: string | null;
  submittedAt: Date;
  reviewedAt: Date | null;
  reviewedBy: string | null;
}

export type TransactionContext = NodePgTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export class KycRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  private getDb(tx?: TransactionContext) {
    return tx || this.db;
  }

  private toDomain(row: typeof schema.kycSubmissions.$inferSelect): KycSubmissionDomain {
    return {
      id: row.id,
      userId: row.userId,
      documentType: row.documentType,
      documentNumber: row.documentNumber,
      documentReference: row.documentReference,
      status: row.status,
      rejectionReason: row.rejectionReason,
      submittedAt: row.submittedAt,
      reviewedAt: row.reviewedAt,
      reviewedBy: row.reviewedBy,
    };
  }

  /** Creates a new KYC document submission record */
  async createSubmission(
    data: {
      userId: string;
      documentType: string;
      documentNumber: string;
      documentReference?: string;
    },
    tx?: TransactionContext,
  ): Promise<KycSubmissionDomain> {
    const [submission] = await this.getDb(tx)
      .insert(schema.kycSubmissions)
      .values({
        userId: data.userId,
        documentType: data.documentType,
        documentNumber: data.documentNumber,
        documentReference: data.documentReference || null,
        status: 'pending',
      })
      .returning();

    return this.toDomain(submission);
  }

  /** Finds the latest submission for a specific user */
  async findLatestByUserId(
    userId: string,
    tx?: TransactionContext,
  ): Promise<KycSubmissionDomain | null> {
    const results = await this.getDb(tx)
      .select()
      .from(schema.kycSubmissions)
      .where(eq(schema.kycSubmissions.userId, userId))
      .orderBy(desc(schema.kycSubmissions.submittedAt))
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    return this.toDomain(results[0]);
  }

  /** Updates the review status of a KYC submission */
  async updateStatus(
    id: string,
    status: 'approved' | 'rejected',
    reviewerId?: string,
    rejectionReason?: string,
    tx?: TransactionContext,
  ): Promise<KycSubmissionDomain> {
    const [submission] = await this.getDb(tx)
      .update(schema.kycSubmissions)
      .set({
        status,
        reviewedBy: reviewerId || null,
        rejectionReason: rejectionReason || null,
        reviewedAt: new Date(),
      })
      .where(eq(schema.kycSubmissions.id, id))
      .returning();

    return this.toDomain(submission);
  }
}
