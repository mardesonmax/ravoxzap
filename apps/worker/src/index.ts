import { Queue, Worker } from 'bullmq';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { env } from '@ravoxzap/config';
import { prisma, type WebhookEvent as PrismaWebhookEvent } from '@ravoxzap/database';
import { createLogger } from '@ravoxzap/logger';
import {
  createQueueConnection,
  queueNames,
  type ConnectInstanceJob,
  type DispatchWebhookJob,
  type SendMessageJob,
} from '@ravoxzap/queue';
import { WhatsAppConnectionManager } from '@ravoxzap/whatsapp';

const logger = createLogger({ service: 'worker' });
const connection = createQueueConnection(env.REDIS_URL);
const whatsapp = new WhatsAppConnectionManager();
const repoRoot = path.resolve(process.cwd(), '../..');
const sessionStoragePath = path.isAbsolute(env.SESSION_STORAGE_PATH)
  ? env.SESSION_STORAGE_PATH
  : path.resolve(repoRoot, env.SESSION_STORAGE_PATH);
const mediaStoragePath = path.resolve(repoRoot, 'storage/media');

logger.info('Session storage configured', { sessionStoragePath });

const webhookEventToDbMap = {
  'instance.connected': 'INSTANCE_CONNECTED',
  'instance.disconnected': 'INSTANCE_DISCONNECTED',
  'message.received': 'MESSAGE_RECEIVED',
  'message.sent': 'MESSAGE_SENT',
  'message.delivered': 'MESSAGE_DELIVERED',
  'message.read': 'MESSAGE_READ',
  'message.failed': 'MESSAGE_FAILED',
  'chat.presence': 'CHAT_PRESENCE',
  'qr.updated': 'QR_UPDATED',
} satisfies Record<string, PrismaWebhookEvent>;

function signPayload(payload: unknown, secret: string): string {
  return createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}

function isDiscordWebhookUrl(url: string) {
  try {
    const parsed = new URL(url);
    return ['discord.com', 'discordapp.com'].includes(parsed.hostname) && parsed.pathname.startsWith('/api/webhooks/');
  } catch {
    return false;
  }
}

function buildWebhookBody(url: string, payload: DispatchWebhookJob['payload']) {
  if (!isDiscordWebhookUrl(url)) return payload;

  const data = payload.data && typeof payload.data === 'object'
    ? payload.data as Record<string, unknown>
    : {};
  const body = typeof data.body === 'string' && data.body.trim()
    ? `\nMensagem: ${data.body.trim()}`
    : '';
  const from = typeof data.from === 'string'
    ? `\nOrigem: ${data.from}`
    : '';
  const type = typeof data.type === 'string'
    ? `\nTipo: ${data.type}`
    : '';
  const content = `**RavoxZap**\nEvento: ${payload.event}${from}${type}${body}`;

  return {
    content: content.slice(0, 1900),
    embeds: [
      {
        title: payload.event,
        timestamp: payload.timestamp,
        color: 3062620,
      },
    ],
  };
}

