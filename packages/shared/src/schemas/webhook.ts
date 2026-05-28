import { z } from 'zod';

export const webhookEventSchema = z.enum([
  'instance.connected',
  'instance.disconnected',
  'message.received',
  'message.sent',
  'message.delivered',
  'message.read',
  'message.failed',
  'chat.presence',
  'qr.updated',
]);

export const createWebhookSchema = z.object({
  organizationId: z.string().min(1),
  instanceId: z.string().min(1).optional(),
  url: z.string().url(),
  events: z.array(webhookEventSchema).min(1),
});

export const updateWebhookSchema = z.object({
  url: z.string().url().optional(),
  active: z.boolean().optional(),
  events: z.array(webhookEventSchema).min(1).optional(),
});

export type WebhookEvent = z.infer<typeof webhookEventSchema>;
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;
