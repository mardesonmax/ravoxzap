import { z } from 'zod';

export const apiKeyStatusSchema = z.enum(['ACTIVE', 'REVOKED']);

export const createApiKeySchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().min(2),
});

export type ApiKeyStatus = z.infer<typeof apiKeyStatusSchema>;
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
