import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class AddMemberToOrgPayloadDto {
  @ApiProperty({ description: 'ID of the user to add' })
  @IsUUID('7')
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ description: 'Id of the role to assign to the user' })
  @IsUUID('7')
  @IsNotEmpty()
  roleId: string;
}
