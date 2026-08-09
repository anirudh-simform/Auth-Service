import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateOrganizationDto {
  @ApiProperty({ description: 'Name of the organization to create' })
  @IsString()
  orgName: string;
}
