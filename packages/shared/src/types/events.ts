import type { WebhookEvent } from '../schemas/webhook.js';

export type RavoxWebhookPayload<TData = unknown> = {
  event: WebhookEvent;
  instanceId?: string;
  organizationId: string;
  timestamp: string;
  data: TData;
};

export type SendMessageJob = {
  messageId: string;
  instanceId: string;
  organizationId: string;
  to: string;
  body?: string;
  type?: 'TEXT' | 'IMAGE' | 'AUDIO' | 'DOCUMENT' | 'VIDEO';
  media?: {
    path: string;
    mimeType: string;
    fileName: string;
  };
};

export type ConnectInstanceJob = {
  instanceId: string;
  organizationId: string;
  clearSession?: boolean;
};

export type DispatchWebhookJob = {
  deliveryId: string;
  webhookId: string;
  payload: RavoxWebhookPayload;
};