function uniqueValues(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function getBrazilPhoneAliases(phone: string): string[] {
  const digits = phone.replace(/\D/g, '');
  if (!digits.startsWith('55')) return [digits];

  const aliases = new Set([digits]);
  const ddd = digits.slice(2, 4);
  const number = digits.slice(4);

  if (digits.length === 13 && number.startsWith('9')) {
    aliases.add(`55${ddd}${number.slice(1)}`);
  }

  if (digits.length === 12) {
    aliases.add(`55${ddd}9${number}`);
  }

  return [...aliases];
}

function getRemoteJidAliases(jids: string[]): string[] {
  const aliases = new Set<string>();

  for (const jid of jids) {
    aliases.add(jid);
    if (!jid.endsWith('@s.whatsapp.net')) continue;

    const phoneAliases = getBrazilPhoneAliases(jid.replace(/\D/g, ''));
    for (const phone of phoneAliases) {
      aliases.add(`${phone}@s.whatsapp.net`);
    }
  }

  return [...aliases];
}

async function logJob(input: {
  queueName: string;
  name: string;
  organizationId?: string;
  instanceId?: string;
  status: 'STARTED' | 'SUCCESS' | 'FAILED';
  payload?: unknown;
  error?: string;
}) {
  await prisma.jobLog.create({
    data: {
      queueName: input.queueName,
      name: input.name,
      organizationId: input.organizationId,
      instanceId: input.instanceId,
      status: input.status,
      payload: input.payload ? JSON.parse(JSON.stringify(input.payload)) : undefined,
      error: input.error,
    },
  });
}

async function enqueueWebhook(input: {
  organizationId: string;
  instanceId?: string;
  event: keyof typeof webhookEventToDbMap;
  data: Record<string, unknown>;
}) {
  const dbEvent = webhookEventToDbMap[input.event];
  const webhooks = await prisma.webhookEndpoint.findMany({
    where: {
      organizationId: input.organizationId,
      active: true,
      events: { has: dbEvent },
      OR: [
        { instanceId: null },
        ...(input.instanceId ? [{ instanceId: input.instanceId }] : []),
      ],
    },
  });

  for (const webhook of webhooks) {
    const payload = {
      event: input.event,
      organizationId: input.organizationId,
      instanceId: input.instanceId,
      timestamp: new Date().toISOString(),
      data: input.data,
    };

    const delivery = await prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        organizationId: input.organizationId,
        event: dbEvent,
        payload: JSON.parse(JSON.stringify(payload)),
      },
    });

    await dispatchWebhookQueue.add('dispatch-webhook', {
      deliveryId: delivery.id,
      webhookId: webhook.id,
      payload,
    });
  }
}

async function saveIncomingMedia(input: {
  instanceId: string;
  externalId?: string;
  media?: {
    bytes: Buffer;
    mimeType: string;
    extension: string;
  };
}) {
  if (!input.media) return undefined;

  await mkdir(path.join(mediaStoragePath, input.instanceId), { recursive: true });
  const fileName = `${input.externalId ?? randomUUID()}.${input.media.extension}`;
  const absolutePath = path.join(mediaStoragePath, input.instanceId, fileName);
  await writeFile(absolutePath, input.media.bytes);

  return `/media/${input.instanceId}/${fileName}`;
}

const dispatchWebhookQueue = new Queue<DispatchWebhookJob>(queueNames.dispatchWebhook, {
  connection,
});

