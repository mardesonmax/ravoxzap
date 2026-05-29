import { Queue, Worker } from 'bullmq';
import { createHmac, randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { Redis } from 'ioredis';

import { env } from '@ravoxzap/config';
import { prisma, type WebhookEvent as PrismaWebhookEvent } from '@ravoxzap/database';
import { createLogger } from '@ravoxzap/logger';
import {
  createQueueConnection,
  queueNames,
  type ConnectInstanceJob,
  type DispatchWebhookJob,
  type SendMessageJob,
  type WhatsAppOperationJob,
} from '@ravoxzap/queue';
import { createMediaStorage } from '@ravoxzap/storage';
import {
  WhatsAppConnectionManager,
  getSessionPath,
  extractGroupInviteCode,
  type WhatsAppGroupCreateResult,
  type WhatsAppGroupMetadata,
} from '@ravoxzap/whatsapp';
import { clearPrismaBaileysAuthState, usePrismaBaileysAuthState } from './baileys-auth.js';
import { InstanceLockManager } from './instance-locks.js';

const logger = createLogger({ service: 'worker' });
const connection = createQueueConnection(env.REDIS_URL);
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const instanceLocks = new InstanceLockManager(redis, env.WORKER_LOCK_TTL_MS);
const whatsapp = new WhatsAppConnectionManager();
const repoRoot = path.resolve(process.cwd(), '../..');
const sessionStoragePath = path.isAbsolute(env.SESSION_STORAGE_PATH)
  ? env.SESSION_STORAGE_PATH
  : path.resolve(repoRoot, env.SESSION_STORAGE_PATH);
const mediaStoragePath = path.resolve(repoRoot, 'storage/media');
const mediaStorage = createMediaStorage({
  disk: env.DISK,
  mode: env.MEDIA_STORAGE_MODE,
  retentionDays: env.MEDIA_RETENTION_DAYS,
  localRoot: mediaStoragePath,
  storageBaseUrl: env.STORAGE_BASE_URL,
  r2: {
    endpoint: env.R2_ENDPOINT,
    region: env.R2_REGION,
    bucket: env.R2_BUCKET,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

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

  const fileName = `${input.externalId ?? randomUUID()}.${input.media.extension}`;
  return mediaStorage.save({
    instanceId: input.instanceId,
    fileName,
    bytes: input.media.bytes,
    mimeType: input.media.mimeType,
  });
}

const dispatchWebhookQueue = new Queue<DispatchWebhookJob>(queueNames.dispatchWebhook, {
  connection,
});

async function ensureConnectedSocket(input: { instanceId: string; organizationId: string }) {
  await instanceLocks.ensure(input.instanceId);
  if (whatsapp.isConnected(input.instanceId)) return;

  logger.warn('WhatsApp socket missing before operation; reconnecting from saved session', input);

  await prisma.whatsAppInstance.update({
    where: { id: input.instanceId },
    data: { status: 'RECONNECTING' },
  });

  await connectWhatsAppInstance(input);
}

async function getAuthState(instanceId: string, clearSession = false) {
  if (env.BAILEYS_AUTH_STORE === 'database') {
    if (clearSession) await clearPrismaBaileysAuthState(instanceId);
    return usePrismaBaileysAuthState(instanceId, env.ENCRYPTION_KEY);
  }

  if (clearSession) {
    await rm(getSessionPath(sessionStoragePath, instanceId), { recursive: true, force: true });
  }

  return undefined;
}

async function connectWhatsAppInstance(input: { instanceId: string; organizationId: string; clearSession?: boolean }) {
  await instanceLocks.ensure(input.instanceId);
  return whatsapp.connect({
    instanceId: input.instanceId,
    sessionBasePath: sessionStoragePath,
    authState: await getAuthState(input.instanceId, input.clearSession),
    callbacks: createConnectionCallbacks(input.instanceId, input.organizationId),
  });
}

function objectInput(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function stringValue(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return typeof value === 'string' ? value : '';
}

function nullableStringValue(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function stringArrayValue(input: Record<string, unknown>, key: string) {
  const value = input[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function booleanValue(input: Record<string, unknown>, key: string, fallback = false) {
  const value = input[key];
  return typeof value === 'boolean' ? value : fallback;
}

function numberValue(input: Record<string, unknown>, key: string, fallback = 0) {
  const value = input[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function objectValue(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function objectArrayValue(input: Record<string, unknown>, key: string) {
  const value = input[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
}

function communityJidValue(input: Record<string, unknown>) {
  return stringValue(input, 'communityJid') || stringValue(input, 'communityId');
}

function newsletterIdValue(input: Record<string, unknown>) {
  return stringValue(input, 'newsletterId') || stringValue(input, 'channelId');
}

async function saveGroupMetadata(instanceId: string, metadata: WhatsAppGroupMetadata) {
  const group = await prisma.whatsAppGroup.upsert({
    where: {
      instanceId_remoteJid: {
        instanceId,
        remoteJid: metadata.remoteJid,
      },
    },
    create: {
      instanceId,
      remoteJid: metadata.remoteJid,
      subject: metadata.subject,
      description: metadata.description,
      ownerJid: metadata.ownerJid,
      size: metadata.size,
      announce: metadata.announce,
      restrict: metadata.restrict,
      memberAddMode: metadata.memberAddMode,
      joinApprovalMode: metadata.joinApprovalMode,
      ephemeralDuration: metadata.ephemeralDuration ?? 0,
      pictureUrl: metadata.pictureUrl,
      inviteCode: metadata.inviteCode,
      lastSyncedAt: new Date(),
    },
    update: {
      subject: metadata.subject,
      description: metadata.description,
      ownerJid: metadata.ownerJid,
      size: metadata.size,
      announce: metadata.announce,
      restrict: metadata.restrict,
      memberAddMode: metadata.memberAddMode,
      joinApprovalMode: metadata.joinApprovalMode,
      ephemeralDuration: metadata.ephemeralDuration ?? 0,
      pictureUrl: metadata.pictureUrl,
      inviteCode: metadata.inviteCode,
      lastSyncedAt: new Date(),
    },
  });

  await prisma.whatsAppGroupParticipant.deleteMany({
    where: { groupId: group.id },
  });

  if (metadata.participants.length > 0) {
    await prisma.whatsAppGroupParticipant.createMany({
      data: metadata.participants.map(participant => ({
        groupId: group.id,
        jid: participant.jid,
        name: participant.name,
        isAdmin: participant.isAdmin,
        isSuperAdmin: participant.isSuperAdmin,
      })),
      skipDuplicates: true,
    });
  }

  return group;
}

function serializeCreatedGroup(saved: Awaited<ReturnType<typeof saveGroupMetadata>>, created: WhatsAppGroupCreateResult) {
  return {
    groupId: saved.id,
    remoteJid: saved.remoteJid,
    subject: saved.subject,
    phone: created.phone,
    phonesNotAdded: created.phonesNotAdded,
    invitationLink: created.invitationLink,
    autoInvite: created.autoInvite,
  };
}

async function deleteGroupCache(instanceId: string, remoteJids: string[]) {
  const uniqueRemoteJids = [...new Set(remoteJids.filter(Boolean))];
  if (uniqueRemoteJids.length === 0) return 0;

  const groups = await prisma.whatsAppGroup.findMany({
    where: {
      instanceId,
      remoteJid: { in: uniqueRemoteJids },
    },
    select: {
      id: true,
      remoteJid: true,
    },
  });

  if (groups.length === 0) return 0;

  await prisma.whatsAppGroupParticipant.deleteMany({
    where: {
      groupId: { in: groups.map(group => group.id) },
    },
  });

  await prisma.whatsAppGroup.deleteMany({
    where: {
      id: { in: groups.map(group => group.id) },
    },
  });

  await prisma.chat.updateMany({
    where: {
      instanceId,
      remoteJid: { in: groups.map(group => group.remoteJid) },
    },
    data: {
      deletedAt: new Date(),
    },
  });

  return groups.length;
}

async function pruneStaleGroupCache(instanceId: string, activeRemoteJids: string[]) {
  const active = [...new Set(activeRemoteJids.filter(Boolean))];

  const staleGroups = await prisma.whatsAppGroup.findMany({
    where: {
      instanceId,
      ...(active.length > 0 ? { remoteJid: { notIn: active } } : {}),
    },
    select: {
      remoteJid: true,
    },
  });

  return deleteGroupCache(
    instanceId,
    staleGroups.map(group => group.remoteJid),
  );
}

async function syncInstanceGroups(instanceId: string, organizationId: string, reason: string) {
  try {
    const groups = await whatsapp.syncGroups(instanceId);
    for (const group of groups) {
      await saveGroupMetadata(instanceId, group);
    }
    const pruned = await pruneStaleGroupCache(
      instanceId,
      groups.map(group => group.remoteJid),
    );

    logger.info('WhatsApp groups synced', {
      instanceId,
      organizationId,
      reason,
      total: groups.length,
      pruned,
    });
  } catch (error) {
    logger.warn('WhatsApp groups sync failed', {
      instanceId,
      organizationId,
      reason,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}

async function findOperationChat(operationId: string, chatId?: string | null) {
  if (!chatId) throw new Error(`Operation ${operationId} does not have a chat target`);

  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
  });

  if (!chat) throw new Error(`Chat ${chatId} not found`);
  return chat;
}

async function getChatLastMessages(chat: { id: string; remoteJid: string }) {
  const isGroup = chat.remoteJid.endsWith('@g.us');
  const messages = await prisma.message.findMany({
    where: { chatId: chat.id, externalId: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return messages
    .filter(message => message.externalId && (!isGroup || message.fromMe || message.participantJid))
    .map(message => ({
      key: {
        remoteJid: chat.remoteJid,
        id: message.externalId ?? '',
        fromMe: message.fromMe,
        ...(isGroup && !message.fromMe && message.participantJid ? { participant: message.participantJid } : {}),
      },
      messageTimestamp: Math.max(1, Math.floor(message.createdAt.getTime() / 1000)),
    }));
}

async function resolveOperationGroup(input: Record<string, unknown>, groupId?: string | null) {
  if (typeof input.groupRemoteJid === 'string' && input.groupRemoteJid.endsWith('@g.us')) {
    return input.groupRemoteJid;
  }

  if (!groupId) throw new Error('Group target is missing');

  const group = await prisma.whatsAppGroup.findUnique({
    where: { id: groupId },
  });

  if (!group) throw new Error(`Group ${groupId} not found`);
  return group.remoteJid;
}

async function saveGroupInviteCode(instanceId: string, groupJid: string, code?: string) {
  if (!code) return;

  await prisma.whatsAppGroup.updateMany({
    where: {
      instanceId,
      remoteJid: groupJid,
    },
    data: {
      inviteCode: code,
      lastSyncedAt: new Date(),
    },
  });
}

async function runWhatsAppOperation(job: WhatsAppOperationJob) {
  const operation = await prisma.whatsAppOperation.findUnique({
    where: { id: job.operationId },
  });

  if (!operation) throw new Error(`WhatsApp operation ${job.operationId} not found`);

  const input = objectInput(operation.input);
  await ensureConnectedSocket(job);

  switch (operation.type) {
    case 'MESSAGE_SEND_LOCATION':
      return whatsapp.sendLocation({
        instanceId: job.instanceId,
        to: stringValue(input, 'to'),
        latitude: numberValue(input, 'latitude'),
        longitude: numberValue(input, 'longitude'),
        name: stringValue(input, 'name') || undefined,
        address: stringValue(input, 'address') || undefined,
      });
    case 'MESSAGE_SEND_CONTACT':
      return whatsapp.sendContact({
        instanceId: job.instanceId,
        to: stringValue(input, 'to'),
        contact: objectValue(input, 'contact') as any,
      });
    case 'MESSAGE_SEND_CONTACTS':
      return whatsapp.sendContacts({
        instanceId: job.instanceId,
        to: stringValue(input, 'to'),
        contacts: objectArrayValue(input, 'contacts') as any,
      });
    case 'MESSAGE_SEND_STICKER':
      return whatsapp.sendSticker({ instanceId: job.instanceId, to: stringValue(input, 'to'), sticker: stringValue(input, 'sticker') });
    case 'MESSAGE_SEND_GIF':
      return whatsapp.sendGif({
        instanceId: job.instanceId,
        to: stringValue(input, 'to'),
        gif: stringValue(input, 'gif'),
        caption: stringValue(input, 'caption') || undefined,
      });
    case 'MESSAGE_SEND_LINK':
      return whatsapp.sendLink({
        instanceId: job.instanceId,
        to: stringValue(input, 'to'),
        url: stringValue(input, 'url'),
        text: stringValue(input, 'text') || undefined,
      });
    case 'MESSAGE_SEND_REACTION':
    case 'MESSAGE_REMOVE_REACTION':
      return whatsapp.sendReaction({
        instanceId: job.instanceId,
        remoteJid: stringValue(input, 'remoteJid') || stringValue(input, 'to'),
        messageId: stringValue(input, 'messageId'),
        emoji: operation.type === 'MESSAGE_REMOVE_REACTION' ? '' : stringValue(input, 'emoji'),
        fromMe: booleanValue(input, 'fromMe'),
      });
    case 'MESSAGE_SEND_POLL':
      return whatsapp.sendPoll({
        instanceId: job.instanceId,
        to: stringValue(input, 'to'),
        name: stringValue(input, 'name'),
        options: stringArrayValue(input, 'options'),
        selectableCount: numberValue(input, 'selectableCount', 1),
      });
    case 'MESSAGE_SEND_POLL_VOTE':
      return whatsapp.sendPollVote();
    case 'MESSAGE_REPLY':
      return whatsapp.replyMessage({
        instanceId: job.instanceId,
        to: stringValue(input, 'to'),
        text: stringValue(input, 'text'),
        quotedMessageId: stringValue(input, 'quotedMessageId') || stringValue(input, 'messageId'),
        quotedFromMe: booleanValue(input, 'quotedFromMe'),
      });
    case 'MESSAGE_FORWARD':
      return whatsapp.forwardMessage({
        instanceId: job.instanceId,
        to: stringValue(input, 'to'),
        message: objectValue(input, 'message'),
      });
    case 'MESSAGE_DELETE':
      return whatsapp.deleteMessage({
        instanceId: job.instanceId,
        remoteJid: stringValue(input, 'remoteJid') || stringValue(input, 'to'),
        messageId: stringValue(input, 'messageId'),
        fromMe: booleanValue(input, 'fromMe', true),
      });
    case 'MESSAGE_READ':
      return whatsapp.readMessage({
        instanceId: job.instanceId,
        remoteJid: stringValue(input, 'remoteJid') || stringValue(input, 'to'),
        messageId: stringValue(input, 'messageId'),
        fromMe: booleanValue(input, 'fromMe'),
      });
    case 'MESSAGE_PIN':
      return whatsapp.pinMessage({
        instanceId: job.instanceId,
        remoteJid: stringValue(input, 'remoteJid') || stringValue(input, 'to'),
        messageId: stringValue(input, 'messageId'),
        fromMe: booleanValue(input, 'fromMe', true),
        type: numberValue(input, 'type', 1) as 0 | 1,
        time: numberValue(input, 'time', 86400) as 86400 | 604800 | 2592000,
      });
    case 'MESSAGE_SEND_PTV':
      return whatsapp.sendPtv({
        instanceId: job.instanceId,
        to: stringValue(input, 'to'),
        video: stringValue(input, 'video'),
        caption: stringValue(input, 'caption') || undefined,
      });
    case 'CONTACT_CHECK':
      return whatsapp.checkWhatsApp({ instanceId: job.instanceId, phone: stringValue(input, 'phone') });
    case 'CONTACT_CHECK_BATCH':
      return whatsapp.checkWhatsAppBatch({ instanceId: job.instanceId, phones: stringArrayValue(input, 'phones') });
    case 'CONTACT_METADATA':
      return whatsapp.getContactMetadata({ instanceId: job.instanceId, phone: stringValue(input, 'phone') });
    case 'CONTACT_PROFILE_PICTURE':
      return whatsapp.getContactProfilePicture({ instanceId: job.instanceId, phone: stringValue(input, 'phone') });
    case 'CONTACT_ADD':
      return whatsapp.addPhoneContact({ instanceId: job.instanceId, phone: stringValue(input, 'phone'), name: stringValue(input, 'name') });
    case 'CONTACT_REMOVE':
      return whatsapp.removePhoneContact({ instanceId: job.instanceId, phone: stringValue(input, 'phone') });
    case 'CONTACT_BLOCK':
      return whatsapp.updateContactBlock({ instanceId: job.instanceId, phone: stringValue(input, 'phone'), blocked: true });
    case 'CONTACT_UNBLOCK':
      return whatsapp.updateContactBlock({ instanceId: job.instanceId, phone: stringValue(input, 'phone'), blocked: false });
    case 'CONTACT_REPORT':
      return whatsapp.reportContact();
    case 'PRIVACY_GET':
      return whatsapp.getPrivacySettings(job.instanceId);
    case 'PRIVACY_LAST_SEEN':
      return whatsapp.updatePrivacy({ instanceId: job.instanceId, kind: 'lastSeen', value: stringValue(input, 'value') });
    case 'PRIVACY_ONLINE':
      return whatsapp.updatePrivacy({ instanceId: job.instanceId, kind: 'online', value: stringValue(input, 'value') });
    case 'PRIVACY_PROFILE_PICTURE':
      return whatsapp.updatePrivacy({ instanceId: job.instanceId, kind: 'profilePicture', value: stringValue(input, 'value') });
    case 'PRIVACY_STATUS':
      return whatsapp.updatePrivacy({ instanceId: job.instanceId, kind: 'status', value: stringValue(input, 'value') });
    case 'PRIVACY_READ_RECEIPTS':
      return whatsapp.updatePrivacy({ instanceId: job.instanceId, kind: 'readReceipts', value: stringValue(input, 'value') });
    case 'PRIVACY_GROUP_ADD':
      return whatsapp.updatePrivacy({ instanceId: job.instanceId, kind: 'groupAdd', value: stringValue(input, 'value') });
    case 'PRIVACY_DEFAULT_DISAPPEARING':
      return whatsapp.updatePrivacy({ instanceId: job.instanceId, kind: 'defaultDisappearing', value: numberValue(input, 'duration') || numberValue(input, 'seconds') });
    case 'PRIVACY_BLOCKLIST':
      return whatsapp.getBlocklist(job.instanceId);
    case 'INSTANCE_ME':
      return whatsapp.getInstanceMe(job.instanceId);
    case 'INSTANCE_DEVICE':
      return whatsapp.getInstanceDevice(job.instanceId);
    case 'INSTANCE_PAIRING_CODE':
      return whatsapp.requestPairingCode({ instanceId: job.instanceId, phone: stringValue(input, 'phone'), code: stringValue(input, 'code') || undefined });
    case 'INSTANCE_PROFILE_NAME':
      return whatsapp.updateProfileName({ instanceId: job.instanceId, name: stringValue(input, 'name') });
    case 'INSTANCE_PROFILE_DESCRIPTION':
      return whatsapp.updateProfileDescription({ instanceId: job.instanceId, description: stringValue(input, 'description') });
    case 'INSTANCE_PROFILE_PICTURE':
      return whatsapp.updateOwnProfilePicture({ instanceId: job.instanceId, image: stringValue(input, 'image') || stringValue(input, 'imageUrl') || stringValue(input, 'imageBase64') });
    case 'INSTANCE_PROFILE_PICTURE_REMOVE':
      return whatsapp.removeOwnProfilePicture(job.instanceId);
    case 'STATUS_SEND_TEXT':
      return whatsapp.sendStatusText({
        instanceId: job.instanceId,
        text: stringValue(input, 'text'),
        recipients: stringArrayValue(input, 'recipients'),
        backgroundColor: stringValue(input, 'backgroundColor') || undefined,
        font: numberValue(input, 'font', 0),
      });
    case 'STATUS_SEND_IMAGE':
      return whatsapp.sendStatusMedia({ instanceId: job.instanceId, type: 'image', media: stringValue(input, 'image'), caption: stringValue(input, 'caption') || undefined, recipients: stringArrayValue(input, 'recipients') });
    case 'STATUS_SEND_VIDEO':
      return whatsapp.sendStatusMedia({ instanceId: job.instanceId, type: 'video', media: stringValue(input, 'video'), caption: stringValue(input, 'caption') || undefined, recipients: stringArrayValue(input, 'recipients') });
    case 'STATUS_REPLY_TEXT':
      return whatsapp.replyStatusText({ instanceId: job.instanceId, statusJid: stringValue(input, 'statusJid'), messageId: stringValue(input, 'messageId'), text: stringValue(input, 'text') });
    case 'STATUS_REPLY_STICKER':
      return whatsapp.replyStatusMedia({ instanceId: job.instanceId, statusJid: stringValue(input, 'statusJid'), messageId: stringValue(input, 'messageId'), type: 'sticker', media: stringValue(input, 'sticker') });
    case 'STATUS_REPLY_GIF':
      return whatsapp.replyStatusMedia({ instanceId: job.instanceId, statusJid: stringValue(input, 'statusJid'), messageId: stringValue(input, 'messageId'), type: 'gif', media: stringValue(input, 'gif') });
    case 'COMMUNITY_SYNC':
      return { communities: await whatsapp.syncCommunities(job.instanceId) };
    case 'COMMUNITY_CREATE':
      return whatsapp.createCommunity({
        instanceId: job.instanceId,
        name: stringValue(input, 'name'),
        description: stringValue(input, 'description') || undefined,
      });
    case 'COMMUNITY_METADATA':
      return whatsapp.getCommunityMetadata({ instanceId: job.instanceId, communityJid: communityJidValue(input) });
    case 'COMMUNITY_UPDATE_NAME':
      return whatsapp.updateCommunityName({
        instanceId: job.instanceId,
        communityJid: communityJidValue(input),
        name: stringValue(input, 'name'),
      });
    case 'COMMUNITY_UPDATE_DESCRIPTION':
      return whatsapp.updateCommunityDescription({
        instanceId: job.instanceId,
        communityJid: communityJidValue(input),
        description: stringValue(input, 'description'),
      });
    case 'COMMUNITY_SETTINGS_UPDATE':
      return whatsapp.updateCommunitySettings({
        instanceId: job.instanceId,
        communityJid: communityJidValue(input),
        settings: {
          messages: stringValue(input, 'messages') === 'admins' || stringValue(input, 'messages') === 'all'
            ? stringValue(input, 'messages') as 'admins' | 'all'
            : undefined,
          info: stringValue(input, 'info') === 'admins' || stringValue(input, 'info') === 'all'
            ? stringValue(input, 'info') as 'admins' | 'all'
            : undefined,
          addMembers: stringValue(input, 'addMembers') === 'admins' || stringValue(input, 'addMembers') === 'all'
            ? stringValue(input, 'addMembers') as 'admins' | 'all'
            : undefined,
          joinApproval: typeof input.joinApproval === 'boolean' ? input.joinApproval : undefined,
          ephemeralSeconds: typeof input.ephemeralSeconds === 'number' ? numberValue(input, 'ephemeralSeconds') : undefined,
        },
      });
    case 'COMMUNITY_PARTICIPANTS_ADD':
    case 'COMMUNITY_PARTICIPANTS_REMOVE':
    case 'COMMUNITY_ADMINS_PROMOTE':
    case 'COMMUNITY_ADMINS_DEMOTE':
      return whatsapp.updateCommunityParticipants({
        instanceId: job.instanceId,
        communityJid: communityJidValue(input),
        participants: stringArrayValue(input, 'participants'),
        action: operation.type === 'COMMUNITY_PARTICIPANTS_ADD'
          ? 'add'
          : operation.type === 'COMMUNITY_PARTICIPANTS_REMOVE'
            ? 'remove'
            : operation.type === 'COMMUNITY_ADMINS_PROMOTE'
              ? 'promote'
              : 'demote',
      });
    case 'COMMUNITY_GROUPS_LINK':
    case 'COMMUNITY_GROUPS_UNLINK':
      return whatsapp.linkCommunityGroups({
        instanceId: job.instanceId,
        communityJid: communityJidValue(input),
        groupJids: stringArrayValue(input, 'groups').length > 0
          ? stringArrayValue(input, 'groups')
          : stringArrayValue(input, 'groupJids'),
        linked: operation.type === 'COMMUNITY_GROUPS_LINK',
      });
    case 'COMMUNITY_GET_INVITE_LINK':
      return whatsapp.getCommunityInviteLink({ instanceId: job.instanceId, communityJid: communityJidValue(input) });
    case 'COMMUNITY_REVOKE_INVITE_LINK':
      return whatsapp.revokeCommunityInviteLink({ instanceId: job.instanceId, communityJid: communityJidValue(input) });
    case 'COMMUNITY_ACCEPT_INVITE':
      return whatsapp.acceptCommunityInvite({
        instanceId: job.instanceId,
        code: extractGroupInviteCode(stringValue(input, 'code') || stringValue(input, 'url')) ?? '',
      });
    case 'NEWSLETTER_CREATE':
      return whatsapp.createNewsletter({
        instanceId: job.instanceId,
        name: stringValue(input, 'name'),
        description: stringValue(input, 'description') || undefined,
      });
    case 'NEWSLETTER_LIST':
      return whatsapp.listNewsletters({ instanceId: job.instanceId });
    case 'NEWSLETTER_SEARCH':
      return whatsapp.searchNewsletters();
    case 'NEWSLETTER_METADATA':
      return whatsapp.getNewsletterMetadata({
        instanceId: job.instanceId,
        newsletterId: newsletterIdValue(input),
        type: stringValue(input, 'type') === 'invite' ? 'invite' : 'jid',
      });
    case 'NEWSLETTER_FOLLOW':
    case 'NEWSLETTER_UNFOLLOW':
    case 'NEWSLETTER_MUTE':
    case 'NEWSLETTER_UNMUTE':
    case 'NEWSLETTER_DELETE':
      return whatsapp.updateNewsletter({
        instanceId: job.instanceId,
        newsletterId: newsletterIdValue(input),
        action: operation.type === 'NEWSLETTER_FOLLOW'
          ? 'follow'
          : operation.type === 'NEWSLETTER_UNFOLLOW'
            ? 'unfollow'
            : operation.type === 'NEWSLETTER_MUTE'
              ? 'mute'
              : operation.type === 'NEWSLETTER_UNMUTE'
                ? 'unmute'
                : 'delete',
      });
    case 'NEWSLETTER_UPDATE_NAME':
      return whatsapp.updateNewsletterName({ instanceId: job.instanceId, newsletterId: newsletterIdValue(input), name: stringValue(input, 'name') });
    case 'NEWSLETTER_UPDATE_DESCRIPTION':
      return whatsapp.updateNewsletterDescription({ instanceId: job.instanceId, newsletterId: newsletterIdValue(input), description: stringValue(input, 'description') });
    case 'NEWSLETTER_UPDATE_PICTURE':
      return whatsapp.updateNewsletterPicture({
        instanceId: job.instanceId,
        newsletterId: newsletterIdValue(input),
        image: stringValue(input, 'image') || stringValue(input, 'imageUrl') || stringValue(input, 'imageBase64'),
      });
    case 'NEWSLETTER_ACCEPT_ADMIN_INVITE':
      return whatsapp.acceptNewsletterAdminInvite();
    case 'NEWSLETTER_REVOKE_ADMIN_INVITE':
      return whatsapp.revokeNewsletterAdminInvite({
        instanceId: job.instanceId,
        newsletterId: newsletterIdValue(input),
        invitedJid: stringValue(input, 'invitedJid') || stringValue(input, 'phone'),
      });
    case 'NEWSLETTER_REMOVE_ADMIN':
      return whatsapp.removeNewsletterAdmin({
        instanceId: job.instanceId,
        newsletterId: newsletterIdValue(input),
        userJid: stringValue(input, 'userJid') || stringValue(input, 'phone'),
      });
    case 'NEWSLETTER_TRANSFER_OWNERSHIP':
      return whatsapp.transferNewsletterOwnership({
        instanceId: job.instanceId,
        newsletterId: newsletterIdValue(input),
        userJid: stringValue(input, 'userJid') || stringValue(input, 'phone'),
      });
    case 'NEWSLETTER_REACT_MESSAGE':
      return whatsapp.reactNewsletterMessage({
        instanceId: job.instanceId,
        newsletterId: newsletterIdValue(input),
        serverId: stringValue(input, 'serverId') || stringValue(input, 'messageId'),
        reaction: stringValue(input, 'reaction') || stringValue(input, 'emoji') || undefined,
      });
    case 'NEWSLETTER_FETCH_MESSAGES':
      return whatsapp.fetchNewsletterMessages({
        instanceId: job.instanceId,
        newsletterId: newsletterIdValue(input),
        count: numberValue(input, 'count', 20),
        since: numberValue(input, 'since'),
        after: numberValue(input, 'after'),
      });
    case 'BUSINESS_PROFILE':
      return whatsapp.getBusinessProfile({ instanceId: job.instanceId, jid: stringValue(input, 'jid') || stringValue(input, 'phone') || undefined });
    case 'BUSINESS_PROFILE_UPDATE':
      return whatsapp.updateBusinessProfile({ instanceId: job.instanceId, updates: objectValue(input, 'updates') });
    case 'BUSINESS_PRODUCTS_LIST':
      return whatsapp.listBusinessProducts({
        instanceId: job.instanceId,
        jid: stringValue(input, 'jid') || stringValue(input, 'phone') || undefined,
        limit: numberValue(input, 'limit', 10),
        cursor: stringValue(input, 'cursor') || undefined,
      });
    case 'BUSINESS_PRODUCT_GET':
      return whatsapp.getBusinessProduct({
        instanceId: job.instanceId,
        productId: stringValue(input, 'productId'),
        jid: stringValue(input, 'jid') || stringValue(input, 'phone') || undefined,
      });
    case 'BUSINESS_PRODUCT_CREATE':
      return whatsapp.createBusinessProduct({ instanceId: job.instanceId, product: objectValue(input, 'product') });
    case 'BUSINESS_PRODUCT_UPDATE':
      return whatsapp.updateBusinessProduct({
        instanceId: job.instanceId,
        productId: stringValue(input, 'productId'),
        product: objectValue(input, 'product'),
      });
    case 'BUSINESS_PRODUCT_DELETE':
      return whatsapp.deleteBusinessProduct({
        instanceId: job.instanceId,
        productIds: stringArrayValue(input, 'productIds').length > 0
          ? stringArrayValue(input, 'productIds')
          : [stringValue(input, 'productId')].filter(Boolean),
      });
    case 'BUSINESS_COLLECTIONS_LIST':
      return whatsapp.listBusinessCollections({
        instanceId: job.instanceId,
        jid: stringValue(input, 'jid') || stringValue(input, 'phone') || undefined,
        limit: numberValue(input, 'limit', 10),
      });
    case 'BUSINESS_TAGS_CREATE':
      return whatsapp.updateBusinessTag({
        instanceId: job.instanceId,
        name: stringValue(input, 'name'),
        color: numberValue(input, 'color') || undefined,
      });
    case 'BUSINESS_TAGS_UPDATE':
      return whatsapp.updateBusinessTag({
        instanceId: job.instanceId,
        tagId: stringValue(input, 'tagId'),
        name: stringValue(input, 'name'),
        color: numberValue(input, 'color') || undefined,
      });
    case 'BUSINESS_TAGS_DELETE':
      return whatsapp.updateBusinessTag({
        instanceId: job.instanceId,
        tagId: stringValue(input, 'tagId'),
        name: stringValue(input, 'name') || 'deleted',
        deleted: true,
      });
    case 'BUSINESS_TAGS_CHAT_ADD':
    case 'BUSINESS_TAGS_CHAT_REMOVE':
      return whatsapp.updateBusinessChatTag({
        instanceId: job.instanceId,
        remoteJid: stringValue(input, 'remoteJid') || stringValue(input, 'to'),
        tagId: stringValue(input, 'tagId'),
        linked: operation.type === 'BUSINESS_TAGS_CHAT_ADD',
      });
    case 'GROUP_SYNC': {
      const groups = await whatsapp.syncGroups(job.instanceId);
      const saved = [];
      for (const group of groups) {
        saved.push(await saveGroupMetadata(job.instanceId, group));
      }
      const pruned = await pruneStaleGroupCache(
        job.instanceId,
        groups.map(group => group.remoteJid),
      );
      return { count: saved.length, pruned };
    }
    case 'GROUP_CREATE': {
      const created = await whatsapp.createGroup({
        instanceId: job.instanceId,
        name: stringValue(input, 'name') || stringValue(input, 'groupName'),
        participants: stringArrayValue(input, 'participants').length > 0
          ? stringArrayValue(input, 'participants')
          : stringArrayValue(input, 'phones'),
        autoInvite: booleanValue(input, 'autoInvite'),
      });
      const saved = await saveGroupMetadata(job.instanceId, created.group);
      return serializeCreatedGroup(saved, created);
    }
    case 'GROUP_METADATA_SYNC': {
      const groupJid = await resolveOperationGroup(input, operation.groupId);
      const metadata = await whatsapp.getGroupMetadata({ instanceId: job.instanceId, groupJid });
      const saved = await saveGroupMetadata(job.instanceId, metadata);
      return { groupId: saved.id, remoteJid: saved.remoteJid, participants: metadata.participants.length };
    }
    case 'GROUP_UPDATE_NAME': {
      const groupJid = await resolveOperationGroup(input, operation.groupId);
      const group = await whatsapp.updateGroupName({
        instanceId: job.instanceId,
        groupJid,
        name: stringValue(input, 'name'),
      });
      const saved = await saveGroupMetadata(job.instanceId, group);
      return { groupId: saved.id, subject: saved.subject };
    }
    case 'GROUP_UPDATE_DESCRIPTION': {
      const groupJid = await resolveOperationGroup(input, operation.groupId);
      const group = await whatsapp.updateGroupDescription({
        instanceId: job.instanceId,
        groupJid,
        description: stringValue(input, 'description'),
      });
      const saved = await saveGroupMetadata(job.instanceId, group);
      return { groupId: saved.id, description: saved.description };
    }
    case 'GROUP_UPDATE_PHOTO': {
      const groupJid = await resolveOperationGroup(input, operation.groupId);
      const group = await whatsapp.updateGroupPhoto({
        instanceId: job.instanceId,
        groupJid,
        image: stringValue(input, 'image') || stringValue(input, 'imageUrl') || stringValue(input, 'imageBase64'),
      });
      const saved = await saveGroupMetadata(job.instanceId, group);
      return { groupId: saved.id, pictureUrl: saved.pictureUrl };
    }
    case 'GROUP_PARTICIPANTS_ADD': {
      const groupJid = await resolveOperationGroup(input, operation.groupId);
      const result = await whatsapp.addGroupParticipants({
        instanceId: job.instanceId,
        groupJid,
        participants: stringArrayValue(input, 'participants'),
        autoInvite: booleanValue(input, 'autoInvite'),
      });
      const metadata = await whatsapp.getGroupMetadata({ instanceId: job.instanceId, groupJid });
      const saved = await saveGroupMetadata(job.instanceId, metadata);
      return { ...result, groupId: saved.id, participants: metadata.participants.length };
    }
    case 'GROUP_PARTICIPANTS_REMOVE': {
      const groupJid = await resolveOperationGroup(input, operation.groupId);
      const result = await whatsapp.removeGroupParticipants({
        instanceId: job.instanceId,
        groupJid,
        participants: stringArrayValue(input, 'participants'),
      });
      const metadata = await whatsapp.getGroupMetadata({ instanceId: job.instanceId, groupJid });
      const saved = await saveGroupMetadata(job.instanceId, metadata);
      return { result, groupId: saved.id, participants: metadata.participants.length };
    }
    case 'GROUP_ADMINS_PROMOTE': {
      const groupJid = await resolveOperationGroup(input, operation.groupId);
      const result = await whatsapp.promoteGroupAdmins({
        instanceId: job.instanceId,
        groupJid,
        participants: stringArrayValue(input, 'participants'),
      });
      const metadata = await whatsapp.getGroupMetadata({ instanceId: job.instanceId, groupJid });
      const saved = await saveGroupMetadata(job.instanceId, metadata);
      return { result, groupId: saved.id, participants: metadata.participants.length };
    }
    case 'GROUP_ADMINS_DEMOTE': {
      const groupJid = await resolveOperationGroup(input, operation.groupId);
      const result = await whatsapp.demoteGroupAdmins({
        instanceId: job.instanceId,
        groupJid,
        participants: stringArrayValue(input, 'participants'),
      });
      const metadata = await whatsapp.getGroupMetadata({ instanceId: job.instanceId, groupJid });
      const saved = await saveGroupMetadata(job.instanceId, metadata);
      return { result, groupId: saved.id, participants: metadata.participants.length };
    }
    case 'GROUP_REQUESTS_LIST': {
      const groupJid = await resolveOperationGroup(input, operation.groupId);
      const requests = await whatsapp.listGroupJoinRequests({ instanceId: job.instanceId, groupJid });
      return { requests };
    }
    case 'GROUP_REQUESTS_APPROVE':
    case 'GROUP_REQUESTS_REJECT': {
      const groupJid = await resolveOperationGroup(input, operation.groupId);
      const result = await whatsapp.updateGroupJoinRequests({
        instanceId: job.instanceId,
        groupJid,
        participants: stringArrayValue(input, 'participants'),
        action: operation.type === 'GROUP_REQUESTS_APPROVE' ? 'approve' : 'reject',
      });
      const metadata = await whatsapp.getGroupMetadata({ instanceId: job.instanceId, groupJid });
      const saved = await saveGroupMetadata(job.instanceId, metadata);
      return { result, groupId: saved.id, participants: metadata.participants.length };
    }
    case 'GROUP_MENTION': {
      const groupJid = await resolveOperationGroup(input, operation.groupId);
      return whatsapp.mentionGroupParticipants({
        instanceId: job.instanceId,
        groupJid,
        text: stringValue(input, 'text'),
        participants: stringArrayValue(input, 'participants'),
      });
    }
    case 'GROUP_MENTION_ALL': {
      const groupJid = await resolveOperationGroup(input, operation.groupId);
      return whatsapp.mentionAllGroupParticipants({
        instanceId: job.instanceId,
        groupJid,
        text: stringValue(input, 'text'),
      });
    }
    case 'GROUP_MENTION_GROUP': {
      const groupJid = await resolveOperationGroup(input, operation.groupId);
      return whatsapp.mentionGroups({
        instanceId: job.instanceId,
        groupJid,
        text: stringValue(input, 'text'),
        groups: stringArrayValue(input, 'groups').length > 0
          ? stringArrayValue(input, 'groups')
          : stringArrayValue(input, 'mentionedGroups'),
      });
    }
    case 'GROUP_SETTINGS_UPDATE': {
      const groupJid = await resolveOperationGroup(input, operation.groupId);
      const settings = {
        messages: stringValue(input, 'messages') === 'admins' || stringValue(input, 'messages') === 'all'
          ? stringValue(input, 'messages') as 'admins' | 'all'
          : undefined,
        info: stringValue(input, 'info') === 'admins' || stringValue(input, 'info') === 'all'
          ? stringValue(input, 'info') as 'admins' | 'all'
          : undefined,
        addMembers: stringValue(input, 'addMembers') === 'admins' || stringValue(input, 'addMembers') === 'all'
          ? stringValue(input, 'addMembers') as 'admins' | 'all'
          : undefined,
        joinApproval: typeof input.joinApproval === 'boolean' ? input.joinApproval : undefined,
        ephemeralSeconds: typeof input.ephemeralSeconds === 'number' ? numberValue(input, 'ephemeralSeconds') : undefined,
      };
      const metadata = await whatsapp.updateGroupSettings({ instanceId: job.instanceId, groupJid, settings });
      const saved = await saveGroupMetadata(job.instanceId, metadata);
      return {
        groupId: saved.id,
        announce: saved.announce,
        restrict: saved.restrict,
        memberAddMode: saved.memberAddMode,
        joinApprovalMode: saved.joinApprovalMode,
        ephemeralDuration: saved.ephemeralDuration,
      };
    }
    case 'GROUP_LEAVE': {
      const groupJid = await resolveOperationGroup(input, operation.groupId);
      const result = await whatsapp.leaveGroup({ instanceId: job.instanceId, groupJid });
      await deleteGroupCache(job.instanceId, [groupJid]);
      return result;
    }
    case 'GROUP_GET_INVITE_LINK': {
      const groupJid = await resolveOperationGroup(input, operation.groupId);
      const result = await whatsapp.getGroupInviteLink({ instanceId: job.instanceId, groupJid });
      await saveGroupInviteCode(job.instanceId, groupJid, result.code);
      return result;
    }
    case 'GROUP_REVOKE_INVITE_LINK': {
      const groupJid = await resolveOperationGroup(input, operation.groupId);
      const result = await whatsapp.revokeGroupInviteLink({ instanceId: job.instanceId, groupJid });
      await saveGroupInviteCode(job.instanceId, groupJid, result.code);
      return result;
    }
    case 'GROUP_ACCEPT_INVITE':
      return whatsapp.acceptGroupInvite({
        instanceId: job.instanceId,
        code: extractGroupInviteCode(stringValue(input, 'code') || stringValue(input, 'url')) ?? '',
      });
    case 'GROUP_INVITE_METADATA':
      return whatsapp.getGroupInviteMetadata({
        instanceId: job.instanceId,
        code: extractGroupInviteCode(stringValue(input, 'code') || stringValue(input, 'url')) ?? '',
      });
    case 'CHAT_READ': {
      const chat = await findOperationChat(operation.id, operation.chatId);
      const messages = await prisma.message.findMany({
        where: { chatId: chat.id, fromMe: false, externalId: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      await whatsapp.readChat({
        instanceId: job.instanceId,
        keys: messages
          .filter(message => message.externalId)
          .map(message => ({
            remoteJid: chat.remoteJid,
            id: message.externalId ?? '',
            fromMe: false,
          })),
      });
      await prisma.chat.update({
        where: { id: chat.id },
        data: { isRead: true, unreadCount: 0 },
      });
      return { read: true };
    }
    case 'CHAT_ARCHIVE': {
      const chat = await findOperationChat(operation.id, operation.chatId);
      const archived = booleanValue(input, 'archived', true);
      await whatsapp.archiveChat({ instanceId: job.instanceId, remoteJid: chat.remoteJid, archived, lastMessages: await getChatLastMessages(chat) });
      await prisma.chat.update({
        where: { id: chat.id },
        data: { archivedAt: archived ? new Date() : null },
      });
      return { archived };
    }
    case 'CHAT_PIN': {
      const chat = await findOperationChat(operation.id, operation.chatId);
      const pinned = booleanValue(input, 'pinned', true);
      await whatsapp.pinChat({ instanceId: job.instanceId, remoteJid: chat.remoteJid, pinned });
      await prisma.chat.update({
        where: { id: chat.id },
        data: { pinnedAt: pinned ? new Date() : null },
      });
      return { pinned };
    }
    case 'CHAT_MUTE': {
      const chat = await findOperationChat(operation.id, operation.chatId);
      const mutedUntil = nullableStringValue(input, 'mutedUntil');
      await whatsapp.muteChat({ instanceId: job.instanceId, remoteJid: chat.remoteJid, mutedUntil });
      await prisma.chat.update({
        where: { id: chat.id },
        data: { mutedUntil: mutedUntil ? new Date(mutedUntil) : null },
      });
      return { mutedUntil };
    }
    case 'CHAT_CLEAR': {
      const chat = await findOperationChat(operation.id, operation.chatId);
      await whatsapp.clearChat({ instanceId: job.instanceId, remoteJid: chat.remoteJid, lastMessages: await getChatLastMessages(chat) });
      await prisma.message.deleteMany({ where: { chatId: chat.id } });
      return { cleared: true };
    }
    case 'CHAT_DELETE': {
      const chat = await findOperationChat(operation.id, operation.chatId);
      await whatsapp.deleteChat({ instanceId: job.instanceId, remoteJid: chat.remoteJid, lastMessages: await getChatLastMessages(chat) });
      await prisma.chat.update({
        where: { id: chat.id },
        data: { deletedAt: new Date() },
      });
      return { deleted: true };
    }
    case 'CHAT_EPHEMERAL': {
      const chat = await findOperationChat(operation.id, operation.chatId);
      const expirationSeconds = numberValue(input, 'expirationSeconds');
      await whatsapp.setChatEphemeral({ instanceId: job.instanceId, remoteJid: chat.remoteJid, expirationSeconds });
      await prisma.chat.update({
        where: { id: chat.id },
        data: { ephemeralExpiration: expirationSeconds },
      });
      return { expirationSeconds };
    }
    default:
      throw new Error(`Unsupported WhatsApp operation type: ${operation.type}`);
  }
}

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
      await syncInstanceGroups(instanceId, organizationId, 'connection.open');
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
      if (!reason.shouldReconnect) {
        await instanceLocks.release(instanceId);
      }
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
      type: 'TEXT' | 'IMAGE' | 'AUDIO' | 'DOCUMENT' | 'VIDEO' | 'STICKER' | 'UNKNOWN';
      body?: string;
      media?: {
        bytes: Buffer;
        mimeType: string;
        extension: string;
      };
      mediaUrl?: string;
      mediaDownloadError?: string;
      participantJid?: string;
    }) => {
      const isGroupMessage = message.remoteJid.endsWith('@g.us');
      const remoteAliases = getRemoteJidAliases(uniqueValues([message.remoteJid, ...(message.aliases ?? [])]));
      const phoneAliases = uniqueValues(remoteAliases.flatMap(jid => getBrazilPhoneAliases(jid.replace(/\D/g, ''))));
      const contact = isGroupMessage ? null : await prisma.contact.findFirst({
        where: {
          organizationId,
          OR: [
            { remoteJid: { in: remoteAliases } },
            { phoneE164: { in: phoneAliases } },
          ],
        },
      });
      const chatRemoteJid = isGroupMessage ? message.remoteJid : contact?.remoteJid ?? message.remoteJid;

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
          isRead: message.fromMe,
          unreadCount: message.fromMe ? 0 : 1,
        },
        update: {
          updatedAt: new Date(),
          deletedAt: null,
          isRead: message.fromMe ? true : false,
          unreadCount: message.fromMe ? 0 : { increment: 1 },
        },
      });
      const savedMedia = message.mediaUrl ? undefined : await saveIncomingMedia({
        instanceId,
        externalId: message.externalId,
        media: message.media,
      });
      const mediaUrl = message.mediaUrl ?? savedMedia?.mediaUrl;
      const mediaExpiresAt = savedMedia?.mediaExpiresAt;
      const mediaFailureReason =
        ['IMAGE', 'AUDIO', 'DOCUMENT', 'VIDEO', 'STICKER'].includes(message.type) && !mediaUrl
          ? message.mediaDownloadError ?? 'Media download did not return a file'
          : null;

      if (['IMAGE', 'AUDIO', 'DOCUMENT', 'VIDEO', 'STICKER'].includes(message.type) && !mediaUrl) {
        logger.warn('Incoming media did not produce a media file', {
          instanceId,
          organizationId,
          externalId: message.externalId,
          remoteJid: message.remoteJid,
          type: message.type,
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
            participantJid: message.participantJid ?? existingMessage.participantJid,
            body: message.body ?? existingMessage.body,
            mediaUrl: mediaUrl ?? existingMessage.mediaUrl,
            mediaExpiresAt: mediaExpiresAt ?? existingMessage.mediaExpiresAt,
            failureReason: mediaFailureReason ?? existingMessage.failureReason,
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
          participantJid: message.participantJid,
          externalId: message.externalId,
          fromMe: message.fromMe,
          type: message.type,
          body: message.body,
          mediaUrl,
          mediaExpiresAt,
          failureReason: mediaFailureReason,
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
    await prisma.whatsAppInstance.update({
      where: { id: instanceId },
      data: { status: 'CONNECTING', qrCode: null, qrUpdatedAt: null },
    });

    try {
      const result = await connectWhatsAppInstance({
        instanceId,
        organizationId,
        clearSession,
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
      if (env.BAILEYS_AUTH_STORE === 'database') {
        await clearPrismaBaileysAuthState(instanceId);
      } else {
        await whatsapp.clearSession({ instanceId, sessionBasePath: sessionStoragePath });
      }
      await instanceLocks.release(instanceId);
    } else {
      await whatsapp.disconnect(instanceId);
      await instanceLocks.release(instanceId);
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

        await connectWhatsAppInstance({ instanceId, organizationId });
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

  new Worker<WhatsAppOperationJob>(
  queueNames.whatsappOperation,
  async job => {
    const { operationId, instanceId, organizationId } = job.data;
    const jobContext = { queueName: queueNames.whatsappOperation, name: job.name, organizationId, instanceId };

    await logJob({ ...jobContext, status: 'STARTED', payload: job.data });
    await prisma.whatsAppOperation.update({
      where: { id: operationId },
      data: { status: 'RUNNING', error: null },
    });

    try {
      const result = await runWhatsAppOperation(job.data);
      await prisma.whatsAppOperation.update({
        where: { id: operationId },
        data: {
          status: 'SUCCESS',
          result: JSON.parse(JSON.stringify(result ?? null)),
          error: null,
        },
      });
      await logJob({ ...jobContext, status: 'SUCCESS', payload: job.data });
      logger.info('WhatsApp operation completed', {
        operationId,
        instanceId,
        organizationId,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await prisma.whatsAppOperation.update({
        where: { id: operationId },
        data: {
          status: 'FAILED',
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
    await connectWhatsAppInstance({
      instanceId: instance.id,
      organizationId: instance.organizationId,
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
  await instanceLocks.releaseAll();
  await redis.quit();
  await dispatchWebhookQueue.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.once('SIGTERM', signal => void shutdown(signal));
process.once('SIGINT', signal => void shutdown(signal));
