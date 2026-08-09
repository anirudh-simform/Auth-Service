import { IsString, IsUUID } from 'class-validator';

export class ChangeUserRolePayloadDto {
  @IsUUID('7')
  @IsString()
  roleId: string;
}
