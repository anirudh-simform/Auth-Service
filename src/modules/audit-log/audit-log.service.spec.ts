import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogService } from './audit-log.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from 'src/generated/prisma/client';
import { AuditEventType } from './constants/audit-event-types.constant';

describe('AuditLogService', () => {
  let service: AuditLogService;

  const txMock = {
    auditLog: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };

  const prismaMock = {
    $transaction: jest.fn(),
    auditLog: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    prismaMock.$transaction.mockImplementation(
      (callback: (tx: typeof txMock) => unknown) => callback(txMock),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('record', () => {
    it('uses an empty prev_hash for the first entry in the chain', async () => {
      txMock.auditLog.findFirst.mockResolvedValue(null);
      txMock.auditLog.create.mockResolvedValue({});

      await service.record({ eventType: AuditEventType.AUTH_LOGIN_SUCCESS });

      const createCall = txMock.auditLog.create.mock.calls[0][0];
      expect(createCall.data.prev_hash).toBe('');
      expect(createCall.data.entry_hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('chains prev_hash from the latest existing entry', async () => {
      txMock.auditLog.findFirst.mockResolvedValue({
        entry_hash: 'previous-entry-hash',
      });
      txMock.auditLog.create.mockResolvedValue({});

      await service.record({ eventType: AuditEventType.AUTH_LOGIN_SUCCESS });

      const createCall = txMock.auditLog.create.mock.calls[0][0];
      expect(createCall.data.prev_hash).toBe('previous-entry-hash');
    });

    it('produces different hashes for different event content', async () => {
      txMock.auditLog.findFirst.mockResolvedValue(null);
      txMock.auditLog.create.mockResolvedValue({});

      await service.record({ eventType: AuditEventType.AUTH_LOGIN_SUCCESS });
      const firstHash = txMock.auditLog.create.mock.calls[0][0].data.entry_hash;

      jest.clearAllMocks();
      txMock.auditLog.findFirst.mockResolvedValue(null);
      txMock.auditLog.create.mockResolvedValue({});

      await service.record({ eventType: AuditEventType.AUTH_LOGIN_FAILURE });
      const secondHash = txMock.auditLog.create.mock.calls[0][0].data.entry_hash;

      expect(firstHash).not.toBe(secondHash);
    });

    it('retries on a serialization conflict and eventually succeeds', async () => {
      const conflictError = new Prisma.PrismaClientKnownRequestError(
        'conflict',
        { code: 'P2034', clientVersion: '7.8.0' },
      );

      prismaMock.$transaction
        .mockRejectedValueOnce(conflictError)
        .mockImplementationOnce((callback: (tx: typeof txMock) => unknown) =>
          callback(txMock),
        );
      txMock.auditLog.findFirst.mockResolvedValue(null);
      txMock.auditLog.create.mockResolvedValue({});

      await service.record({ eventType: AuditEventType.AUTH_LOGIN_SUCCESS });

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
      expect(txMock.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('swallows the error instead of throwing after repeated failures', async () => {
      const conflictError = new Prisma.PrismaClientKnownRequestError(
        'conflict',
        { code: 'P2034', clientVersion: '7.8.0' },
      );
      prismaMock.$transaction.mockRejectedValue(conflictError);

      await expect(
        service.record({ eventType: AuditEventType.AUTH_LOGIN_SUCCESS }),
      ).resolves.toBeUndefined();
    });

    it('swallows unrelated database errors without throwing', async () => {
      prismaMock.$transaction.mockRejectedValue(new Error('connection lost'));

      await expect(
        service.record({ eventType: AuditEventType.AUTH_LOGIN_SUCCESS }),
      ).resolves.toBeUndefined();
    });
  });

  describe('verifyChainIntegrity', () => {
    // Build a genuinely valid two-entry chain by calling record() twice
    // against an in-memory store, so the hashes are the service's own.
    async function buildValidChain() {
      const rows: Array<Record<string, unknown>> = [];
      let sequence = 1n;

      txMock.auditLog.findFirst.mockImplementation(() =>
        Promise.resolve(rows.length > 0 ? rows[rows.length - 1] : null),
      );
      txMock.auditLog.create.mockImplementation(({ data }) => {
        // Real Postgres/Prisma normalizes an omitted optional column to null
        // when read back - mimic that so the mock matches production
        // behavior (this is precisely the kind of representation mismatch
        // stableStringify's write/verify symmetry is meant to survive).
        const normalized: Record<string, unknown> = { ...data };
        for (const key of [
          'actor_user_id',
          'org_id',
          'target_type',
          'target_id',
          'metadata',
          'ip_address',
          'user_agent',
        ]) {
          if (normalized[key] === undefined) normalized[key] = null;
        }
        const row = { ...normalized, sequence: sequence++ };
        rows.push(row);
        return Promise.resolve(row);
      });

      await service.record({
        eventType: AuditEventType.AUTH_LOGIN_SUCCESS,
        actorUserId: 'user-1',
      });
      await service.record({
        eventType: AuditEventType.AUTH_LOGIN_FAILURE,
        actorUserId: 'user-2',
      });

      return rows;
    }

    it('reports a valid chain as valid', async () => {
      const rows = await buildValidChain();
      prismaMock.auditLog.findMany
        .mockResolvedValueOnce(rows)
        .mockResolvedValueOnce([]);

      await expect(service.verifyChainIntegrity()).resolves.toEqual({
        valid: true,
      });
    });

    it('detects tampered content (entry_hash no longer matches recomputed hash)', async () => {
      const rows = await buildValidChain();
      rows[1].event_type = 'TAMPERED_EVENT';
      prismaMock.auditLog.findMany
        .mockResolvedValueOnce(rows)
        .mockResolvedValueOnce([]);

      const result = await service.verifyChainIntegrity();
      expect(result.valid).toBe(false);
      expect(result.brokenAtSequence).toBe('2');
    });

    it('detects a broken link (prev_hash does not match the prior entry_hash)', async () => {
      const rows = await buildValidChain();
      rows[1].prev_hash = 'not-the-real-previous-hash';
      prismaMock.auditLog.findMany
        .mockResolvedValueOnce(rows)
        .mockResolvedValueOnce([]);

      const result = await service.verifyChainIntegrity();
      expect(result.valid).toBe(false);
      expect(result.brokenAtSequence).toBe('2');
    });

    it('treats an empty chain as valid', async () => {
      prismaMock.auditLog.findMany.mockResolvedValueOnce([]);

      await expect(service.verifyChainIntegrity()).resolves.toEqual({
        valid: true,
      });
    });
  });

  describe('listForOrg', () => {
    it('relies on the org_id filter, not incidental ordering, to keep tenants apart', async () => {
      // Simulates the real query: Prisma only ever returns rows matching the where clause,
      // so if the org filter were ever dropped, this would return org-B's rows too.
      prismaMock.auditLog.findMany.mockImplementation(({ where }) =>
        Promise.resolve(
          [
            { id: 'log-a1', org_id: 'org-A' },
            { id: 'log-b1', org_id: 'org-B' },
            { id: 'log-a2', org_id: 'org-A' },
          ].filter((row) => row.org_id === where.org_id),
        ),
      );

      const result = await service.listForOrg('org-A', {});

      expect(result).toEqual([
        { id: 'log-a1', org_id: 'org-A' },
        { id: 'log-a2', org_id: 'org-A' },
      ]);
    });

    it('applies default pagination', async () => {
      prismaMock.auditLog.findMany.mockResolvedValue([]);

      await service.listForOrg('org-1', {});

      expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith({
        where: { org_id: 'org-1' },
        orderBy: { sequence: 'desc' },
        skip: 0,
        take: 20,
      });
    });

    it('applies the requested page and limit', async () => {
      prismaMock.auditLog.findMany.mockResolvedValue([]);

      await service.listForOrg('org-1', { page: 3, limit: 10 });

      expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith({
        where: { org_id: 'org-1' },
        orderBy: { sequence: 'desc' },
        skip: 20,
        take: 10,
      });
    });
  });
});
