import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaginationQueryParamsDto } from './pagination-query-params.dto';

describe('PaginationQueryParamsDto', () => {
  // Query params always arrive as strings over HTTP (e.g. ?page=1&limit=5) -
  // this must pass validation the same way class-transformer's plainToInstance
  // does inside Nest's ValidationPipe, not with pre-typed numbers.
  it('accepts string query values and coerces them to numbers', async () => {
    const dto = plainToInstance(PaginationQueryParamsDto, {
      page: '2',
      limit: '10',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(10);
  });

  it('allows both fields to be omitted', async () => {
    const dto = plainToInstance(PaginationQueryParamsDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a page below 1', async () => {
    const dto = plainToInstance(PaginationQueryParamsDto, { page: '0' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a non-numeric value', async () => {
    const dto = plainToInstance(PaginationQueryParamsDto, { limit: 'abc' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
