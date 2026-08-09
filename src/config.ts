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

  // JWT Secrets
  ACCESS_TOKEN_SECRET: z.string().default('1d'),
  REFRESH_TOKEN_SECRET: z.string(),

  REFRESH_TOKEN_EXPIRATION: z.string().default('7d'),

  // CORS - comma-separated allowlist of origins permitted to call this API
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),

  // Rate limiting (requests per THROTTLE_TTL_SECONDS window)
  THROTTLE_TTL_SECONDS: z.coerce.number().min(1).default(60),
  THROTTLE_LIMIT: z.coerce.number().min(1).default(100),
  // Stricter window applied to auth endpoints (login/register/refresh/verify-email)
  AUTH_THROTTLE_TTL_SECONDS: z.coerce.number().min(1).default(60),
  AUTH_THROTTLE_LIMIT: z.coerce.number().min(1).default(5),
});

const config = envSchema.parse(process.env);
export { config };
