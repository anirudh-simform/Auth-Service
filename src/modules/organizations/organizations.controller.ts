import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { AuthGuard } from '../auth/guards/auth/auth.guard';
import { AuthUser } from '../auth/decorators/auth-user.decorator';
import { type User } from 'src/generated/prisma/client';
import { AddMemberToOrgPayloadDto } from './dtos/add-member-to-org-payload.dto';
import { OrganizationIdParam } from './dtos/organization-id-param-dto';
import { TransferOrgOwnershipPayloadDto } from './dtos/transfer-org-ownership-payload.dto';
import { AuthorizationService } from '../authorization/authorization.service';
import { CreateRolePayloadDto } from './dtos/create-role-payload.dto';
import {
  Permission,
  SystemPermissions,
} from '../authorization/constants/system-permissions.constant';
import { AuthorizationGuard } from '../authorization/guards/authorization.guard';
import { ChangeUserRoleParamsDto } from './dtos/change-user-role-params.dto';
import { ChangeUserRolePayloadDto } from './dtos/change-user-role-payload.dto';
import { CreateOrganizationDto } from './dtos/create-organization.dto';
import { RoleIdParamDto } from './dtos/role-id-param.dto';
import { UpdateRolePayloadDto } from './dtos/update-role-payload.dto';

@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly organizationService: OrganizationsService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  @Post()
  @UseGuards(AuthGuard)
  async createOrganization(
    @AuthUser() user: User,
    @Body() payload: CreateOrganizationDto,
  ) {
    await this.organizationService.createOrganization(user, payload.orgName);
  }

  @Post(':organizationId/members')
  @UseGuards(AuthGuard, AuthorizationGuard)
  @Permission(SystemPermissions['member.invite'])
  async addMemberToOrg(
    @AuthUser() user: User,
    @Param() params: OrganizationIdParam,
    @Body() payload: AddMemberToOrgPayloadDto,
  ) {
    await this.organizationService.addUserToOrg(
      params.organizationId,
      payload.userId,
      payload.roleId,
      undefined,
      user.id,
    );
  }

  @Delete(':organizationId/members/:userId')
  @UseGuards(AuthGuard, AuthorizationGuard)
  @Permission(SystemPermissions['member.remove'])
  async removeMember(
    @AuthUser() user: User,
    @Param() params: ChangeUserRoleParamsDto,
  ) {
    return await this.organizationService.removeMember(
      params.organizationId,
      params.userId,
      user.id,
    );
  }

  @Get(':organizationId/members')
  @UseGuards(AuthGuard, AuthorizationGuard)
  @Permission(SystemPermissions['organization.read'])
  async listMembers(@Param() params: OrganizationIdParam) {
    return await this.organizationService.listMembers(
      params.organizationId,
    );
  }

  @Post(':organizationId/transfer-ownership')
  @UseGuards(AuthGuard, AuthorizationGuard)
  @Permission(SystemPermissions['organization.transfer_ownership'])
  async transferOrgOwnership(
    @AuthUser() user: User,
    @Param() params: OrganizationIdParam,
    @Body() payload: TransferOrgOwnershipPayloadDto,
  ) {
    await this.organizationService.transferOrgOwnership(
      params.organizationId,
      payload.tranfereeId,
      user,
      payload.transferorReplacementOrgRoleId,
    );
  }

  @Get(':organizationId/roles')
  @UseGuards(AuthGuard, AuthorizationGuard)
  @Permission(SystemPermissions['organization.read'])
  async listRoles(@Param() params: OrganizationIdParam) {
    return await this.organizationService.listRoles(params.organizationId);
  }

  @Post(':organizationId/role')
  @UseGuards(AuthGuard, AuthorizationGuard)
  @Permission(SystemPermissions['role.create'])
  async createRole(
    @AuthUser() user: User,
    @Param() params: OrganizationIdParam,
    @Body() payload: CreateRolePayloadDto,
  ) {
    return await this.authorizationService.createRole(
      params.organizationId,
      payload.roleName,
      payload.permissionIds,
      undefined,
      payload.parentRoleId,
      user.id,
    );
  }

  @Patch(':organizationId/roles/:roleId')
  @UseGuards(AuthGuard, AuthorizationGuard)
  @Permission(SystemPermissions['role.update'])
  async updateRole(
    @AuthUser() user: User,
    @Param() params: RoleIdParamDto,
    @Body() payload: UpdateRolePayloadDto,
  ) {
    return await this.authorizationService.updateRole(
      params.organizationId,
      params.roleId,
      payload,
      user.id,
    );
  }

  @Delete(':organizationId/roles/:roleId')
  @UseGuards(AuthGuard, AuthorizationGuard)
  @Permission(SystemPermissions['role.delete'])
  async deleteRole(@AuthUser() user: User, @Param() params: RoleIdParamDto) {
    return await this.authorizationService.deleteRole(
      params.organizationId,
      params.roleId,
      user.id,
    );
  }

  @Patch(':organizationId/users/:userId')
  @UseGuards(AuthGuard, AuthorizationGuard)
  @Permission(SystemPermissions['member.role.update'])
  async updateUserRole(
    @AuthUser() user: User,
    @Param() params: ChangeUserRoleParamsDto,
    @Body() payload: ChangeUserRolePayloadDto,
  ) {
    return await this.authorizationService.changeUserRole(
      user.id,
      params.userId,
      params.organizationId,
      payload.roleId,
    );
  }
}
