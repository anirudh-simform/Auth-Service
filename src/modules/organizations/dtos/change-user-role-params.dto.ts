import { IsString, IsUUID } from 'class-validator';
import { OrganizationIdParam } from './organization-id-param-dto';
import { ApiProperty } from '@nestjs/swagger';

export class ChangeUserRoleParamsDto extends OrganizationIdParam {
  @ApiProperty({ description: 'id of the user whose role is to be changed' })
  @IsUUID('7')
  @IsString()
  userId: string;
}
