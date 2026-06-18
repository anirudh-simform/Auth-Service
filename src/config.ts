import * as z from 'zod';
const envSchema = z.object({
  DATABASE_URL: z.string(),
  MAGIC_LINK_EXPIRY: z.coerce.number().min(1),
});

const config = envSchema.parse(process.env);
export { config };
