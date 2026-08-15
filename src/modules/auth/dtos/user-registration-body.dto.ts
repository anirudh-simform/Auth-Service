import { Equals, IsBoolean, IsEmail, IsString, MinLength } from 'class-validator';
export class UserRegistrationBodyDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;

  @IsBoolean()
  @Equals(true, {
    message: 'You must accept the terms and conditions to register',
  })
  termsAccepted: boolean;
}
