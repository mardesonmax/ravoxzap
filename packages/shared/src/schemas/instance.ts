import { z } from 'zod';

export const instanceStatusSchema = z.enum([
  'CREATED',
  'WAITING_QR',
  'CONNECTING',
  'CONNECTED',
  'DISCONNECTED',
  'RECONNECTING',
  'ERROR',
  'BANNED',
  'LOGGED_OUT',
]);

export const createInstanceSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().min(2),
});

export type InstanceStatus = z.infer<typeof instanceStatusSchema>;
export type CreateInstanceInput = z.infer<typeof createInstanceSchema>;
