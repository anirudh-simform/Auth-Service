import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';
import { OrganizationIdParam } from './organization-id-param-dto';

export class RoleIdParamDto extends OrganizationIdParam {
  @ApiProperty({ description: 'id of the role' })
  @IsUUID('7')
  @IsString()
  roleId: string;
}
