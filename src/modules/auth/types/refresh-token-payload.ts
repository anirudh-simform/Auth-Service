import z from 'zod';

export const RefreshTokenPayloadSchema = z.object({
  sub: z.number(),
  email: z.email(),
  type: z.literal('refresh'),
});
export type RefreshTokenPayload = z.infer<typeof RefreshTokenPayloadSchema>;
