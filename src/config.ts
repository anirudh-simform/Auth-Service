import * as z from 'zod';

import 'dotenv/config';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string(),
  MAGIC_LINK_EXPIRY: z.coerce.number().min(1),
  // SMTP
  SMTP_HOST: z.string(),
  SMTP_PORT: z.coerce.number(),
  SMTP_USER: z.string(),
  SMTP_PASS: z.string(),

  EMAIL_VERIFICATION_BASE_URL: z.string(),
});

const config = envSchema.parse(process.env);
export { config };