function createConnectionCallbacks(instanceId: string, organizationId: string) {
  return {
    onConnectionUpdate: async (update: {
      connection?: string;
      hasQr: boolean;
      statusCode?: number;
      errorMessage?: string;
      restartRequired?: boolean;
      isNewLogin?: boolean;
      receivedPendingNotifications?: boolean;
    }) => {
      const level = update.connection === 'close' || update.errorMessage ? 'warn' : 'info';
      logger[level]('WhatsApp connection update', {
        instanceId,
        organizationId,
        ...update,
      });
    },
    onQr: async (qrCode: string) => {
      await prisma.whatsAppInstance.update({
        where: { id: instanceId },
        data: {
          status: 'WAITING_QR',
          qrCode,
          qrUpdatedAt: new Date(),
        },
      });
      await enqueueWebhook({
        organizationId,
        instanceId,
        event: 'qr.updated',
        data: { status: 'WAITING_QR' },
      });
    },
    onConnected: async (profile: { phoneNumber?: string; profileName?: string }) => {
      await prisma.whatsAppInstance.update({
        where: { id: instanceId },
        data: {
          status: 'CONNECTED',
          phoneNumber: profile.phoneNumber,
          profileName: profile.profileName,
          qrCode: null,
          lastConnectedAt: new Date(),
        },
      });
      await enqueueWebhook({
        organizationId,
        instanceId,
        event: 'instance.connected',
        data: profile,
      });
    },
    onDisconnected: async (reason: {
      shouldReconnect: boolean;
      statusCode?: number;
      errorMessage?: string;
      restartRequired?: boolean;
    }) => {
      logger.warn('WhatsApp disconnected', {
        instanceId,
        organizationId,
        ...reason,
      });
      await prisma.whatsAppInstance.update({
        where: { id: instanceId },
        data: {
          status: reason.shouldReconnect ? 'RECONNECTING' : 'LOGGED_OUT',
          disconnectedAt: new Date(),
        },
      });
      await enqueueWebhook({
        organizationId,
        instanceId,
        event: 'instance.disconnected',
        data: reason,
      });
    },
    onMessage: async (message: {
      remoteJid: string;
      aliases?: string[];
      externalId?: string;
      fromMe: boolean;
      type: 'TEXT' | 'IMAGE' | 'AUDIO' | 'DOCUMENT' | 'VIDEO' | 'UNKNOWN';
      body?: string;
      media?: {
        bytes: Buffer;
        mimeType: string;
        extension: string;
      };
      mediaUrl?: string;
      mediaDownloadError?: string;
    }) => {
      const remoteAliases = getRemoteJidAliases(uniqueValues([message.remoteJid, ...(message.aliases ?? [])]));
      const phoneAliases = uniqueValues(remoteAliases.flatMap(jid => getBrazilPhoneAliases(jid.replace(/\D/g, ''))));
      const contact = await prisma.contact.findFirst({
        where: {
          organizationId,
          OR: [
            { remoteJid: { in: remoteAliases } },
            { phoneE164: { in: phoneAliases } },
          ],
        },
      });
      const chatRemoteJid = contact?.remoteJid ?? message.remoteJid;

      const chat = await prisma.chat.upsert({
        where: {
          instanceId_remoteJid: {
            instanceId,
            remoteJid: chatRemoteJid,
          },
        },
        create: {
          instanceId,
          remoteJid: chatRemoteJid,
        },
        update: {
          updatedAt: new Date(),
        },
      });
      const mediaUrl = message.mediaUrl ?? (await saveIncomingMedia({
        instanceId,
        externalId: message.externalId,
        media: message.media,
      }));

      if (message.type === 'IMAGE' && !mediaUrl) {
        logger.warn('Incoming image did not produce a media file', {
          instanceId,
          organizationId,
          externalId: message.externalId,
          remoteJid: message.remoteJid,
          mediaDownloadError: message.mediaDownloadError,
        });
      }

      const existingMessage = message.externalId
        ? await prisma.message.findFirst({
            where: {
              instanceId,
              externalId: message.externalId,
            },
          })
        : null;

      if (existingMessage) {
        await prisma.message.update({
          where: { id: existingMessage.id },
          data: {
            chatId: existingMessage.chatId ?? chat.id,
            remoteJid: existingMessage.remoteJid,
            body: message.body ?? existingMessage.body,
            mediaUrl: mediaUrl ?? existingMessage.mediaUrl,
            status: message.fromMe ? 'SENT' : 'RECEIVED',
          },
        });
        return;
      }

      await prisma.message.create({
        data: {
          instanceId,
          chatId: chat.id,
          remoteJid: chatRemoteJid,
          externalId: message.externalId,
          fromMe: message.fromMe,
          type: message.type,
          body: message.body,
          mediaUrl,
          status: message.fromMe ? 'SENT' : 'RECEIVED',
        },
      });

      if (message.fromMe) return;

      await enqueueWebhook({
        organizationId,
        instanceId,
        event: 'message.received',
        data: {
          from: chatRemoteJid,
          type: message.type,
          body: message.body,
          mediaUrl,
        },
      });
    },
    onMessageUpdate: async (message: {
      externalId: string;
      remoteJid?: string;
      status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'RECEIVED';
    }) => {
      const updated = await prisma.message.updateMany({
        where: {
          instanceId,
          externalId: message.externalId,
          fromMe: true,
        },
        data: {
          status: message.status,
        },
      });

      if (updated.count > 0) {
        logger.info('Message status updated', {
          instanceId,
          organizationId,
          externalId: message.externalId,
          status: message.status,
        });

        if (message.status === 'DELIVERED' || message.status === 'READ' || message.status === 'FAILED') {
          await enqueueWebhook({
            organizationId,
            instanceId,
            event:
              message.status === 'DELIVERED'
                ? 'message.delivered'
                : message.status === 'READ'
                  ? 'message.read'
                  : 'message.failed',
            data: {
              externalId: message.externalId,
              to: message.remoteJid,
              status: message.status,
            },
          });
        }
      }
    },
  };
}

