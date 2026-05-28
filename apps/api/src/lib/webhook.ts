import { createHmac, randomBytes } from 'node:crypto';

import type { WebhookEvent as PrismaWebhookEvent } from '@ravoxzap/database';
import type { WebhookEvent } from '@ravoxzap/shared';

const eventToDbMap: Record<WebhookEvent, PrismaWebhookEvent> = {
  'instance.connected': 'INSTANCE_CONNECTED',
  'instance.disconnected': 'INSTANCE_DISCONNECTED',
  'message.received': 'MESSAGE_RECEIVED',
  'message.sent': 'MESSAGE_SENT',
  'message.delivered': 'MESSAGE_DELIVERED',
  'message.read': 'MESSAGE_READ',
  'message.failed': 'MESSAGE_FAILED',
  'chat.presence': 'CHAT_PRESENCE',
  'qr.updated': 'QR_UPDATED',
};

const dbToEventMap = Object.fromEntries(
  Object.entries(eventToDbMap).map(([event, dbEvent]) => [dbEvent, event]),
) as Record<PrismaWebhookEvent, WebhookEvent>;

export function webhookEventToDb(event: WebhookEvent): PrismaWebhookEvent {
  return eventToDbMap[event];
}

export function webhookEventFromDb(event: PrismaWebhookEvent): WebhookEvent {
  return dbToEventMap[event];
}

export function createWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('base64url')}`;
}

export function signWebhookPayload(payload: unknown, secret: string): string {
  return createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}
