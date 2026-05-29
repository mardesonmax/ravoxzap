import { z } from 'zod';

export const messageTypeSchema = z.enum([
  'TEXT',
  'IMAGE',
  'AUDIO',
  'DOCUMENT',
  'VIDEO',
  'STICKER',
  'UNKNOWN',
]);

export const messageStatusSchema = z.enum([
  'QUEUED',
  'SENT',
  'DELIVERED',
  'READ',
  'FAILED',
  'RECEIVED',
]);

export const sendTextMessageSchema = z.object({
  instanceId: z.string().min(1),
  to: z.string().min(6),
  body: z.string().min(1).max(4096),
});

export type MessageType = z.infer<typeof messageTypeSchema>;
export type MessageStatus = z.infer<typeof messageStatusSchema>;
export type SendTextMessageInput = z.infer<typeof sendTextMessageSchema>;