const workers = [
  new Worker<ConnectInstanceJob>(
  queueNames.connectInstance,
  async job => {
    const { instanceId, organizationId, clearSession } = job.data;
    const jobContext = { queueName: queueNames.connectInstance, name: job.name, organizationId, instanceId };

    await logJob({ ...jobContext, status: 'STARTED', payload: job.data });
    if (clearSession) {
      await whatsapp.clearSession({ instanceId, sessionBasePath: sessionStoragePath });
    }
    await prisma.whatsAppInstance.update({
      where: { id: instanceId },
      data: { status: 'CONNECTING', qrCode: null, qrUpdatedAt: null },
    });

    try {
      const result = await whatsapp.connect({
        instanceId,
        sessionBasePath: sessionStoragePath,
        callbacks: createConnectionCallbacks(instanceId, organizationId),
      });

      if (result.qrCode) {
        await prisma.whatsAppInstance.update({
          where: { id: instanceId },
          data: {
            status: 'WAITING_QR',
            qrCode: result.qrCode,
            qrUpdatedAt: new Date(),
          },
        });
      }

      await logJob({ ...jobContext, status: 'SUCCESS', payload: job.data });
      logger.info('Instance connection started', { instanceId, organizationId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await prisma.whatsAppInstance.update({
        where: { id: instanceId },
        data: { status: 'ERROR' },
      });
      await logJob({ ...jobContext, status: 'FAILED', payload: job.data, error: errorMessage });
      throw error;
    }
  },
  { connection },
  ),

  new Worker<ConnectInstanceJob>(
  queueNames.disconnectInstance,
  async job => {
    const { instanceId, organizationId, clearSession } = job.data;
    const jobContext = { queueName: queueNames.disconnectInstance, name: job.name, organizationId, instanceId };

    await logJob({ ...jobContext, status: 'STARTED', payload: job.data });
    if (clearSession) {
      await whatsapp.clearSession({ instanceId, sessionBasePath: sessionStoragePath });
    } else {
      await whatsapp.disconnect(instanceId);
    }
    await prisma.whatsAppInstance.updateMany({
      where: { id: instanceId },
      data: {
        status: clearSession ? 'LOGGED_OUT' : 'DISCONNECTED',
        disconnectedAt: new Date(),
        qrCode: null,
      },
    });
    await logJob({ ...jobContext, status: 'SUCCESS', payload: job.data });
  },
  { connection },
  ),

  new Worker<SendMessageJob>(
  queueNames.sendMessage,
  async job => {
    const { messageId, instanceId, organizationId, to, body, media, type = 'TEXT' } = job.data;
    const jobContext = { queueName: queueNames.sendMessage, name: job.name, organizationId, instanceId };

    await logJob({ ...jobContext, status: 'STARTED', payload: job.data });

    try {
      if (!whatsapp.isConnected(instanceId)) {
        logger.warn('WhatsApp socket missing before send; reconnecting from saved session', {
          instanceId,
          organizationId,
          messageId,
        });

        await prisma.whatsAppInstance.update({
          where: { id: instanceId },
          data: { status: 'RECONNECTING' },
        });

        await whatsapp.connect({
          instanceId,
          sessionBasePath: sessionStoragePath,
          callbacks: createConnectionCallbacks(instanceId, organizationId),
        });
      }

      const sent = media
        ? await whatsapp.sendMedia({
            instanceId,
            to,
            type: type === 'TEXT' ? 'DOCUMENT' : type,
            path: media.path,
            mimeType: media.mimeType,
            fileName: media.fileName,
            caption: body,
          })
        : await whatsapp.sendText({ instanceId, to, body: body ?? '' });
      const existingMessage = await prisma.message.findUnique({
        where: { id: messageId },
        select: {
          chatId: true,
          remoteJid: true,
          mediaUrl: true,
        },
      });
      let chatId = existingMessage?.chatId ?? null;
      let remoteJid = existingMessage?.remoteJid ?? sent.remoteJid;

      if (!chatId) {
        const chat = await prisma.chat.upsert({
          where: {
            instanceId_remoteJid: {
              instanceId,
              remoteJid: sent.remoteJid,
            },
          },
          create: {
            instanceId,
            remoteJid: sent.remoteJid,
          },
          update: {
            updatedAt: new Date(),
          },
        });
        chatId = chat.id;
        remoteJid = sent.remoteJid;
      }

      await prisma.message.update({
        where: { id: messageId },
        data: {
          chatId,
          remoteJid,
          externalId: sent.externalId,
          status: sent.status,
        },
      });

      await enqueueWebhook({
        organizationId,
        instanceId,
        event: 'message.sent',
        data: {
          messageId,
          to: remoteJid,
          body,
          type,
          mediaUrl: existingMessage?.mediaUrl,
        },
      });

      await logJob({ ...jobContext, status: 'SUCCESS', payload: job.data });
      logger.info('Message submitted to WhatsApp', {
        instanceId,
        organizationId,
        messageId,
        externalId: sent.externalId,
        remoteJid,
        whatsappJid: sent.remoteJid,
        status: sent.status,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const failedMessage = await prisma.message.findUnique({
        where: { id: messageId },
        select: {
          remoteJid: true,
          mediaUrl: true,
        },
      });

      await prisma.message.update({
        where: { id: messageId },
        data: { status: 'FAILED', failureReason: errorMessage },
      });
      await enqueueWebhook({
        organizationId,
        instanceId,
        event: 'message.failed',
        data: {
          messageId,
          to: failedMessage?.remoteJid ?? to,
          body,
          type,
          mediaUrl: failedMessage?.mediaUrl,
          error: errorMessage,
        },
      });
      await logJob({ ...jobContext, status: 'FAILED', payload: job.data, error: errorMessage });
      throw error;
    }
  },
  { connection },
  ),

  new Worker<DispatchWebhookJob>(
  queueNames.dispatchWebhook,
  async job => {
    const { deliveryId, webhookId, payload } = job.data;
    const webhook = await prisma.webhookEndpoint.findUnique({ where: { id: webhookId } });

    if (!webhook || !webhook.active) {
      await prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: 'FAILED', error: 'Webhook inactive or missing' },
      });
      return;
    }

    const signature = signPayload(payload, webhook.secret);
    const body = buildWebhookBody(webhook.url, payload);
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ravoxzap-signature': signature,
      },
      body: JSON.stringify(body),
    });

    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        attempts: { increment: 1 },
        responseStatus: response.status,
        status: response.ok ? 'SUCCESS' : 'FAILED',
        deliveredAt: response.ok ? new Date() : null,
        error: response.ok ? null : await response.text().catch(() => 'Webhook request failed'),
      },
    });

    if (!response.ok) {
      throw new Error(`Webhook delivery failed with status ${response.status}`);
    }
  },
  {
    connection,
  },
  ),
];

async function restoreConnectedInstances() {
  const instances = await prisma.whatsAppInstance.findMany({
    where: {
      status: { in: ['CONNECTED', 'RECONNECTING'] },
    },
    select: {
      id: true,
      organizationId: true,
      status: true,
    },
  });

  for (const instance of instances) {
    logger.info('Restoring WhatsApp socket from saved session', {
      instanceId: instance.id,
      organizationId: instance.organizationId,
      status: instance.status,
    });
    await whatsapp
      .connect({
        instanceId: instance.id,
        sessionBasePath: sessionStoragePath,
        callbacks: createConnectionCallbacks(instance.id, instance.organizationId),
      })
      .catch(error => {
        logger.warn('Failed to restore WhatsApp socket', {
          instanceId: instance.id,
          organizationId: instance.organizationId,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      });
  }
}

logger.info('RavoxZap worker started');
void restoreConnectedInstances();

async function shutdown(signal: NodeJS.Signals) {
  logger.info('Shutting down worker', { signal });
  await Promise.all(workers.map(worker => worker.close()));
  await dispatchWebhookQueue.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.once('SIGTERM', signal => void shutdown(signal));
process.once('SIGINT', signal => void shutdown(signal));
