import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class RevokeSessionParamsDto {
  @IsUUID('7')
  @IsNotEmpty()
  @IsString()
  sessionId: string;
}
