import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyEmailQueryParamsDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}
