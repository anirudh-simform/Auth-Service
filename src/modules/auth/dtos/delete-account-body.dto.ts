import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class DeleteAccountBodyDto {
  // Optional: OAuth-only accounts have no password to re-confirm
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  password?: string;
}
