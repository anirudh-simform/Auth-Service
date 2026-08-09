import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { User } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { Prisma } from 'src/generated/prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditEventType } from '../audit-log/constants/audit-event-types.constant';
@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);
  constructor(
    private readonly prismaService: PrismaService,
    private readonly authorizationService: AuthorizationService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async createOrganization(owner: User, orgName: string) {
    try {
      const org = await this.prismaService.$transaction(async (tx) => {
        /* create organization */
        const org = await tx.organization.create({ data: { name: orgName } });

        const roles = await this.authorizationService.createSystemRoles(
          tx,
          org.id,
        );
        await this.addUserToOrg(org.id, owner.id, roles.ownerRole.id, tx);

        return org;
      });

      await this.auditLogService.record({
        eventType: AuditEventType.ORG_CREATED,
        actorUserId: owner.id,
        orgId: org.id,
        targetType: 'Organization',
        targetId: org.id,
        metadata: { orgName },
      });
    } catch (error: unknown) {
      this.logger.error(
        'OraganizationCreationError: ',
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async transferOrgOwnership(
    orgId: string,
    transfereeId: string,
    transferor: User,
    transferorReplacementOrgRoleId?: string,
  ) {
    try {
      await this.prismaService.$transaction(async (tx) => {
        /* verify transferor currently holds the Owner role for this org */
        const transferorMembership = await tx.orgMembership.findUnique({
          where: {
            user_id_org_id: { user_id: transferor.id, org_id: orgId },
          },
          select: {
            orgRole_id: true,
            orgRole: { select: { is_system: true, role_name: true } },
          },
        });

        if (
          !transferorMembership ||
          !this.authorizationService.isOwnerRole(transferorMembership.orgRole)
        ) {
          throw new BadRequestException(
            'OwnerShipChangeError: Only the current owner can transfer ownership',
          );
        }

        /* Check if transferee exists */
        const transferee = await tx.orgMembership.findUnique({
          where: {
            user_id_org_id: {
              org_id: orgId,
              user_id: transfereeId,
            },
          },
        });

        if (!transferee) {
          throw new BadRequestException(
            'OwnerShipChangeError: Transferee does not exist',
          );
        }

        /* hand ownership to the transferee */
        await tx.orgMembership.update({
          where: {
            user_id_org_id: { user_id: transfereeId, org_id: orgId },
          },
          data: { orgRole_id: transferorMembership.orgRole_id },
        });

        if (transferorReplacementOrgRoleId !== undefined) {
          const replacementRole = await tx.orgRole.findFirst({
            where: { id: transferorReplacementOrgRoleId, org_id: orgId },
          });

          if (
            !replacementRole ||
            this.authorizationService.isOwnerRole(replacementRole)
          ) {
            throw new BadRequestException(
              'OwnerShipChangeError: Invalid replacement role for former owner',
            );
          }

          await tx.orgMembership.update({
            where: {
              user_id_org_id: { user_id: transferor.id, org_id: orgId },
            },
            data: { orgRole_id: transferorReplacementOrgRoleId },
          });
        } else {
          /* delete existing membership for transferor */
          await tx.orgMembership.delete({
            where: {
              user_id_org_id: { user_id: transferor.id, org_id: orgId },
            },
          });
        }
      });

      await this.auditLogService.record({
        eventType: AuditEventType.ORG_OWNERSHIP_TRANSFERRED,
        actorUserId: transferor.id,
        orgId,
        targetType: 'User',
        targetId: transfereeId,
        metadata: {
          previousOwnerId: transferor.id,
          replacementOrgRoleId: transferorReplacementOrgRoleId ?? null,
        },
      });
    } catch (error: unknown) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(error instanceof Error ? error.stack : undefined);
      throw new Error(
        'TransferOwnershipError: Error while transfering ownership',
      );
    }
  }

  async addUserToOrg(
    orgId: string,
    userId: string,
    orgRoleId: string,
    tx: Prisma.TransactionClient = this.prismaService,
    actorUserId?: string,
  ) {
    const role = await tx.orgRole.findFirst({
      where: { id: orgRoleId, org_id: orgId },
    });

    if (!role) {
      throw new BadRequestException(
        'OrgMembershipError: Role does not belong to this organization',
      );
    }

    const userOrgMembership = await tx.orgMembership.create({
      data: {
        orgRole_id: orgRoleId,
        user_id: userId,
        org_id: orgId,
      },
    });

    // actorUserId is omitted when a membership is created as a side-effect of
    // another audited action (e.g. the owner joining their own new org)
    if (actorUserId !== undefined) {
      await this.auditLogService.record({
        eventType: AuditEventType.ORG_MEMBER_ADDED,
        actorUserId,
        orgId,
        targetType: 'User',
        targetId: userId,
        metadata: { orgRoleId },
      });
    }

    return userOrgMembership;
  }

  async removeMember(orgId: string, userId: string, actorUserId: string) {
    const membership = await this.prismaService.orgMembership.findUnique({
      where: { user_id_org_id: { user_id: userId, org_id: orgId } },
      select: { orgRole: { select: { is_system: true, role_name: true } } },
    });

    if (!membership) {
      throw new BadRequestException('OrgMembershipError: User not found');
    }

    if (this.authorizationService.isOwnerRole(membership.orgRole)) {
      throw new BadRequestException(
        'OrgMembershipError: Cannot remove the organization owner. Transfer ownership first',
      );
    }

    await this.prismaService.orgMembership.delete({
      where: { user_id_org_id: { user_id: userId, org_id: orgId } },
    });

    await this.auditLogService.record({
      eventType: AuditEventType.ORG_MEMBER_REMOVED,
      actorUserId,
      orgId,
      targetType: 'User',
      targetId: userId,
    });

    return { message: 'Member removed successfully' };
  }

  async listRoles(orgId: string) {
    return await this.prismaService.orgRole.findMany({
      where: { org_id: orgId },
      select: {
        id: true,
        role_name: true,
        is_system: true,
        parent_role_id: true,
        orgRolePermissions: {
          select: { permissions: { select: { key: true, name: true } } },
        },
      },
    });
  }

  async listMembers(orgId: string) {
    return await this.prismaService.orgMembership.findMany({
      where: { org_id: orgId },
      select: {
        user: { select: { id: true, email: true } },
        orgRole: { select: { id: true, role_name: true } },
      },
    });
  }
}
