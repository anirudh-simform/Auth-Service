import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { AuthGuard } from '../auth/guards/auth/auth.guard';
import { AuthorizationGuard } from '../authorization/guards/authorization.guard';
import {
  Permission,
  SystemPermissions,
} from '../authorization/constants/system-permissions.constant';
import { OrganizationIdParam } from '../organizations/dtos/organization-id-param-dto';
import { PaginationQueryParamsDto } from 'src/common/dtos/pagination-query-params.dto';

@Controller()
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get('organizations/:organizationId/audit-logs')
  @UseGuards(AuthGuard, AuthorizationGuard)
  @Permission(SystemPermissions['audit.read'])
  async listForOrg(
    @Param() params: OrganizationIdParam,
    @Query() query: PaginationQueryParamsDto,
  ) {
    return await this.auditLogService.listForOrg(params.organizationId, {
      page: query.page,
      limit: query.limit,
    });
  }

  @Get('audit-logs/integrity')
  @UseGuards(AuthGuard)
  async verifyIntegrity() {
    return await this.auditLogService.verifyChainIntegrity();
  }
}
