import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class TransferOrgOwnershipPayloadDto {
  @ApiProperty({ description: 'User Id of the transferee' })
  @IsUUID()
  @IsString()
  tranfereeId: string;

  @ApiPropertyOptional({
    description: 'Org Role Id to be assigned to current owner',
  })
  @IsOptional()
  @IsUUID()
  @IsString()
  transferorReplacementOrgRoleId?: string;
}
