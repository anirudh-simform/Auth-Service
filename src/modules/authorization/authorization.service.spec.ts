import { Test, TestingModule } from '@nestjs/testing';
import { AuthorizationService } from './authorization.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SystemRoles } from './constants/system-roles.constant';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditEventType } from '../audit-log/constants/audit-event-types.constant';

describe('AuthorizationService', () => {
  let service: AuthorizationService;

  const txMock = {
    orgRolePermission: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    orgRole: {
      update: jest.fn(),
    },
  };

  const prismaMock = {
    permission: {
      findMany: jest.fn(),
    },
    orgRole: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    orgMembership: {
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn((callback: (tx: typeof txMock) => unknown) =>
      callback(txMock),
    ),
  };

  const auditLogServiceMock = {
    record: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthorizationService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditLogService, useValue: auditLogServiceMock },
      ],
    }).compile();

    service = module.get<AuthorizationService>(AuthorizationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isOwnerRole', () => {
    it('returns true when role is system role and role_name is Owner', () => {
      expect(
        service.isOwnerRole({ is_system: true, role_name: SystemRoles.Owner }),
      ).toBe(true);
    });

    it('returns false when role_name is Owner but is_system is false', () => {
      expect(
        service.isOwnerRole({ is_system: false, role_name: SystemRoles.Owner }),
      ).toBe(false);
    });

    it('returns false when is_system is true but role_name is not Owner', () => {
      expect(service.isOwnerRole({ is_system: true, role_name: 'Admin' })).toBe(
        false,
      );
    });
  });

  describe('createRole', () => {
    it('records an ORG_ROLE_CREATED audit event when an actor is given', async () => {
      prismaMock.permission.findMany.mockResolvedValue([
        { key: 'member.invite' },
      ]);
      prismaMock.orgRole.create.mockResolvedValue({ id: 'role-1' });

      await service.createRole(
        'org-1',
        'Editors',
        ['perm-1'],
        undefined,
        undefined,
        'admin-1',
      );

      expect(auditLogServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.ORG_ROLE_CREATED,
          actorUserId: 'admin-1',
          orgId: 'org-1',
          targetId: 'role-1',
        }),
      );
    });

    it('does not emit an audit event when no actor is given', async () => {
      prismaMock.permission.findMany.mockResolvedValue([
        { key: 'member.invite' },
      ]);
      prismaMock.orgRole.create.mockResolvedValue({ id: 'role-1' });

      await service.createRole('org-1', 'Editors', ['perm-1']);

      expect(auditLogServiceMock.record).not.toHaveBeenCalled();
    });

    it('still rejects an admin trying to name a custom role after a reserved system role', async () => {
      prismaMock.permission.findMany.mockResolvedValue([]);

      await expect(
        service.createRole('org-1', SystemRoles.Owner, []),
      ).rejects.toThrow(ForbiddenException);
      expect(prismaMock.orgRole.create).not.toHaveBeenCalled();
    });
  });

  describe('createSystemRoles', () => {
    it('bootstraps Owner/Admin/Member roles without hitting the reserved-name check', async () => {
      prismaMock.permission.findMany.mockResolvedValue([{ id: 'perm-1' }]);
      prismaMock.orgRole.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: `role-${data.role_name}`, ...data }),
      );

      const { ownerRole, adminRole, memberRole } =
        await service.createSystemRoles(undefined, 'org-1');

      expect(ownerRole.role_name).toBe(SystemRoles.Owner);
      expect(adminRole.role_name).toBe(SystemRoles.Admin);
      expect(memberRole.role_name).toBe(SystemRoles.Member);
      expect(prismaMock.orgRole.create).toHaveBeenCalledTimes(3);
      expect(auditLogServiceMock.record).not.toHaveBeenCalled();
    });
  });

  describe('hasOwnerOnlyPermissions', () => {
    it('returns true when one of the permission ids resolves to an owner-only key', async () => {
      prismaMock.permission.findMany.mockResolvedValue([
        { key: 'organization.read' },
        { key: 'organization.delete' },
      ]);

      await expect(
        service.hasOwnerOnlyPermissions(['perm-1', 'perm-2']),
      ).resolves.toBe(true);
    });

    it('returns false when none of the permission ids are owner-only', async () => {
      prismaMock.permission.findMany.mockResolvedValue([
        { key: 'organization.read' },
        { key: 'member.invite' },
      ]);

      await expect(
        service.hasOwnerOnlyPermissions(['perm-1', 'perm-2']),
      ).resolves.toBe(false);
    });
  });

  describe('getEffectivePermissionKeys', () => {
    it('returns just the role own permissions when it has no parent', async () => {
      prismaMock.orgRole.findUnique.mockResolvedValueOnce({
        parent_role_id: null,
        orgRolePermissions: [{ permissions: { key: 'member.invite' } }],
      });

      const permissions = await service.getEffectivePermissionKeys('role-1');
      expect(permissions).toEqual(new Set(['member.invite']));
    });

    it('unions permissions across a multi-level parent chain', async () => {
      prismaMock.orgRole.findUnique
        .mockResolvedValueOnce({
          parent_role_id: 'role-parent',
          orgRolePermissions: [{ permissions: { key: 'member.invite' } }],
        })
        .mockResolvedValueOnce({
          parent_role_id: 'role-grandparent',
          orgRolePermissions: [{ permissions: { key: 'organization.read' } }],
        })
        .mockResolvedValueOnce({
          parent_role_id: null,
          orgRolePermissions: [{ permissions: { key: 'role.create' } }],
        });

      const permissions = await service.getEffectivePermissionKeys('role-1');
      expect(permissions).toEqual(
        new Set(['member.invite', 'organization.read', 'role.create']),
      );
      expect(prismaMock.orgRole.findUnique).toHaveBeenCalledTimes(3);
    });

    it('terminates instead of looping forever on a cyclic parent chain', async () => {
      prismaMock.orgRole.findUnique
        .mockResolvedValueOnce({
          parent_role_id: 'role-2',
          orgRolePermissions: [{ permissions: { key: 'a' } }],
        })
        .mockResolvedValueOnce({
          parent_role_id: 'role-1',
          orgRolePermissions: [{ permissions: { key: 'b' } }],
        });

      const permissions = await service.getEffectivePermissionKeys('role-1');
      expect(permissions).toEqual(new Set(['a', 'b']));
      expect(prismaMock.orgRole.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('isUserAuthorized', () => {
    it('throws ForbiddenException when the user has no membership in the org', async () => {
      prismaMock.orgMembership.findUnique.mockResolvedValue(null);

      await expect(
        service.isUserAuthorized('user-1', 'org-1', 'organization.read'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when the effective permission set lacks the permission', async () => {
      prismaMock.orgMembership.findUnique.mockResolvedValue({
        orgRole_id: 'role-1',
      });
      prismaMock.orgRole.findUnique.mockResolvedValue({
        parent_role_id: null,
        orgRolePermissions: [{ permissions: { key: 'organization.read' } }],
      });

      await expect(
        service.isUserAuthorized('user-1', 'org-1', 'organization.delete'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns true when the effective permission set includes the permission', async () => {
      prismaMock.orgMembership.findUnique.mockResolvedValue({
        orgRole_id: 'role-1',
      });
      prismaMock.orgRole.findUnique.mockResolvedValue({
        parent_role_id: null,
        orgRolePermissions: [{ permissions: { key: 'organization.read' } }],
      });

      await expect(
        service.isUserAuthorized('user-1', 'org-1', 'organization.read'),
      ).resolves.toBe(true);
    });
  });

  describe('changeUserRole', () => {
    const adminId = 'admin-id';
    const memberId = 'member-id';
    const orgId = 'org-id';
    const orgRoleId = 'role-id';

    const nonOwnerRole = {
      is_system: false,
      role_name: 'Editor',
      orgRolePermissions: [],
    };

    const nonOwnerMember = {
      orgRole: { is_system: false, role_name: 'Member' },
    };

    it('throws ForbiddenException if adminId and memberId are the same', async () => {
      await expect(
        service.changeUserRole(adminId, adminId, orgId, orgRoleId),
      ).rejects.toThrow(
        new ForbiddenException(
          'UserRoleChangeError: User cannot change own role',
        ),
      );

      expect(prismaMock.orgRole.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.orgMembership.findUnique).not.toHaveBeenCalled();
    });

    it('scopes the role lookup to the target organization', async () => {
      prismaMock.orgRole.findFirst.mockResolvedValue(nonOwnerRole);
      prismaMock.orgMembership.findUnique.mockResolvedValue(nonOwnerMember);
      prismaMock.orgMembership.update.mockResolvedValue({});

      await service.changeUserRole(adminId, memberId, orgId, orgRoleId);

      expect(prismaMock.orgRole.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: orgRoleId, org_id: orgId },
        }),
      );
    });

    it('throws BadRequestException if the target role does not exist in this org', async () => {
      prismaMock.orgRole.findFirst.mockResolvedValue(null);

      await expect(
        service.changeUserRole(adminId, memberId, orgId, orgRoleId),
      ).rejects.toThrow(new BadRequestException('Role not found'));

      expect(prismaMock.orgMembership.findUnique).not.toHaveBeenCalled();
    });

    it('throws BadRequestException if the member does not exist', async () => {
      prismaMock.orgRole.findFirst.mockResolvedValue(nonOwnerRole);
      prismaMock.orgMembership.findUnique.mockResolvedValue(null);

      await expect(
        service.changeUserRole(adminId, memberId, orgId, orgRoleId),
      ).rejects.toThrow(new BadRequestException('User not found'));
    });

    it('throws ForbiddenException if trying to assign the owner role to another member', async () => {
      prismaMock.orgRole.findFirst.mockResolvedValue({
        is_system: true,
        role_name: SystemRoles.Owner,
        orgRolePermissions: [],
      });
      prismaMock.orgMembership.findUnique.mockResolvedValue(nonOwnerMember);

      await expect(
        service.changeUserRole(adminId, memberId, orgId, orgRoleId),
      ).rejects.toThrow(
        new ForbiddenException(
          'Cannot grant owner permissions using this api. Use dedicated ownership transfer API',
        ),
      );

      expect(prismaMock.orgMembership.update).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException if trying to change the role of an existing owner', async () => {
      prismaMock.orgRole.findFirst.mockResolvedValue(nonOwnerRole);
      prismaMock.orgMembership.findUnique.mockResolvedValue({
        orgRole: { is_system: true, role_name: SystemRoles.Owner },
      });

      await expect(
        service.changeUserRole(adminId, memberId, orgId, orgRoleId),
      ).rejects.toThrow(
        new ForbiddenException(
          'Changing the role of organization owner is forbidden',
        ),
      );

      expect(prismaMock.orgMembership.update).not.toHaveBeenCalled();
    });

    it('updates the role and returns a success message on the happy path', async () => {
      prismaMock.orgRole.findFirst.mockResolvedValue(nonOwnerRole);
      prismaMock.orgMembership.findUnique.mockResolvedValue(nonOwnerMember);
      prismaMock.orgMembership.update.mockResolvedValue({});

      const result = await service.changeUserRole(
        adminId,
        memberId,
        orgId,
        orgRoleId,
      );

      expect(prismaMock.orgMembership.update).toHaveBeenCalledWith({
        where: { user_id_org_id: { user_id: memberId, org_id: orgId } },
        data: { orgRole_id: orgRoleId },
      });
      expect(result).toEqual({ message: 'Role changed successfully' });
      expect(auditLogServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.ORG_MEMBER_ROLE_CHANGED,
          actorUserId: adminId,
          orgId,
          targetId: memberId,
        }),
      );
    });

    it('propagates unexpected errors from the update call', async () => {
      prismaMock.orgRole.findFirst.mockResolvedValue(nonOwnerRole);
      prismaMock.orgMembership.findUnique.mockResolvedValue(nonOwnerMember);
      const dbError = new Error('connection lost');
      prismaMock.orgMembership.update.mockRejectedValue(dbError);

      await expect(
        service.changeUserRole(adminId, memberId, orgId, orgRoleId),
      ).rejects.toThrow(dbError);
    });
  });

  describe('setRoleParent', () => {
    it('throws BadRequestException when a role is set as its own parent', async () => {
      await expect(
        service.setRoleParent('org-1', 'role-1', 'role-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the parent role is not found in this org', async () => {
      prismaMock.orgRole.findFirst.mockResolvedValue(null);

      await expect(
        service.setRoleParent('org-1', 'role-1', 'role-parent'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when assigning the parent would create a cycle', async () => {
      prismaMock.orgRole.findFirst.mockResolvedValue({ id: 'role-parent' });
      // walking up from role-parent reaches role-1, which is the role being updated
      prismaMock.orgRole.findUnique
        .mockResolvedValueOnce({ parent_role_id: 'role-1' })
        .mockResolvedValueOnce({ parent_role_id: null });

      await expect(
        service.setRoleParent('org-1', 'role-1', 'role-parent'),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns the parent role id when valid', async () => {
      prismaMock.orgRole.findFirst.mockResolvedValue({ id: 'role-parent' });
      prismaMock.orgRole.findUnique.mockResolvedValueOnce({
        parent_role_id: null,
      });

      await expect(
        service.setRoleParent('org-1', 'role-1', 'role-parent'),
      ).resolves.toBe('role-parent');
    });
  });

  describe('updateRole', () => {
    it('throws BadRequestException when the role does not exist in this org', async () => {
      prismaMock.orgRole.findFirst.mockResolvedValue(null);

      await expect(
        service.updateRole('org-1', 'role-1', { roleName: 'New name' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when trying to modify a system role', async () => {
      prismaMock.orgRole.findFirst.mockResolvedValue({ is_system: true });

      await expect(
        service.updateRole('org-1', 'role-1', { roleName: 'New name' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when granting owner-only permissions', async () => {
      prismaMock.orgRole.findFirst.mockResolvedValue({ is_system: false });
      prismaMock.permission.findMany.mockResolvedValue([
        { key: 'organization.delete' },
      ]);

      await expect(
        service.updateRole('org-1', 'role-1', { permissionIds: ['perm-1'] }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('replaces permissions and updates the role on the happy path', async () => {
      prismaMock.orgRole.findFirst.mockResolvedValue({ is_system: false });
      prismaMock.permission.findMany.mockResolvedValue([
        { key: 'member.invite' },
      ]);
      txMock.orgRole.update.mockResolvedValue({ id: 'role-1' });

      await service.updateRole(
        'org-1',
        'role-1',
        { roleName: 'Editors', permissionIds: ['perm-1'] },
        'admin-1',
      );

      expect(txMock.orgRolePermission.deleteMany).toHaveBeenCalledWith({
        where: { role_id: 'role-1' },
      });
      expect(txMock.orgRolePermission.createMany).toHaveBeenCalledWith({
        data: [{ role_id: 'role-1', permission_id: 'perm-1' }],
      });
      expect(txMock.orgRole.update).toHaveBeenCalledWith({
        where: { id: 'role-1' },
        data: { role_name: 'Editors', parent_role_id: undefined },
      });
      expect(auditLogServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.ORG_ROLE_UPDATED,
          actorUserId: 'admin-1',
          orgId: 'org-1',
          targetId: 'role-1',
        }),
      );
    });

    it('does not emit an audit event when no actor is given (internal calls)', async () => {
      prismaMock.orgRole.findFirst.mockResolvedValue({ is_system: false });
      txMock.orgRole.update.mockResolvedValue({ id: 'role-1' });

      await service.updateRole('org-1', 'role-1', { roleName: 'Editors' });

      expect(auditLogServiceMock.record).not.toHaveBeenCalled();
    });
  });

  describe('deleteRole', () => {
    it('throws BadRequestException when the role does not exist in this org', async () => {
      prismaMock.orgRole.findFirst.mockResolvedValue(null);

      await expect(service.deleteRole('org-1', 'role-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws ForbiddenException when trying to delete a system role', async () => {
      prismaMock.orgRole.findFirst.mockResolvedValue({ is_system: true });

      await expect(service.deleteRole('org-1', 'role-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws BadRequestException when members still hold the role', async () => {
      prismaMock.orgRole.findFirst.mockResolvedValue({ is_system: false });
      prismaMock.orgMembership.count.mockResolvedValue(1);
      prismaMock.orgRole.count.mockResolvedValue(0);

      await expect(service.deleteRole('org-1', 'role-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prismaMock.orgRole.delete).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when other roles inherit from it', async () => {
      prismaMock.orgRole.findFirst.mockResolvedValue({ is_system: false });
      prismaMock.orgMembership.count.mockResolvedValue(0);
      prismaMock.orgRole.count.mockResolvedValue(1);

      await expect(service.deleteRole('org-1', 'role-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prismaMock.orgRole.delete).not.toHaveBeenCalled();
    });

    it('deletes the role on the happy path and records an audit event', async () => {
      prismaMock.orgRole.findFirst.mockResolvedValue({
        is_system: false,
        role_name: 'Editors',
      });
      prismaMock.orgMembership.count.mockResolvedValue(0);
      prismaMock.orgRole.count.mockResolvedValue(0);

      await expect(
        service.deleteRole('org-1', 'role-1', 'admin-1'),
      ).resolves.toEqual({ message: 'Role deleted successfully' });
      expect(prismaMock.orgRole.delete).toHaveBeenCalledWith({
        where: { id: 'role-1' },
      });
      expect(auditLogServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.ORG_ROLE_DELETED,
          actorUserId: 'admin-1',
          orgId: 'org-1',
          targetId: 'role-1',
        }),
      );
    });
  });
});
