import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class PaginationQueryParamsDto {
  // Query params always arrive as strings - Type() coerces before validation runs
  @Type(() => Number)
  @Min(1)
  @IsInt()
  @IsOptional()
  page?: number;

  @Type(() => Number)
  @Min(0)
  @IsInt()
  @IsOptional()
  limit?: number;
}
