import { IsNotEmpty, IsString } from 'class-validator';

export class DeleteAccountBodyDto {
  @IsString()
  @IsNotEmpty()
  password: string;
}
