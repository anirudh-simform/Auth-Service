import { IsInt, IsOptional, Min } from 'class-validator';

export class PaginationQueryParamsDto {
  @Min(1)
  @IsInt()
  @IsOptional()
  page?: number;

  @Min(0)
  @IsInt()
  @IsOptional()
  limit?: number;
}
