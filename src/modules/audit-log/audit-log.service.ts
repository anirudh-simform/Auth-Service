import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from 'src/generated/prisma/client';
import { AuditEventType } from './constants/audit-event-types.constant';
import { stableStringify } from './utils/stable-stringify.util';

const GENESIS_HASH = '';
const MAX_WRITE_ATTEMPTS = 3;
const ACTOR_EXPORT_LIMIT = 500;

export interface RecordAuditEventParams {
  eventType: AuditEventType;
  actorUserId?: string | null;
  orgId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

interface HashInput {
  prevHash: string;
  eventType: string;
  actorUserId: string | null;
  orgId: string | null;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  createdAt: Date;
}

export interface ChainIntegrityResult {
  valid: boolean;
  brokenAtSequence?: string;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Appends a hash-chained audit entry. Never throws - a failure to persist
   * an audit record must not break the security-relevant action it describes
   * (e.g. a login must still succeed even if the audit write fails).
   */
  async record(params: RecordAuditEventParams): Promise<void> {
    for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt++) {
      try {
        await this.prismaService.$transaction(
          async (tx) => {
            const latest = await tx.auditLog.findFirst({
              orderBy: { sequence: 'desc' },
              select: { entry_hash: true },
            });
            const prevHash = latest?.entry_hash ?? GENESIS_HASH;
            const createdAt = new Date();

            const entryHash = this.computeHash({
              prevHash,
              eventType: params.eventType,
              actorUserId: params.actorUserId ?? null,
              orgId: params.orgId ?? null,
              targetType: params.targetType ?? null,
              targetId: params.targetId ?? null,
              metadata: params.metadata ?? null,
              createdAt,
            });

            await tx.auditLog.create({
              data: {
                event_type: params.eventType,
                actor_user_id: params.actorUserId ?? undefined,
                org_id: params.orgId ?? undefined,
                target_type: params.targetType ?? undefined,
                target_id: params.targetId ?? undefined,
                metadata: (params.metadata ?? undefined) as
                  | Prisma.InputJsonValue
                  | undefined,
                ip_address: params.ipAddress ?? undefined,
                user_agent: params.userAgent ?? undefined,
                prev_hash: prevHash,
                entry_hash: entryHash,
                created_at: createdAt,
              },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        return;
      } catch (error: unknown) {
        if (
          this.isSerializationConflict(error) &&
          attempt < MAX_WRITE_ATTEMPTS
        ) {
          continue;
        }
        this.logger.error(
          'AuditLogWriteError',
          error instanceof Error ? error.stack : undefined,
        );
        return;
      }
    }
  }

  /**
   * Walks the full chain in sequence order and recomputes every hash.
   * Any edited, deleted, reordered, or inserted-out-of-band row breaks the
   * chain and is reported here.
   */
  async verifyChainIntegrity(): Promise<ChainIntegrityResult> {
    const PAGE_SIZE = 500;
    let cursor: bigint | undefined;
    let previousHash = GENESIS_HASH;

    while (true) {
      const rows = await this.prismaService.auditLog.findMany({
        where: cursor !== undefined ? { sequence: { gt: cursor } } : undefined,
        orderBy: { sequence: 'asc' },
        take: PAGE_SIZE,
      });

      if (rows.length === 0) break;

      for (const row of rows) {
        if (row.prev_hash !== previousHash) {
          return { valid: false, brokenAtSequence: row.sequence.toString() };
        }

        const expectedHash = this.computeHash({
          prevHash: row.prev_hash,
          eventType: row.event_type,
          actorUserId: row.actor_user_id,
          orgId: row.org_id,
          targetType: row.target_type,
          targetId: row.target_id,
          metadata: row.metadata,
          createdAt: row.created_at,
        });

        if (expectedHash !== row.entry_hash) {
          return { valid: false, brokenAtSequence: row.sequence.toString() };
        }

        previousHash = row.entry_hash;
      }

      cursor = rows[rows.length - 1].sequence;
    }

    return { valid: true };
  }

  async listForOrg(
    orgId: string,
    pagination: { page?: number; limit?: number },
  ) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;

    return await this.prismaService.auditLog.findMany({
      where: { org_id: orgId },
      orderBy: { sequence: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  /**
   * Recent events where the given user was the actor, for GDPR data-export
   * purposes. Capped at ACTOR_EXPORT_LIMIT (most recent first) rather than
   * returning the full history unbounded.
   */
  async listForActor(userId: string) {
    return await this.prismaService.auditLog.findMany({
      where: { actor_user_id: userId },
      orderBy: { sequence: 'desc' },
      take: ACTOR_EXPORT_LIMIT,
    });
  }

  private computeHash(input: HashInput): string {
    const canonical = stableStringify({
      prev_hash: input.prevHash,
      event_type: input.eventType,
      actor_user_id: input.actorUserId,
      org_id: input.orgId,
      target_type: input.targetType,
      target_id: input.targetId,
      metadata: input.metadata,
      created_at: input.createdAt.toISOString(),
    });

    return createHash('sha256').update(canonical).digest('hex');
  }

  private isSerializationConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
    );
  }
}
