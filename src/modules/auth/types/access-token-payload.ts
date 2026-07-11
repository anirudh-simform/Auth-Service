import z from 'zod';

export const AccessTokenPayloadSchema = z.object({
  sid: z.uuidv7(),
  sub: z.uuidv7(),
  email: z.email(),
});
export type AccessTokenPayload = z.infer<typeof AccessTokenPayloadSchema>;
