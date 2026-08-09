import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class AddMemberToOrgParamDto {
  @ApiProperty({ description: 'ID of the organization' })
  @IsUUID('7')
  @IsNotEmpty()
  organizationId: string;
}
