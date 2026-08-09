import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SystemRoles } from './constants/system-roles.constant';
import { Prisma } from 'src/generated/prisma/client';
import { SystemPermissions } from './constants/system-permissions.constant';
import { OWNER_ONLY_PERMISSIONS } from './constants/owner-only-permissions.constant';
import { OrgRole } from 'src/generated/prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditEventType } from '../audit-log/constants/audit-event-types.constant';

@Injectable()
export class AuthorizationService {
  private readonly logger = new Logger(AuthorizationService.name);
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}
  /* Creates system roles and associated permissions */
  async createSystemRoles(
    tx: Prisma.TransactionClient = this.prismaService,
    orgId: string,
  ) {
    const createOwnerRole = this.createSystemRole(
      orgId,
      SystemRoles.Owner,
      await this.getSystemRolePermissionIds(SystemRoles.Owner),
      tx,
    );

    const createAdminRole = this.createSystemRole(
      orgId,
      SystemRoles.Admin,
      await this.getSystemRolePermissionIds(SystemRoles.Admin),
      tx,
    );

    const createMemberRole = this.createSystemRole(
      orgId,
      SystemRoles.Member,
      await this.getSystemRolePermissionIds(SystemRoles.Member),
      tx,
    );

    const [ownerRole, adminRole, memberRole] = await Promise.all([
      createOwnerRole,
      createAdminRole,
      createMemberRole,
    ]);

    return { ownerRole, adminRole, memberRole };
  }

  /**
   * Bootstraps a reserved system role (Owner/Admin/Member) for a new org.
   * Bypasses the reserved-name check in createRole() - that check exists to
   * stop admins from shadowing a system role via the public API, not to
   * block the system itself from provisioning them.
   */
  private async createSystemRole(
    orgId: string,
    roleName: SystemRoles,
    permissionIds: string[],
    tx: Prisma.TransactionClient = this.prismaService,
  ) {
    return await tx.orgRole.create({
      data: {
        org_id: orgId,
        role_name: roleName,
        is_system: true,
        orgRolePermissions: {
          createMany: {
            data: permissionIds.map((permissionId) => ({
              permission_id: permissionId,
            })),
          },
        },
      },
    });
  }

  async createRole(
    orgId: string,
    roleName: string,
    permissionIds: string[],
    tx: Prisma.TransactionClient = this.prismaService,
    parentRoleId?: string,
    actorUserId?: string,
  ) {
    if (await this.hasOwnerOnlyPermissions(permissionIds)) {
      throw new ForbiddenException(
        'RoleCreationError: Cannot create role with owner permissions. Only one owner is allowed',
      );
    }

    if (this.isSystemRole(roleName)) {
      throw new ForbiddenException(
        'RoleCreationError: Cannot create a role with the same name as reserved system role',
      );
    }

    if (parentRoleId !== undefined) {
      const parentRole = await tx.orgRole.findFirst({
        where: { id: parentRoleId, org_id: orgId },
      });
      if (!parentRole) {
        throw new BadRequestException(
          'RoleCreationError: Parent role not found in this organization',
        );
      }
    }

    const role = await tx.orgRole.create({
      data: {
        org_id: orgId,
        role_name: roleName,
        is_system: this.isSystemRole(roleName),
        parent_role_id: parentRoleId,
        orgRolePermissions: {
          createMany: {
            data: permissionIds.map((permissionId) => ({
              permission_id: permissionId,
            })),
          },
        },
      },
    });

    // actorUserId is omitted for system roles created internally during org setup
    if (actorUserId !== undefined) {
      await this.auditLogService.record({
        eventType: AuditEventType.ORG_ROLE_CREATED,
        actorUserId,
        orgId,
        targetType: 'OrgRole',
        targetId: role.id,
        metadata: { roleName, permissionIds, parentRoleId: parentRoleId ?? null },
      });
    }

    return role;
  }

  async hasOwnerOnlyPermissions(permissionIds: string[]) {
    const permissions = await this.prismaService.permission.findMany({
      where: { id: { in: permissionIds } },
      select: { key: true },
    });

    return permissions.some((permission) => {
      const permissionKey = permission.key as SystemPermissions;
      return OWNER_ONLY_PERMISSIONS.includes(permissionKey);
    });
  }

  async getSystemRolePermissionIds(role: SystemRoles) {
    switch (role) {
      case SystemRoles.Owner: {
        const permissionIds = await this.prismaService.permission.findMany({
          select: {
            id: true,
          },
        });
        return permissionIds.map((permissionId) => permissionId.id);
      }
      case SystemRoles.Admin: {
        const permissionIds = await this.prismaService.permission.findMany({
          where: {
            key: {
              notIn: ['organization.transfer_ownership', 'organization.delete'],
            },
          },
          select: {
            id: true,
          },
        });
        return permissionIds.map((permissionId) => permissionId.id);
      }
      case SystemRoles.Member: {
        const permissionIds = await this.prismaService.permission.findMany({
          where: {
            key: {
              in: ['organization.read'],
            },
          },
          select: {
            id: true,
          },
        });
        return permissionIds.map((permissionId) => permissionId.id);
      }
    }
  }

  /**
   * Walks the parent_role_id chain (own permissions + every ancestor's),
   * with a visited-set guard so a corrupted/cyclic chain can't loop forever.
   * Scoped to `orgId` defensively: every writer of parent_role_id already
   * validates the parent belongs to the same org before persisting it, but
   * scoping the traversal too means a future writer that skips that check
   * still can't create a cross-org privilege-escalation path silently.
   */
  async getEffectivePermissionKeys(
    orgRoleId: string,
    orgId: string,
  ): Promise<Set<string>> {
    const permissionKeys = new Set<string>();
    const visitedRoleIds = new Set<string>();
    let currentRoleId: string | null = orgRoleId;

    while (currentRoleId !== null && !visitedRoleIds.has(currentRoleId)) {
      visitedRoleIds.add(currentRoleId);

      const role = await this.prismaService.orgRole.findFirst({
        where: { id: currentRoleId, org_id: orgId },
        select: {
          parent_role_id: true,
          orgRolePermissions: {
            select: { permissions: { select: { key: true } } },
          },
        },
      });

      if (!role) break;

      for (const orgRolePermission of role.orgRolePermissions) {
        permissionKeys.add(orgRolePermission.permissions.key);
      }

      currentRoleId = role.parent_role_id;
    }

    return permissionKeys;
  }

  async isUserAuthorized(userId: string, orgId: string, permissionKey: string) {
    const membership = await this.prismaService.orgMembership.findUnique({
      where: { user_id_org_id: { user_id: userId, org_id: orgId } },
      select: { orgRole_id: true },
    });

    if (!membership) {
      throw new ForbiddenException('This action is forbidden to you');
    }

    const effectivePermissionKeys = await this.getEffectivePermissionKeys(
      membership.orgRole_id,
      orgId,
    );

    if (!effectivePermissionKeys.has(permissionKey)) {
      throw new ForbiddenException('This action is forbidden to you');
    }

    return true;
  }

  isSystemRole(role: string) {
    if (Object.keys(SystemRoles).includes(role)) return true;
    return false;
  }

  isOwnerRole(orgRole: Pick<OrgRole, 'is_system' | 'role_name'>) {
    return orgRole.is_system && orgRole.role_name === SystemRoles.Owner;
  }

  async changeUserRole(
    adminId: string,
    memberId: string,
    orgId: string,
    orgRoleId: string,
    tx: Prisma.TransactionClient = this.prismaService,
  ) {
    if (adminId === memberId)
      throw new ForbiddenException(
        'UserRoleChangeError: User cannot change own role',
      );
    const orgRole = await this.prismaService.orgRole.findFirst({
      where: { id: orgRoleId, org_id: orgId },
      include: {
        orgRolePermissions: {
          select: { permissions: { select: { name: true } } },
        },
      },
    });

    if (!orgRole) {
      throw new BadRequestException('Role not found');
    }

    const member = await this.prismaService.orgMembership.findUnique({
      where: { user_id_org_id: { user_id: memberId, org_id: orgId } },
      select: {
        orgRole_id: true,
        orgRole: { select: { is_system: true, role_name: true } },
      },
    });

    if (!member) throw new BadRequestException('User not found');

    if (this.isOwnerRole(orgRole)) {
      throw new ForbiddenException(
        'Cannot grant owner permissions using this api. Use dedicated ownership transfer API',
      );
    }

    if (this.isOwnerRole(member.orgRole)) {
      throw new ForbiddenException(
        'Changing the role of organization owner is forbidden',
      );
    }

    try {
      await tx.orgMembership.update({
        where: { user_id_org_id: { user_id: memberId, org_id: orgId } },
        data: {
          orgRole_id: orgRoleId,
        },
      });

      await this.auditLogService.record({
        eventType: AuditEventType.ORG_MEMBER_ROLE_CHANGED,
        actorUserId: adminId,
        orgId,
        targetType: 'User',
        targetId: memberId,
        metadata: { previousOrgRoleId: member.orgRole_id, newOrgRoleId: orgRoleId },
      });

      return { message: 'Role changed successfully' };
    } catch (error: unknown) {
      if (
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      this.logger.error(
        'UserRoleChangeError',
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Walks the ancestor chain starting at `candidateParentId` and rejects if
   * `roleId` appears in it - that would make `roleId` its own descendant's ancestor.
   * Scoped to `orgId` for the same defense-in-depth reason as getEffectivePermissionKeys.
   */
  private async wouldCreateCycle(
    candidateParentId: string,
    roleId: string,
    orgId: string,
  ) {
    const visitedRoleIds = new Set<string>();
    let currentRoleId: string | null = candidateParentId;

    while (currentRoleId !== null) {
      if (currentRoleId === roleId) return true;
      if (visitedRoleIds.has(currentRoleId)) return true;
      visitedRoleIds.add(currentRoleId);

      const role: { parent_role_id: string | null } | null =
        await this.prismaService.orgRole.findFirst({
          where: { id: currentRoleId, org_id: orgId },
          select: { parent_role_id: true },
        });

      if (!role) return false;
      currentRoleId = role.parent_role_id;
    }

    return false;
  }

  async setRoleParent(orgId: string, roleId: string, parentRoleId: string) {
    if (roleId === parentRoleId) {
      throw new BadRequestException(
        'RoleUpdateError: A role cannot be its own parent',
      );
    }

    const parentRole = await this.prismaService.orgRole.findFirst({
      where: { id: parentRoleId, org_id: orgId },
    });

    if (!parentRole) {
      throw new BadRequestException(
        'RoleUpdateError: Parent role not found in this organization',
      );
    }

    if (await this.wouldCreateCycle(parentRoleId, roleId, orgId)) {
      throw new BadRequestException(
        'RoleUpdateError: Assigning this parent would create a role hierarchy cycle',
      );
    }

    return parentRoleId;
  }

  async updateRole(
    orgId: string,
    roleId: string,
    updates: {
      roleName?: string;
      permissionIds?: string[];
      parentRoleId?: string;
    },
    actorUserId?: string,
  ) {
    const role = await this.prismaService.orgRole.findFirst({
      where: { id: roleId, org_id: orgId },
    });

    if (!role) {
      throw new BadRequestException('Role not found');
    }

    if (role.is_system) {
      throw new ForbiddenException(
        'RoleUpdateError: Cannot modify a system role',
      );
    }

    if (
      updates.permissionIds !== undefined &&
      (await this.hasOwnerOnlyPermissions(updates.permissionIds))
    ) {
      throw new ForbiddenException(
        'RoleUpdateError: Cannot grant owner-only permissions to a role. Only one owner is allowed',
      );
    }

    let parentRoleId: string | undefined;
    if (updates.parentRoleId !== undefined) {
      parentRoleId = await this.setRoleParent(
        orgId,
        roleId,
        updates.parentRoleId,
      );
    }

    const updatedRole = await this.prismaService.$transaction(async (tx) => {
      if (updates.permissionIds !== undefined) {
        await tx.orgRolePermission.deleteMany({ where: { role_id: roleId } });
        await tx.orgRolePermission.createMany({
          data: updates.permissionIds.map((permissionId) => ({
            role_id: roleId,
            permission_id: permissionId,
          })),
        });
      }

      return await tx.orgRole.update({
        where: { id: roleId },
        data: {
          role_name: updates.roleName,
          parent_role_id: parentRoleId,
        },
      });
    });

    if (actorUserId !== undefined) {
      await this.auditLogService.record({
        eventType: AuditEventType.ORG_ROLE_UPDATED,
        actorUserId,
        orgId,
        targetType: 'OrgRole',
        targetId: roleId,
        metadata: { ...updates },
      });
    }

    return updatedRole;
  }

  async deleteRole(orgId: string, roleId: string, actorUserId?: string) {
    const role = await this.prismaService.orgRole.findFirst({
      where: { id: roleId, org_id: orgId },
    });

    if (!role) {
      throw new BadRequestException('Role not found');
    }

    if (role.is_system) {
      throw new ForbiddenException(
        'RoleDeletionError: Cannot delete a system role',
      );
    }

    const [memberCount, childRoleCount] = await Promise.all([
      this.prismaService.orgMembership.count({ where: { orgRole_id: roleId } }),
      this.prismaService.orgRole.count({
        where: { parent_role_id: roleId },
      }),
    ]);

    if (memberCount > 0) {
      throw new BadRequestException(
        'RoleDeletionError: Cannot delete a role that is still assigned to members',
      );
    }

    if (childRoleCount > 0) {
      throw new BadRequestException(
        'RoleDeletionError: Cannot delete a role that other roles inherit from',
      );
    }

    await this.prismaService.orgRole.delete({ where: { id: roleId } });

    if (actorUserId !== undefined) {
      await this.auditLogService.record({
        eventType: AuditEventType.ORG_ROLE_DELETED,
        actorUserId,
        orgId,
        targetType: 'OrgRole',
        targetId: roleId,
        metadata: { roleName: role.role_name },
      });
    }

    return { message: 'Role deleted successfully' };
  }
}
