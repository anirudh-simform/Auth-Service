import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateRolePayloadDto {
  @MinLength(1)
  @IsString()
  roleName: string;

  @IsUUID(7, { each: true })
  @IsString({ each: true })
  permissionIds: string[];

  @ApiPropertyOptional({
    description: 'Id of the role this role should inherit permissions from',
  })
  @IsOptional()
  @IsUUID(7)
  @IsString()
  parentRoleId?: string;
}
