import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class UpdateRolePayloadDto {
  @ApiPropertyOptional({ description: 'New name for the role' })
  @IsOptional()
  @MinLength(1)
  @IsString()
  roleName?: string;

  @ApiPropertyOptional({
    description: 'Full replacement list of permission ids for the role',
  })
  @IsOptional()
  @IsUUID(7, { each: true })
  @IsString({ each: true })
  permissionIds?: string[];

  @ApiPropertyOptional({
    description: 'Id of the role this role should inherit permissions from',
  })
  @IsOptional()
  @IsUUID(7)
  @IsString()
  parentRoleId?: string;
}
