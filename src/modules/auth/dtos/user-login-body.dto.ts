import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class UserLoginBodyDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
