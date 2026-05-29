import { Queue, type ConnectionOptions } from 'bullmq';

import type {
  ConnectInstanceJob,
  DispatchWebhookJob,
  SendMessageJob,
  WhatsAppOperationJob,
} from '@ravoxzap/shared';

export type {
  ConnectInstanceJob,
  DispatchWebhookJob,
  SendMessageJob,
  WhatsAppOperationJob,
} from '@ravoxzap/shared';

export const queueNames = {
  connectInstance: 'connect-instance',
  disconnectInstance: 'disconnect-instance',
  sendMessage: 'send-message',
  dispatchWebhook: 'dispatch-webhook',
  whatsappOperation: 'whatsapp-operation',
} as const;

export type RavoxQueues = ReturnType<typeof createQueues>;

export function createQueueConnection(redisUrl: string) {
  const url = new URL(redisUrl);

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    maxRetriesPerRequest: null,
  } satisfies ConnectionOptions;
}

export function createQueues(redisUrl: string) {
  const connection = createQueueConnection(redisUrl);

  return {
    connection,
    connectInstance: new Queue<ConnectInstanceJob>(queueNames.connectInstance, { connection }),
    disconnectInstance: new Queue<ConnectInstanceJob>(queueNames.disconnectInstance, { connection }),
    sendMessage: new Queue<SendMessageJob>(queueNames.sendMessage, { connection }),
    dispatchWebhook: new Queue<DispatchWebhookJob>(queueNames.dispatchWebhook, { connection }),
    whatsappOperation: new Queue<WhatsAppOperationJob>(queueNames.whatsappOperation, { connection }),
  };
}

export async function closeQueues(queues: RavoxQueues) {
  await Promise.all([
    queues.connectInstance.close(),
    queues.disconnectInstance.close(),
    queues.sendMessage.close(),
    queues.dispatchWebhook.close(),
    queues.whatsappOperation.close(),
  ]);
}
