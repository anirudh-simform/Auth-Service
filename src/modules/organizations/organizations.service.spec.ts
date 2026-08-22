import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationsService } from './organizations.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { BadRequestException } from '@nestjs/common';
import { User } from 'src/generated/prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditEventType } from '../audit-log/constants/audit-event-types.constant';

describe('OrganizationsService', () => {
  let service: OrganizationsService;

  const txMock = {
    organization: { create: jest.fn() },
    orgMembership: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
    },
    orgRole: { findFirst: jest.fn() },
  };

  const prismaMock = {
    $transaction: jest.fn((callback: (tx: typeof txMock) => unknown) =>
      callback(txMock),
    ),
    orgMembership: {
      findUnique: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    orgRole: { findFirst: jest.fn(), findMany: jest.fn() },
  };

  const authorizationServiceMock = {
    createSystemRoles: jest.fn(),
    isOwnerRole: jest.fn(),
  };

  const auditLogServiceMock = {
    record: jest.fn(),
  };

  const owner = { id: 'owner-id' } as User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuthorizationService, useValue: authorizationServiceMock },
        { provide: AuditLogService, useValue: auditLogServiceMock },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createOrganization', () => {
    it('creates the org, its system roles, and adds the owner as a member', async () => {
      txMock.organization.create.mockResolvedValue({ id: 'org-1' });
      authorizationServiceMock.createSystemRoles.mockResolvedValue({
        ownerRole: { id: 'owner-role-1' },
        adminRole: { id: 'admin-role-1' },
        memberRole: { id: 'member-role-1' },
      });
      txMock.orgRole.findFirst.mockResolvedValue({ id: 'owner-role-1' });
      txMock.orgMembership.create.mockResolvedValue({});

      const result = await service.createOrganization(owner, 'Acme');

      expect(result).toEqual({ id: 'org-1' });
      expect(txMock.organization.create).toHaveBeenCalledWith({
        data: { name: 'Acme' },
      });
      expect(authorizationServiceMock.createSystemRoles).toHaveBeenCalledWith(
        txMock,
        'org-1',
      );
      expect(txMock.orgMembership.create).toHaveBeenCalledWith({
        data: {
          orgRole_id: 'owner-role-1',
          user_id: 'owner-id',
          org_id: 'org-1',
        },
      });
      expect(auditLogServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.ORG_CREATED,
          actorUserId: 'owner-id',
          orgId: 'org-1',
        }),
      );
    });
  });

  describe('addUserToOrg', () => {
    it('throws BadRequestException when the role does not belong to the org', async () => {
      prismaMock.orgRole.findFirst.mockResolvedValue(null);

      await expect(
        service.addUserToOrg('org-1', 'user-1', 'role-from-other-org'),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.orgMembership.create).not.toHaveBeenCalled();
    });

    it('rejects a role that genuinely exists but belongs to a different org (cross-tenant attack)', async () => {
      // The role id is real - it's just scoped to org-B, not org-A. findFirst({id, org_id})
      // returns null because the composite match fails, exactly as it would for a fabricated id.
      prismaMock.orgRole.findFirst.mockResolvedValue(null);

      await expect(
        service.addUserToOrg('org-A', 'user-1', 'role-that-belongs-to-org-B'),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.orgRole.findFirst).toHaveBeenCalledWith({
        where: { id: 'role-that-belongs-to-org-B', org_id: 'org-A' },
      });
      expect(prismaMock.orgMembership.create).not.toHaveBeenCalled();
    });

    it('creates the membership when the role belongs to the org', async () => {
      prismaMock.orgRole.findFirst.mockResolvedValue({ id: 'role-1' });
      prismaMock.orgMembership.create.mockResolvedValue({ id: 'membership-1' });

      const result = await service.addUserToOrg('org-1', 'user-1', 'role-1');

      expect(prismaMock.orgRole.findFirst).toHaveBeenCalledWith({
        where: { id: 'role-1', org_id: 'org-1' },
      });
      expect(result).toEqual({ id: 'membership-1' });
      expect(auditLogServiceMock.record).not.toHaveBeenCalled();
    });

    it('records an ORG_MEMBER_ADDED audit event when an actor is given', async () => {
      prismaMock.orgRole.findFirst.mockResolvedValue({ id: 'role-1' });
      prismaMock.orgMembership.create.mockResolvedValue({ id: 'membership-1' });

      await service.addUserToOrg(
        'org-1',
        'user-1',
        'role-1',
        undefined,
        'admin-1',
      );

      expect(auditLogServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.ORG_MEMBER_ADDED,
          actorUserId: 'admin-1',
          orgId: 'org-1',
          targetId: 'user-1',
        }),
      );
    });
  });

  describe('transferOrgOwnership', () => {
    const orgId = 'org-1';
    const transferee = 'transferee-id';

    it('throws BadRequestException when the transferor does not currently hold the Owner role', async () => {
      txMock.orgMembership.findUnique.mockResolvedValueOnce({
        orgRole_id: 'role-1',
        orgRole: { is_system: false, role_name: 'Admin' },
      });
      authorizationServiceMock.isOwnerRole.mockReturnValue(false);

      await expect(
        service.transferOrgOwnership(orgId, transferee, owner),
      ).rejects.toThrow(BadRequestException);

      expect(txMock.orgMembership.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the transferee is not a member of the org', async () => {
      txMock.orgMembership.findUnique
        .mockResolvedValueOnce({
          orgRole_id: 'owner-role-1',
          orgRole: { is_system: true, role_name: 'Owner' },
        })
        .mockResolvedValueOnce(null);
      authorizationServiceMock.isOwnerRole.mockReturnValue(true);

      await expect(
        service.transferOrgOwnership(orgId, transferee, owner),
      ).rejects.toThrow(BadRequestException);
    });

    it('hands ownership to the transferee and removes the transferor when no replacement role is given', async () => {
      txMock.orgMembership.findUnique
        .mockResolvedValueOnce({
          orgRole_id: 'owner-role-1',
          orgRole: { is_system: true, role_name: 'Owner' },
        })
        .mockResolvedValueOnce({ orgRole_id: 'member-role-1' });
      authorizationServiceMock.isOwnerRole.mockReturnValue(true);

      await service.transferOrgOwnership(orgId, transferee, owner);

      expect(txMock.orgMembership.update).toHaveBeenCalledWith({
        where: { user_id_org_id: { user_id: transferee, org_id: orgId } },
        data: { orgRole_id: 'owner-role-1' },
      });
      expect(txMock.orgMembership.delete).toHaveBeenCalledWith({
        where: { user_id_org_id: { user_id: owner.id, org_id: orgId } },
      });
      expect(auditLogServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.ORG_OWNERSHIP_TRANSFERRED,
          actorUserId: owner.id,
          orgId,
          targetId: transferee,
        }),
      );
    });

    it('demotes the transferor to the replacement role when one is given', async () => {
      txMock.orgMembership.findUnique
        .mockResolvedValueOnce({
          orgRole_id: 'owner-role-1',
          orgRole: { is_system: true, role_name: 'Owner' },
        })
        .mockResolvedValueOnce({ orgRole_id: 'member-role-1' });
      authorizationServiceMock.isOwnerRole
        .mockReturnValueOnce(true) // transferor check
        .mockReturnValueOnce(false); // replacement role check
      txMock.orgRole.findFirst.mockResolvedValue({
        id: 'admin-role-1',
        is_system: true,
        role_name: 'Admin',
      });

      await service.transferOrgOwnership(
        orgId,
        transferee,
        owner,
        'admin-role-1',
      );

      expect(txMock.orgMembership.update).toHaveBeenCalledWith({
        where: { user_id_org_id: { user_id: owner.id, org_id: orgId } },
        data: { orgRole_id: 'admin-role-1' },
      });
      expect(txMock.orgMembership.delete).not.toHaveBeenCalled();
    });

    it('rejects a replacement role that does not belong to the org', async () => {
      txMock.orgMembership.findUnique
        .mockResolvedValueOnce({
          orgRole_id: 'owner-role-1',
          orgRole: { is_system: true, role_name: 'Owner' },
        })
        .mockResolvedValueOnce({ orgRole_id: 'member-role-1' });
      authorizationServiceMock.isOwnerRole.mockReturnValue(true);
      txMock.orgRole.findFirst.mockResolvedValue(null);

      await expect(
        service.transferOrgOwnership(
          orgId,
          transferee,
          owner,
          'role-from-other-org',
        ),
      ).rejects.toThrow(Error);
    });
  });

  describe('removeMember', () => {
    it('throws BadRequestException when the member does not exist', async () => {
      prismaMock.orgMembership.findUnique.mockResolvedValue(null);

      await expect(
        service.removeMember('org-1', 'user-1', 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when trying to remove the owner', async () => {
      prismaMock.orgMembership.findUnique.mockResolvedValue({
        orgRole: { is_system: true, role_name: 'Owner' },
      });
      authorizationServiceMock.isOwnerRole.mockReturnValue(true);

      await expect(
        service.removeMember('org-1', 'user-1', 'admin-1'),
      ).rejects.toThrow(BadRequestException);
      expect(prismaMock.orgMembership.delete).not.toHaveBeenCalled();
    });

    it('removes a non-owner member and records an audit event', async () => {
      prismaMock.orgMembership.findUnique.mockResolvedValue({
        orgRole: { is_system: false, role_name: 'Member' },
      });
      authorizationServiceMock.isOwnerRole.mockReturnValue(false);

      await expect(
        service.removeMember('org-1', 'user-1', 'admin-1'),
      ).resolves.toEqual({ message: 'Member removed successfully' });
      expect(prismaMock.orgMembership.delete).toHaveBeenCalledWith({
        where: { user_id_org_id: { user_id: 'user-1', org_id: 'org-1' } },
      });
      expect(auditLogServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.ORG_MEMBER_REMOVED,
          actorUserId: 'admin-1',
          orgId: 'org-1',
          targetId: 'user-1',
        }),
      );
    });
  });
});
