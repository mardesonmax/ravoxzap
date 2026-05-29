import type { FastifyInstance, FastifyRequest } from 'fastify';
import { nanoid } from 'nanoid';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

import {
  createApiKey,
  getApiKeyPreview,
  hashApiKey,
  hashPassword,
  verifyPassword,
} from '@ravoxzap/auth';
import type { Env } from '@ravoxzap/config';
import { prisma } from '@ravoxzap/database';
import type { RavoxQueues } from '@ravoxzap/queue';
import {
  createApiKeySchema,
  createContactSchema,
  createInstanceSchema,
  createOrganizationSchema,
  createSessionSchema,
  createWebhookSchema,
  contactQuerySchema,
  registerSchema,
  sendTextMessageSchema,
  updateOrganizationSchema,
  updateWebhookSchema,
  type WhatsAppOperationType,
  type WebhookEvent,
} from '@ravoxzap/shared';

import { AppError } from '../errors/app-error.js';
import {
  assertInstanceAccess,
  assertOrganizationAccess,
  authenticateApiKey,
  getCurrentUser,
} from '../lib/auth.js';
import { slugify } from '../lib/slug.js';
import { createWebhookSecret, webhookEventFromDb, webhookEventToDb } from '../lib/webhook.js';

const idParamsSchema = z.object({ id: z.string().min(1) });
const instanceIdParamsSchema = z.object({ instanceId: z.string().min(1) });
const chatParamsSchema = z.object({ id: z.string().min(1), chatId: z.string().min(1) });
const publicChatParamsSchema = z.object({ instanceId: z.string().min(1), chatId: z.string().min(1) });
const operationParamsSchema = z.object({ instanceId: z.string().min(1), operationId: z.string().min(1) });
const groupParamsSchema = z.object({ instanceId: z.string().min(1), groupId: z.string().min(1) });
const privateGroupParamsSchema = z.object({ id: z.string().min(1), groupId: z.string().min(1) });
const inviteCodeParamsSchema = z.object({ instanceId: z.string().min(1), code: z.string().min(1) });
const webhookQuerySchema = z.object({ instanceId: z.string().min(1).optional() });
const groupCreateBodySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  groupName: z.string().trim().min(1).max(120).optional(),
  participants: z.array(z.string().trim().min(1)).min(1).max(256).optional(),
  phones: z.array(z.string().trim().min(1)).min(1).max(256).optional(),
  autoInvite: z.boolean().optional(),
}).superRefine((body, context) => {
  if (!body.name && !body.groupName) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Informe name ou groupName.',
      path: ['name'],
    });
  }

  if (!body.participants?.length && !body.phones?.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Informe participants ou phones.',
      path: ['participants'],
    });
  }
}).transform(body => {
  const name = body.name ?? body.groupName ?? '';
  const participants = body.participants ?? body.phones ?? [];

  return {
    name,
    groupName: name,
    participants,
    phones: participants,
    autoInvite: body.autoInvite ?? false,
  };
});
const groupPhotoBodySchema = z.object({
  image: z.string().trim().min(1).optional(),
  imageUrl: z.string().trim().min(1).optional(),
  imageBase64: z.string().trim().min(1).optional(),
}).superRefine((body, context) => {
  if (!body.image && !body.imageUrl && !body.imageBase64) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Informe image, imageUrl ou imageBase64.',
      path: ['image'],
    });
  }
}).transform(body => ({
  image: body.image ?? body.imageUrl ?? body.imageBase64 ?? '',
}));
const participantsBodySchema = z.object({
  participants: z.array(z.string().trim().min(1)).min(1).max(256),
});
const addParticipantsBodySchema = participantsBodySchema.extend({
  autoInvite: z.boolean().optional(),
});
const groupSettingsBodySchema = z.object({
  messages: z.enum(['admins', 'all']).optional(),
  info: z.enum(['admins', 'all']).optional(),
  addMembers: z.enum(['admins', 'all']).optional(),
  joinApproval: z.boolean().optional(),
  ephemeralSeconds: z.number().int().min(0).max(31_536_000).optional(),
}).refine(body => Object.values(body).some(value => value !== undefined), {
  message: 'Informe pelo menos uma configuração.',
});
const groupMentionGroupsBodySchema = z.object({
  text: z.string().min(1).max(4096),
  groups: z.array(z.string().trim().min(1)).min(1).max(32).optional(),
  mentionedGroups: z.array(z.string().trim().min(1)).min(1).max(32).optional(),
}).superRefine((body, context) => {
  if (!body.groups?.length && !body.mentionedGroups?.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Informe groups ou mentionedGroups.',
      path: ['groups'],
    });
  }
}).transform(body => ({
  text: body.text,
  groups: body.groups ?? body.mentionedGroups ?? [],
  mentionedGroups: body.groups ?? body.mentionedGroups ?? [],
}));
const inviteCodeBodySchema = z.object({
  code: z.string().trim().min(1).optional(),
  url: z.string().trim().min(1).optional(),
}).superRefine((body, context) => {
  if (!body.code && !body.url) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Informe code ou url.',
      path: ['code'],
    });
  }
});
const phoneParamsSchema = z.object({ instanceId: z.string().min(1), phone: z.string().min(1) });
const communityParamsSchema = z.object({ instanceId: z.string().min(1), communityId: z.string().min(1) });
const newsletterParamsSchema = z.object({ instanceId: z.string().min(1), newsletterId: z.string().min(1) });
const queueItemParamsSchema = z.object({ instanceId: z.string().min(1), queueItemId: z.string().min(1) });
const paginationQuerySchema = z.object({
  start: z.coerce.number().int().min(0).default(0),
  end: z.coerce.number().int().min(0).default(100),
});
const toBodySchema = z.object({ to: z.string().min(1) });
const messageKeyBodyBaseSchema = z.object({
  remoteJid: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
  messageId: z.string().min(1),
  fromMe: z.boolean().optional(),
});
const messageKeyBodySchema = messageKeyBodyBaseSchema.refine(body => body.remoteJid || body.to, {
  message: 'Informe remoteJid ou to.',
  path: ['remoteJid'],
});
const contactCardSchema = z.object({
  displayName: z.string().min(1).max(180),
  phone: z.string().min(3).optional(),
  vcard: z.string().min(1).optional(),
});
const privacyValueBodySchema = z.object({
  value: z.enum(['all', 'contacts', 'contact_blacklist', 'none']),
});
const onlinePrivacyBodySchema = z.object({
  value: z.enum(['all', 'match_last_seen']),
});
const readReceiptsBodySchema = z.object({
  value: z.enum(['all', 'none']),
});
const groupAddPrivacyBodySchema = z.object({
  value: z.enum(['all', 'contacts', 'contact_blacklist']),
});
const disappearingBodySchema = z.object({
  duration: z.number().int().min(0).max(31_536_000).optional(),
  seconds: z.number().int().min(0).max(31_536_000).optional(),
}).refine(body => body.duration !== undefined || body.seconds !== undefined, {
  message: 'Informe duration ou seconds.',
});
const statusRecipientsSchema = z.object({
  recipients: z.array(z.string().min(1)).max(1024).optional(),
});
const communityBodySchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2048).optional(),
});
const communityGroupsBodySchema = z.object({
  groups: z.array(z.string().min(1)).min(1).max(128).optional(),
  groupJids: z.array(z.string().min(1)).min(1).max(128).optional(),
}).refine(body => body.groups?.length || body.groupJids?.length, {
  message: 'Informe groups ou groupJids.',
});
const newsletterBodySchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2048).optional(),
});
const newsletterAdminBodySchema = z.object({
  phone: z.string().min(3).optional(),
  userJid: z.string().min(1).optional(),
  invitedJid: z.string().min(1).optional(),
}).refine(body => body.phone || body.userJid || body.invitedJid, {
  message: 'Informe phone, userJid ou invitedJid.',
});
const businessProductBodySchema = z.object({
  product: z.record(z.string(), z.unknown()),
});
const businessProfileBodySchema = z.object({
  updates: z.record(z.string(), z.unknown()),
});
const businessTagBodySchema = z.object({
  name: z.string().min(1).max(120),
  color: z.number().int().optional(),
});
const sendFileFieldsSchema = z.object({
  instanceId: z.string().min(1),
  to: z.string().min(6),
  body: z.string().max(1024).optional(),
});
const mediaStoragePath = path.resolve(process.cwd(), '../../storage/media');
const publicMediaLimits = {
  IMAGE: 15 * 1024 * 1024,
  AUDIO: 20 * 1024 * 1024,
  VIDEO: 100 * 1024 * 1024,
  DOCUMENT: 50 * 1024 * 1024,
} as const;
const publicMediaFallbackMime = {
  IMAGE: 'image/jpeg',
  AUDIO: 'audio/mpeg',
  VIDEO: 'video/mp4',
  DOCUMENT: 'application/octet-stream',
} as const;

type PublicMediaType = keyof typeof publicMediaLimits;

function parseBody<TSchema extends z.ZodTypeAny>(request: FastifyRequest, schema: TSchema): z.infer<TSchema> {
  return schema.parse(request.body);
}

function parseParams<TSchema extends z.ZodTypeAny>(
  request: FastifyRequest,
  schema: TSchema,
): z.infer<TSchema> {
  return schema.parse(request.params);
}

function parseQuery<TSchema extends z.ZodTypeAny>(
  request: FastifyRequest,
  schema: TSchema,
): z.infer<TSchema> {
  return schema.parse(request.query);
}

function publicInstance(instance: {
  id: string;
  organizationId: string;
  name: string;
  status: string;
  phoneNumber: string | null;
  profileName: string | null;
  qrCode?: string | null;
  qrUpdatedAt?: Date | null;
  lastConnectedAt: Date | null;
  disconnectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...instance,
    createdAt: instance.createdAt.toISOString(),
    updatedAt: instance.updatedAt.toISOString(),
    qrUpdatedAt: instance.qrUpdatedAt?.toISOString() ?? null,
    lastConnectedAt: instance.lastConnectedAt?.toISOString() ?? null,
    disconnectedAt: instance.disconnectedAt?.toISOString() ?? null,
  };
}

function publicContact(contact: {
  id: string;
  organizationId: string;
  name: string;
  ddi: string;
  ddd: string;
  number: string;
  phoneE164: string;
  remoteJid: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...contact,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
}

function formatDashboardDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^\w.\-() ]+/g, '_').replace(/\s+/g, ' ').trim() || 'arquivo';
}

function extensionFromFile(fileName: string, mimeType: string) {
  const extension = path.extname(fileName).replace('.', '').toLowerCase();
  if (extension) return extension;
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('pdf')) return 'pdf';
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('mp4')) return 'mp4';
  return 'bin';
}

function mimeTypeFromFileName(fileName: string) {
  const extension = path.extname(fileName).replace('.', '').toLowerCase();
  const mimeByExtension: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    ogg: 'audio/ogg',
    opus: 'audio/ogg',
    wav: 'audio/wav',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    pdf: 'application/pdf',
  };

  return mimeByExtension[extension];
}

function messageTypeFromMime(mimeType: string) {
  if (mimeType.startsWith('image/')) return 'IMAGE' as const;
  if (mimeType.startsWith('audio/')) return 'AUDIO' as const;
  if (mimeType.startsWith('video/')) return 'VIDEO' as const;
  return 'DOCUMENT' as const;
}

function remoteJidFromPhone(to: string) {
  if (to.endsWith('@s.whatsapp.net') || to.endsWith('@g.us')) return to;
  return `${to.replace(/\D/g, '')}@s.whatsapp.net`;
}

function serializeOperation(operation: {
  id: string;
  instanceId: string;
  type: string;
  status: string;
  input: unknown;
  result: unknown;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    operationId: operation.id,
    instanceId: operation.instanceId,
    type: operation.type,
    status: operation.status,
    input: operation.input,
    result: operation.result,
    error: operation.error,
    createdAt: operation.createdAt.toISOString(),
    updatedAt: operation.updatedAt.toISOString(),
  };
}

function serializeGroup(group: {
  id: string;
  instanceId: string;
  remoteJid: string;
  subject: string;
  description: string | null;
  ownerJid: string | null;
  size: number | null;
  announce: boolean | null;
  restrict: boolean | null;
  memberAddMode?: boolean | null;
  joinApprovalMode?: boolean | null;
  ephemeralDuration?: number | null;
  pictureUrl?: string | null;
  inviteCode: string | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  participants?: Array<{
    id: string;
    jid: string;
    name: string | null;
    isAdmin: boolean;
    isSuperAdmin: boolean;
  }>;
}) {
  return {
    ...group,
    lastSyncedAt: group.lastSyncedAt?.toISOString() ?? null,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  };
}

function serializeChat(chat: {
  id: string;
  instanceId: string;
  remoteJid: string;
  name: string | null;
  archivedAt: Date | null;
  pinnedAt: Date | null;
  mutedUntil: Date | null;
  isRead: boolean;
  unreadCount: number;
  ephemeralExpiration: number | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  messages?: Array<{
    id: string;
    body: string | null;
    type: string;
    fromMe: boolean;
    status: string;
    mediaUrl?: string | null;
    createdAt: Date;
  }>;
}) {
  return {
    ...chat,
    archivedAt: chat.archivedAt?.toISOString() ?? null,
    pinnedAt: chat.pinnedAt?.toISOString() ?? null,
    mutedUntil: chat.mutedUntil?.toISOString() ?? null,
    deletedAt: chat.deletedAt?.toISOString() ?? null,
    createdAt: chat.createdAt.toISOString(),
    updatedAt: chat.updatedAt.toISOString(),
    messages: chat.messages?.map(message => ({
      ...message,
      createdAt: message.createdAt.toISOString(),
    })),
  };
}

function assertMimeMatchesMediaType(type: PublicMediaType, mimeType: string) {
  if (type === 'DOCUMENT') return;
  const expectedPrefix = `${type.toLowerCase()}/`;
  if (!mimeType.startsWith(expectedPrefix)) {
    throw new AppError(`Expected ${type.toLowerCase()} media, received ${mimeType}`, 422, 'MEDIA_TYPE_MISMATCH');
  }
}

async function loadPublicMedia(input: {
  source: string;
  type: PublicMediaType;
  fileName?: string;
}) {
  const limit = publicMediaLimits[input.type];
  const dataUrlMatch = input.source.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/s);

  if (dataUrlMatch) {
    const mimeType = dataUrlMatch[1] ?? publicMediaFallbackMime[input.type];
    assertMimeMatchesMediaType(input.type, mimeType);
    const buffer = Buffer.from(dataUrlMatch[2] ?? '', 'base64');
    if (!buffer.length) throw new AppError('Media payload is empty', 400, 'MEDIA_EMPTY');
    if (buffer.byteLength > limit) throw new AppError('Media exceeds size limit', 413, 'MEDIA_TOO_LARGE');

    return {
      buffer,
      mimeType,
      fileName: sanitizeFileName(input.fileName ?? `media.${extensionFromFile('', mimeType)}`),
    };
  }

  let mediaUrl: URL;
  try {
    mediaUrl = new URL(input.source);
  } catch {
    throw new AppError('Media must be an HTTP URL or data URL base64', 422, 'INVALID_MEDIA_SOURCE');
  }

  if (!['http:', 'https:'].includes(mediaUrl.protocol)) {
    throw new AppError('Media URL must use http or https', 422, 'INVALID_MEDIA_URL');
  }

  const response = await fetch(mediaUrl);
  if (!response.ok) {
    throw new AppError('Unable to download media', 400, 'MEDIA_DOWNLOAD_FAILED');
  }

  const contentLength = Number(response.headers.get('content-length') ?? '0');
  if (contentLength > limit) {
    throw new AppError('Media exceeds size limit', 413, 'MEDIA_TOO_LARGE');
  }

  const headerMimeType = response.headers.get('content-type')?.split(';')[0]?.trim();
  const sourceName = path.basename(mediaUrl.pathname) || `media.${extensionFromFile('', publicMediaFallbackMime[input.type])}`;
  const mimeType = headerMimeType && headerMimeType !== 'application/octet-stream'
    ? headerMimeType
    : mimeTypeFromFileName(sourceName) ?? publicMediaFallbackMime[input.type];
  assertMimeMatchesMediaType(input.type, mimeType);

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new AppError('Media payload is empty', 400, 'MEDIA_EMPTY');
  if (buffer.byteLength > limit) throw new AppError('Media exceeds size limit', 413, 'MEDIA_TOO_LARGE');

  return {
    buffer,
    mimeType,
    fileName: sanitizeFileName(input.fileName ?? sourceName),
  };
}

async function dispatchWebhookEvent(
  queues: RavoxQueues,
  input: {
    organizationId: string;
    instanceId?: string;
    event: WebhookEvent;
    data: Record<string, unknown>;
  },
) {
  const dbEvent = webhookEventToDb(input.event);
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

    await queues.dispatchWebhook.add('dispatch-webhook', {
      deliveryId: delivery.id,
      webhookId: webhook.id,
      payload,
    });
  }
}

export function registerRoutes(app: FastifyInstance, queues: RavoxQueues, env: Env) {
  async function getPublicInstance(request: FastifyRequest) {
    const apiKey = await authenticateApiKey(request, env.API_KEY_SECRET);
    const { instanceId } = parseParams(request, instanceIdParamsSchema);
    const instance = await prisma.whatsAppInstance.findFirst({
      where: { id: instanceId, organizationId: apiKey.organizationId },
    });

    if (!instance) throw new AppError('Instance not found', 404, 'INSTANCE_NOT_FOUND');

    return { apiKey, instance, instanceId };
  }

  async function enqueueOperation(input: {
    organizationId: string;
    instanceId: string;
    type: WhatsAppOperationType;
    payload: Record<string, unknown>;
    chatId?: string;
    groupId?: string;
  }) {
    const operation = await prisma.whatsAppOperation.create({
      data: {
        organizationId: input.organizationId,
        instanceId: input.instanceId,
        chatId: input.chatId,
        groupId: input.groupId,
        type: input.type,
        input: JSON.parse(JSON.stringify(input.payload)),
      },
    });

    await queues.whatsappOperation.add('whatsapp-operation', {
      operationId: operation.id,
      instanceId: input.instanceId,
      organizationId: input.organizationId,
    });

    return { operationId: operation.id, status: operation.status };
  }

  async function enqueuePublicOperation(request: FastifyRequest, type: WhatsAppOperationType, payload: Record<string, unknown>) {
    const { apiKey, instanceId } = await getPublicInstance(request);
    return enqueueOperation({
      organizationId: apiKey.organizationId,
      instanceId,
      type,
      payload,
    });
  }

  async function getScopedPublicChat(request: FastifyRequest) {
    const { instanceId } = await getPublicInstance(request);
    const { chatId } = parseParams(request, publicChatParamsSchema);
    const chat = await prisma.chat.findFirst({
      where: { id: chatId, instanceId, deletedAt: null },
    });

    if (!chat) throw new AppError('Chat not found', 404, 'CHAT_NOT_FOUND');
    return { chat, instanceId };
  }

  async function enqueuePublicChatOperation(
    request: FastifyRequest,
    type: WhatsAppOperationType,
    payload: Record<string, unknown>,
  ) {
    const { apiKey, instanceId } = await getPublicInstance(request);
    const { chatId } = parseParams(request, publicChatParamsSchema);
    const chat = await prisma.chat.findFirst({
      where: { id: chatId, instanceId, deletedAt: null },
      select: { id: true },
    });

    if (!chat) throw new AppError('Chat not found', 404, 'CHAT_NOT_FOUND');

    return enqueueOperation({
      organizationId: apiKey.organizationId,
      instanceId,
      type,
      payload,
      chatId: chat.id,
    });
  }

  async function getScopedPublicGroup(request: FastifyRequest) {
    const { instanceId } = await getPublicInstance(request);
    const { groupId } = parseParams(request, groupParamsSchema);
    const decodedGroupId = decodeURIComponent(groupId);
    const group = await prisma.whatsAppGroup.findFirst({
      where: {
        instanceId,
        OR: [
          { id: decodedGroupId },
          { remoteJid: decodedGroupId },
        ],
      },
      include: { participants: { orderBy: [{ isSuperAdmin: 'desc' }, { isAdmin: 'desc' }, { jid: 'asc' }] } },
    });

    if (!group) throw new AppError('Group not found', 404, 'GROUP_NOT_FOUND');
    return { group, instanceId };
  }

  async function enqueuePublicGroupOperation(
    request: FastifyRequest,
    type: WhatsAppOperationType,
    payload: Record<string, unknown>,
  ) {
    const { apiKey, instanceId } = await getPublicInstance(request);
    const { groupId } = parseParams(request, groupParamsSchema);
    const decodedGroupId = decodeURIComponent(groupId);
    const group = await prisma.whatsAppGroup.findFirst({
      where: {
        instanceId,
        OR: [
          { id: decodedGroupId },
          { remoteJid: decodedGroupId },
        ],
      },
      select: { id: true, remoteJid: true },
    });

    if (!group && !decodedGroupId.endsWith('@g.us')) {
      throw new AppError('Group not found', 404, 'GROUP_NOT_FOUND');
    }

    return enqueueOperation({
      organizationId: apiKey.organizationId,
      instanceId,
      type,
      payload: {
        ...payload,
        groupRemoteJid: group?.remoteJid ?? decodedGroupId,
      },
      groupId: group?.id,
    });
  }

  async function getScopedPrivateGroup(request: FastifyRequest) {
    const { id, groupId } = parseParams(request, privateGroupParamsSchema);
    const instance = await assertInstanceAccess(request, id, ['OWNER', 'ADMIN', 'MEMBER']);
    const decodedGroupId = decodeURIComponent(groupId);
    const group = await prisma.whatsAppGroup.findFirst({
      where: {
        instanceId: instance.id,
        OR: [
          { id: decodedGroupId },
          { remoteJid: decodedGroupId },
        ],
      },
      include: { participants: { orderBy: [{ isSuperAdmin: 'desc' }, { isAdmin: 'desc' }, { jid: 'asc' }] } },
    });

    if (!group) throw new AppError('Group not found', 404, 'GROUP_NOT_FOUND');
    return { group, instance };
  }

  async function enqueuePrivateGroupOperation(
    request: FastifyRequest,
    type: WhatsAppOperationType,
    payload: Record<string, unknown>,
  ) {
    const { id, groupId } = parseParams(request, privateGroupParamsSchema);
    const instance = await assertInstanceAccess(request, id, ['OWNER', 'ADMIN']);
    const decodedGroupId = decodeURIComponent(groupId);
    const group = await prisma.whatsAppGroup.findFirst({
      where: {
        instanceId: instance.id,
        OR: [
          { id: decodedGroupId },
          { remoteJid: decodedGroupId },
        ],
      },
      select: { id: true, remoteJid: true },
    });

    if (!group && !decodedGroupId.endsWith('@g.us')) {
      throw new AppError('Group not found', 404, 'GROUP_NOT_FOUND');
    }

    return enqueueOperation({
      organizationId: instance.organizationId,
      instanceId: instance.id,
      type,
      payload: {
        ...payload,
        groupRemoteJid: group?.remoteJid ?? decodedGroupId,
      },
      groupId: group?.id,
    });
  }

  async function enqueuePrivateChatOperation(
    request: FastifyRequest,
    type: WhatsAppOperationType,
    payload: Record<string, unknown>,
  ) {
    const { id, chatId } = parseParams(request, chatParamsSchema);
    const instance = await assertInstanceAccess(request, id, ['OWNER', 'ADMIN', 'MEMBER']);
    const chat = await prisma.chat.findFirst({
      where: { id: chatId, instanceId: instance.id, deletedAt: null },
      select: { id: true },
    });

    if (!chat) throw new AppError('Chat not found', 404, 'CHAT_NOT_FOUND');

    return enqueueOperation({
      organizationId: instance.organizationId,
      instanceId: instance.id,
      type,
      payload,
      chatId: chat.id,
    });
  }

  app.post('/auth/register', async (request, reply) => {
    const data = parseBody(request, registerSchema);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });

    if (existing) {
      throw new AppError('E-mail already registered', 409, 'EMAIL_ALREADY_REGISTERED');
    }

    const passwordHash = await hashPassword(data.password);
    const organizationName = data.organizationName ?? `${data.name}'s Organization`;
    const baseSlug = slugify(organizationName) || 'organization';
    const organizationSlug = `${baseSlug}-${nanoid(6).toLowerCase()}`;

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        memberships: {
          create: {
            role: 'OWNER',
            organization: {
              create: {
                name: organizationName,
                slug: organizationSlug,
              },
            },
          },
        },
      },
      include: { memberships: true },
    });

    const token = app.jwt.sign({ email: user.email }, { sub: user.id });
    reply.status(201).send({
      token,
      user: { id: user.id, name: user.name, email: user.email },
      organizationId: user.memberships[0]?.organizationId,
    });
  });

  app.post('/auth/session', async (request, reply) => {
    const data = parseBody(request, createSessionSchema);
    const user = await prisma.user.findUnique({ where: { email: data.email } });

    if (!user || !(await verifyPassword(data.password, user.passwordHash))) {
      throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
    }

    const token = app.jwt.sign({ email: user.email }, { sub: user.id });
    reply.status(201).send({
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  });

  app.get('/account', async request => {
    const user = await getCurrentUser(request);
    const organizations = await prisma.organization.findMany({
      where: { members: { some: { userId: user.id } } },
      orderBy: { createdAt: 'asc' },
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      organizations,
    };
  });

  app.get('/dashboard/summary', async request => {
    const user = await getCurrentUser(request);
    const organizationIds = user.memberships.map(item => item.organizationId);
    const now = new Date();
    const lastMonth = new Date(now);
    lastMonth.setDate(now.getDate() - 29);
    lastMonth.setHours(0, 0, 0, 0);

    const [
      instances,
      messages,
      contactsCount,
      apiKeysCount,
      webhooksCount,
      recentMessages,
    ] = await Promise.all([
      prisma.whatsAppInstance.findMany({
        where: { organizationId: { in: organizationIds } },
        select: {
          id: true,
          name: true,
          status: true,
          phoneNumber: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.message.findMany({
        where: {
          createdAt: { gte: lastMonth },
          instance: { organizationId: { in: organizationIds } },
        },
        select: {
          createdAt: true,
          fromMe: true,
          type: true,
          status: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.contact.count({ where: { organizationId: { in: organizationIds } } }),
      prisma.apiKey.count({ where: { organizationId: { in: organizationIds }, status: 'ACTIVE' } }),
      prisma.webhookEndpoint.count({ where: { organizationId: { in: organizationIds }, active: true } }),
      prisma.message.findMany({
        where: { instance: { organizationId: { in: organizationIds } } },
        select: {
          id: true,
          body: true,
          fromMe: true,
          type: true,
          status: true,
          createdAt: true,
          instance: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ]);

    const days = Array.from({ length: 30 }, (_, index) => {
      const date = new Date(lastMonth);
      date.setDate(lastMonth.getDate() + index);

      return {
        date: formatDashboardDay(date),
        sent: 0,
        received: 0,
      };
    });
    const dayMap = new Map(days.map(day => [day.date, day]));
    const byType = {
      TEXT: 0,
      IMAGE: 0,
      AUDIO: 0,
      DOCUMENT: 0,
      VIDEO: 0,
      STICKER: 0,
      UNKNOWN: 0,
    };

    for (const message of messages) {
      const day = dayMap.get(formatDashboardDay(message.createdAt));
      if (day) {
        if (message.fromMe) day.sent += 1;
        else day.received += 1;
      }

      byType[message.type] += 1;
    }

    const connected = instances.filter(instance => instance.status === 'CONNECTED').length;
    const disconnected = instances.filter(instance => ['DISCONNECTED', 'LOGGED_OUT', 'ERROR', 'BANNED'].includes(instance.status)).length;

    return {
      generatedAt: now.toISOString(),
      counts: {
        instances: instances.length,
        connected,
        disconnected,
        contacts: contactsCount,
        apiKeys: apiKeysCount,
        webhooks: webhooksCount,
        sent: messages.filter(message => message.fromMe).length,
        received: messages.filter(message => !message.fromMe).length,
      },
      byType,
      timeline: days,
      instances: instances.map(instance => ({
        ...instance,
        updatedAt: instance.updatedAt.toISOString(),
      })),
      recentMessages: recentMessages.map(message => ({
        ...message,
        createdAt: message.createdAt.toISOString(),
        instanceName: message.instance.name,
        instance: undefined,
      })),
    };
  });

  app.get('/organizations', async request => {
    const user = await getCurrentUser(request);

    return prisma.organization.findMany({
      where: { members: { some: { userId: user.id } } },
      orderBy: { createdAt: 'asc' },
    });
  });

  app.post('/organizations', async request => {
    const user = await getCurrentUser(request);
    const data = parseBody(request, createOrganizationSchema);
    const slug = data.slug ?? `${slugify(data.name)}-${nanoid(6).toLowerCase()}`;

    return prisma.organization.create({
      data: {
        name: data.name,
        slug,
        members: {
          create: {
            userId: user.id,
            role: 'OWNER',
          },
        },
      },
    });
  });

  app.get('/organizations/:id', async request => {
    const { id } = parseParams(request, idParamsSchema);
    await assertOrganizationAccess(request, id);

    return prisma.organization.findUniqueOrThrow({
      where: { id },
      include: { members: { include: { user: true } } },
    });
  });

  app.patch('/organizations/:id', async request => {
    const { id } = parseParams(request, idParamsSchema);
    await assertOrganizationAccess(request, id, ['OWNER', 'ADMIN']);
    const data = parseBody(request, updateOrganizationSchema);

    return prisma.organization.update({
      where: { id },
      data,
    });
  });

  app.get('/contacts', async request => {
    const user = await getCurrentUser(request);
    const query = parseQuery(request, contactQuerySchema);
    const organizationIds = user.memberships.map(item => item.organizationId);
    const scopedOrganizationIds = query.organizationId ? [query.organizationId] : organizationIds;

    if (query.organizationId) {
      await assertOrganizationAccess(request, query.organizationId);
    }

    const contacts = await prisma.contact.findMany({
      where: {
        organizationId: { in: scopedOrganizationIds },
      },
      orderBy: [{ name: 'asc' }, { createdAt: 'desc' }],
    });

    return contacts.map(publicContact);
  });

  app.post('/contacts', async request => {
    const data = parseBody(request, createContactSchema);
    await assertOrganizationAccess(request, data.organizationId, ['OWNER', 'ADMIN', 'MEMBER']);
    const nationalNumber = (data.phone ?? `${data.ddd ?? ''}${data.number ?? ''}`).replace(/\D/g, '');
    const phoneE164 = `${data.ddi}${nationalNumber}`;
    const ddd = data.ddd ?? (data.ddi === '55' ? nationalNumber.slice(0, 2) : '');
    const number = data.number ?? (data.ddi === '55' ? nationalNumber.slice(2) : nationalNumber);

    const contact = await prisma.contact.upsert({
      where: {
        organizationId_phoneE164: {
          organizationId: data.organizationId,
          phoneE164,
        },
      },
      create: {
        organizationId: data.organizationId,
        name: data.name,
        ddi: data.ddi,
        ddd,
        number,
        phoneE164,
        remoteJid: `${phoneE164}@s.whatsapp.net`,
      },
      update: {
        name: data.name,
        ddi: data.ddi,
        ddd,
        number,
        remoteJid: `${phoneE164}@s.whatsapp.net`,
      },
    });

    return publicContact(contact);
  });

  app.get('/instances', async request => {
    const user = await getCurrentUser(request);
    const organizationIds = user.memberships.map(item => item.organizationId);
    const instances = await prisma.whatsAppInstance.findMany({
      where: { organizationId: { in: organizationIds } },
      orderBy: { createdAt: 'desc' },
    });

    return instances.map(publicInstance);
  });

  app.post('/instances', async request => {
    const data = parseBody(request, createInstanceSchema);
    await assertOrganizationAccess(request, data.organizationId, ['OWNER', 'ADMIN']);

    const instance = await prisma.whatsAppInstance.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
      },
    });

    await queues.connectInstance.add('connect-instance', {
      instanceId: instance.id,
      organizationId: instance.organizationId,
    });

    return publicInstance(instance);
  });

  app.get('/instances/:id', async request => {
    const { id } = parseParams(request, idParamsSchema);
    const instance = await assertInstanceAccess(request, id);
    return publicInstance(instance);
  });

  app.delete('/instances/:id', async (request, reply) => {
    const { id } = parseParams(request, idParamsSchema);
    const instance = await assertInstanceAccess(request, id, ['OWNER', 'ADMIN']);

    await queues.disconnectInstance.add('disconnect-instance', {
      instanceId: id,
      organizationId: instance.organizationId,
      clearSession: true,
    });

    await prisma.whatsAppInstance.delete({ where: { id } });
    reply.status(204).send();
  });

  app.post('/instances/:id/start', async request => {
    const { id } = parseParams(request, idParamsSchema);
    const instance = await assertInstanceAccess(request, id, ['OWNER', 'ADMIN']);

    await queues.connectInstance.add('connect-instance', {
      instanceId: id,
      organizationId: instance.organizationId,
    });

    return { queued: true };
  });

  app.post('/instances/:id/restart', async request => {
    const { id } = parseParams(request, idParamsSchema);
    const instance = await assertInstanceAccess(request, id, ['OWNER', 'ADMIN']);

    await queues.disconnectInstance.add('disconnect-instance', {
      instanceId: id,
      organizationId: instance.organizationId,
      clearSession: false,
    });
    await queues.connectInstance.add('connect-instance', {
      instanceId: id,
      organizationId: instance.organizationId,
    });

    return { queued: true };
  });

  app.post('/instances/:id/reset-qrcode', async request => {
    const { id } = parseParams(request, idParamsSchema);
    const instance = await assertInstanceAccess(request, id, ['OWNER', 'ADMIN']);

    await prisma.whatsAppInstance.update({
      where: { id },
      data: {
        status: 'CONNECTING',
        qrCode: null,
        qrUpdatedAt: null,
      },
    });

    await queues.connectInstance.add('connect-instance', {
      instanceId: id,
      organizationId: instance.organizationId,
      clearSession: true,
    }, {
      jobId: `reset-qrcode:${id}:${randomUUID()}`,
      removeOnComplete: 20,
      removeOnFail: 50,
    });

    return { queued: true };
  });

  app.post('/instances/:id/logout', async request => {
    const { id } = parseParams(request, idParamsSchema);
    const instance = await assertInstanceAccess(request, id, ['OWNER', 'ADMIN']);

    await queues.disconnectInstance.add('disconnect-instance', {
      instanceId: id,
      organizationId: instance.organizationId,
      clearSession: true,
    });

    return prisma.whatsAppInstance.update({
      where: { id },
      data: { status: 'LOGGED_OUT', disconnectedAt: new Date(), qrCode: null },
    });
  });

  app.get('/instances/:id/qrcode', async request => {
    const { id } = parseParams(request, idParamsSchema);
    const instance = await assertInstanceAccess(request, id);

    return {
      instanceId: instance.id,
      status: instance.status,
      qrCode: instance.qrCode,
      qrUpdatedAt: instance.qrUpdatedAt?.toISOString() ?? null,
    };
  });

  app.get('/instances/:id/status', async request => {
    const { id } = parseParams(request, idParamsSchema);
    const instance = await assertInstanceAccess(request, id);

    return {
      instanceId: instance.id,
      status: instance.status,
      phoneNumber: instance.phoneNumber,
      profileName: instance.profileName,
      lastConnectedAt: instance.lastConnectedAt?.toISOString() ?? null,
    };
  });

  app.get('/instances/:id/groups', async request => {
    const { id } = parseParams(request, idParamsSchema);
    await assertInstanceAccess(request, id, ['OWNER', 'ADMIN', 'MEMBER']);
    const groups = await prisma.whatsAppGroup.findMany({
      where: { instanceId: id },
      include: { participants: { orderBy: [{ isSuperAdmin: 'desc' }, { isAdmin: 'desc' }, { jid: 'asc' }] } },
      orderBy: { subject: 'asc' },
      take: 200,
    });

    return groups.map(serializeGroup);
  });

  app.post('/instances/:id/groups/sync', async request => {
    const { id } = parseParams(request, idParamsSchema);
    const instance = await assertInstanceAccess(request, id, ['OWNER', 'ADMIN']);
    return enqueueOperation({
      organizationId: instance.organizationId,
      instanceId: instance.id,
      type: 'GROUP_SYNC',
      payload: {},
    });
  });

  app.post('/instances/:id/groups', async request => {
    const { id } = parseParams(request, idParamsSchema);
    const instance = await assertInstanceAccess(request, id, ['OWNER', 'ADMIN']);
    const body = parseBody(request, groupCreateBodySchema);

    return enqueueOperation({
      organizationId: instance.organizationId,
      instanceId: instance.id,
      type: 'GROUP_CREATE',
      payload: body,
    });
  });

  app.post('/instances/:id/groups/invite/accept', async request => {
    const { id } = parseParams(request, idParamsSchema);
    const instance = await assertInstanceAccess(request, id, ['OWNER', 'ADMIN']);
    const body = parseBody(request, inviteCodeBodySchema);

    return enqueueOperation({
      organizationId: instance.organizationId,
      instanceId: instance.id,
      type: 'GROUP_ACCEPT_INVITE',
      payload: body,
    });
  });

  app.post('/instances/:id/groups/invite/metadata', async request => {
    const { id } = parseParams(request, idParamsSchema);
    const instance = await assertInstanceAccess(request, id, ['OWNER', 'ADMIN', 'MEMBER']);
    const body = parseBody(request, inviteCodeBodySchema);

    return enqueueOperation({
      organizationId: instance.organizationId,
      instanceId: instance.id,
      type: 'GROUP_INVITE_METADATA',
      payload: body,
    });
  });

  app.get('/instances/:id/groups/:groupId', async request => {
    const { group } = await getScopedPrivateGroup(request);
    return serializeGroup(group);
  });

  app.get('/instances/:id/groups/:groupId/metadata/light', async request => {
    const { group } = await getScopedPrivateGroup(request);
    return serializeGroup({ ...group, participants: undefined });
  });

  app.post('/instances/:id/groups/:groupId/metadata/sync', async request => {
    return enqueuePrivateGroupOperation(request, 'GROUP_METADATA_SYNC', {});
  });

  app.post('/instances/:id/groups/:groupId/name', async request => {
    const body = parseBody(request, z.object({ name: z.string().min(1).max(120) }));
    return enqueuePrivateGroupOperation(request, 'GROUP_UPDATE_NAME', body);
  });

  app.post('/instances/:id/groups/:groupId/description', async request => {
    const body = parseBody(request, z.object({ description: z.string().max(2048) }));
    return enqueuePrivateGroupOperation(request, 'GROUP_UPDATE_DESCRIPTION', body);
  });

  app.post('/instances/:id/groups/:groupId/photo', async request => {
    const body = parseBody(request, groupPhotoBodySchema);
    return enqueuePrivateGroupOperation(request, 'GROUP_UPDATE_PHOTO', body);
  });

  app.post('/instances/:id/groups/:groupId/participants/add', async request => {
    const body = parseBody(request, addParticipantsBodySchema);
    return enqueuePrivateGroupOperation(request, 'GROUP_PARTICIPANTS_ADD', body);
  });

  app.post('/instances/:id/groups/:groupId/participants/remove', async request => {
    const body = parseBody(request, participantsBodySchema);
    return enqueuePrivateGroupOperation(request, 'GROUP_PARTICIPANTS_REMOVE', body);
  });

  app.post('/instances/:id/groups/:groupId/requests/list', async request => {
    return enqueuePrivateGroupOperation(request, 'GROUP_REQUESTS_LIST', {});
  });

  app.post('/instances/:id/groups/:groupId/requests/approve', async request => {
    const body = parseBody(request, participantsBodySchema);
    return enqueuePrivateGroupOperation(request, 'GROUP_REQUESTS_APPROVE', body);
  });

  app.post('/instances/:id/groups/:groupId/requests/reject', async request => {
    const body = parseBody(request, participantsBodySchema);
    return enqueuePrivateGroupOperation(request, 'GROUP_REQUESTS_REJECT', body);
  });

  app.post('/instances/:id/groups/:groupId/admins/promote', async request => {
    const body = parseBody(request, participantsBodySchema);
    return enqueuePrivateGroupOperation(request, 'GROUP_ADMINS_PROMOTE', body);
  });

  app.post('/instances/:id/groups/:groupId/admins/demote', async request => {
    const body = parseBody(request, participantsBodySchema);
    return enqueuePrivateGroupOperation(request, 'GROUP_ADMINS_DEMOTE', body);
  });

  app.post('/instances/:id/groups/:groupId/mention', async request => {
    const body = parseBody(
      request,
      z.object({
        text: z.string().min(1).max(4096),
        participants: z.array(z.string().min(6)).min(1).max(256),
      }),
    );
    return enqueuePrivateGroupOperation(request, 'GROUP_MENTION', body);
  });

  app.post('/instances/:id/groups/:groupId/mention-all', async request => {
    const body = parseBody(request, z.object({ text: z.string().min(1).max(4096) }));
    return enqueuePrivateGroupOperation(request, 'GROUP_MENTION_ALL', body);
  });

  app.post('/instances/:id/groups/:groupId/mention-group', async request => {
    const body = parseBody(request, groupMentionGroupsBodySchema);
    return enqueuePrivateGroupOperation(request, 'GROUP_MENTION_GROUP', body);
  });

  app.post('/instances/:id/groups/:groupId/settings', async request => {
    const body = parseBody(request, groupSettingsBodySchema);
    return enqueuePrivateGroupOperation(request, 'GROUP_SETTINGS_UPDATE', body);
  });

  app.post('/instances/:id/groups/:groupId/leave', async request => {
    return enqueuePrivateGroupOperation(request, 'GROUP_LEAVE', {});
  });

  app.post('/instances/:id/groups/:groupId/invite-link', async request => {
    return enqueuePrivateGroupOperation(request, 'GROUP_GET_INVITE_LINK', {});
  });

  app.post('/instances/:id/groups/:groupId/invite-link/revoke', async request => {
    return enqueuePrivateGroupOperation(request, 'GROUP_REVOKE_INVITE_LINK', {});
  });

  app.post('/messages/send-text', async request => {
    const data = parseBody(request, sendTextMessageSchema);
    const instance = await assertInstanceAccess(request, data.instanceId, ['OWNER', 'ADMIN', 'MEMBER']);
    const remoteJid = data.to.endsWith('@s.whatsapp.net') || data.to.endsWith('@g.us')
      ? data.to
      : `${data.to.replace(/\D/g, '')}@s.whatsapp.net`;

    const chat = await prisma.chat.upsert({
      where: {
        instanceId_remoteJid: {
          instanceId: instance.id,
          remoteJid,
        },
      },
      create: {
        instanceId: instance.id,
        remoteJid,
      },
      update: {
        updatedAt: new Date(),
        deletedAt: null,
      },
    });

    const message = await prisma.message.create({
      data: {
        instanceId: instance.id,
        chatId: chat.id,
        remoteJid,
        fromMe: true,
        type: 'TEXT',
        body: data.body,
        status: 'QUEUED',
      },
    });

    await queues.sendMessage.add('send-message', {
      messageId: message.id,
      instanceId: instance.id,
      organizationId: instance.organizationId,
      to: data.to,
      body: data.body,
    });

    return message;
  });

  app.post('/messages/send-file', async request => {
    const fields: Record<string, string> = {};
    let file:
      | {
          buffer: Buffer;
          fileName: string;
          mimeType: string;
        }
      | undefined;

    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (file) throw new AppError('Only one file is allowed', 400, 'ONLY_ONE_FILE_ALLOWED');
        const buffer = await part.toBuffer();
        file = {
          buffer,
          fileName: sanitizeFileName(part.filename),
          mimeType: part.mimetype || 'application/octet-stream',
        };
      } else {
        fields[part.fieldname] = String(part.value ?? '');
      }
    }

    if (!file) throw new AppError('File is required', 400, 'FILE_REQUIRED');

    const data = sendFileFieldsSchema.parse(fields);
    const instance = await assertInstanceAccess(request, data.instanceId, ['OWNER', 'ADMIN', 'MEMBER']);
    const remoteJid = data.to.endsWith('@s.whatsapp.net') || data.to.endsWith('@g.us')
      ? data.to
      : `${data.to.replace(/\D/g, '')}@s.whatsapp.net`;
    const type = messageTypeFromMime(file.mimeType);
    const extension = extensionFromFile(file.fileName, file.mimeType);
    const fileName = `${randomUUID()}.${extension}`;
    const instanceMediaPath = path.join(mediaStoragePath, instance.id);
    const absolutePath = path.join(instanceMediaPath, fileName);
    const mediaUrl = `/media/${instance.id}/${fileName}`;

    await mkdir(instanceMediaPath, { recursive: true });
    await writeFile(absolutePath, file.buffer);

    const chat = await prisma.chat.upsert({
      where: {
        instanceId_remoteJid: {
          instanceId: instance.id,
          remoteJid,
        },
      },
      create: {
        instanceId: instance.id,
        remoteJid,
      },
      update: {
        updatedAt: new Date(),
        deletedAt: null,
      },
    });

    const body = data.body?.trim() || (type === 'DOCUMENT' ? file.fileName : undefined);
    const message = await prisma.message.create({
      data: {
        instanceId: instance.id,
        chatId: chat.id,
        remoteJid,
        fromMe: true,
        type,
        body,
        mediaUrl,
        status: 'QUEUED',
      },
    });

    await queues.sendMessage.add('send-message', {
      messageId: message.id,
      instanceId: instance.id,
      organizationId: instance.organizationId,
      to: data.to,
      body,
      type,
      media: {
        path: absolutePath,
        mimeType: file.mimeType,
        fileName: file.fileName,
      },
    });

    return message;
  });

  app.get('/instances/:id/chats', async request => {
    const { id } = parseParams(request, idParamsSchema);
    await assertInstanceAccess(request, id);

    const chats = await prisma.chat.findMany({
      where: { instanceId: id, deletedAt: null },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            body: true,
            type: true,
            fromMe: true,
            status: true,
            mediaUrl: true,
            createdAt: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });

    return chats.map(serializeChat);
  });

  app.get('/instances/:id/chats/:chatId', async request => {
    const { id, chatId } = parseParams(request, chatParamsSchema);
    await assertInstanceAccess(request, id);
    const chat = await prisma.chat.findFirst({
      where: { id: chatId, instanceId: id, deletedAt: null },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            body: true,
            type: true,
            fromMe: true,
            status: true,
            mediaUrl: true,
            createdAt: true,
          },
        },
      },
    });

    if (!chat) throw new AppError('Chat not found', 404, 'CHAT_NOT_FOUND');
    return serializeChat(chat);
  });

  app.post('/instances/:id/chats/:chatId/read', async request => {
    const body = parseBody(request, z.object({ read: z.boolean().default(true) }));
    return enqueuePrivateChatOperation(request, 'CHAT_READ', body);
  });

  app.post('/instances/:id/chats/:chatId/archive', async request => {
    const body = parseBody(request, z.object({ archived: z.boolean().default(true) }));
    return enqueuePrivateChatOperation(request, 'CHAT_ARCHIVE', body);
  });

  app.post('/instances/:id/chats/:chatId/pin', async request => {
    const body = parseBody(request, z.object({ pinned: z.boolean().default(true) }));
    return enqueuePrivateChatOperation(request, 'CHAT_PIN', body);
  });

  app.post('/instances/:id/chats/:chatId/mute', async request => {
    const body = parseBody(request, z.object({ mutedUntil: z.string().datetime().nullable().optional() }));
    return enqueuePrivateChatOperation(request, 'CHAT_MUTE', body);
  });

  app.post('/instances/:id/chats/:chatId/clear', async request => {
    return enqueuePrivateChatOperation(request, 'CHAT_CLEAR', {});
  });

  app.post('/instances/:id/chats/:chatId/delete', async request => {
    return enqueuePrivateChatOperation(request, 'CHAT_DELETE', {});
  });

  app.post('/instances/:id/chats/:chatId/ephemeral', async request => {
    const body = parseBody(request, z.object({ expirationSeconds: z.number().int().min(0).max(31_536_000) }));
    return enqueuePrivateChatOperation(request, 'CHAT_EPHEMERAL', body);
  });

  app.get('/instances/:id/chats/:chatId/messages', async request => {
    const { id, chatId } = parseParams(request, chatParamsSchema);
    await assertInstanceAccess(request, id);

    return prisma.message.findMany({
      where: { instanceId: id, chatId },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
  });

  app.get('/api-keys', async request => {
    const user = await getCurrentUser(request);
    const organizationIds = user.memberships.map(item => item.organizationId);

    return prisma.apiKey.findMany({
      where: { organizationId: { in: organizationIds } },
      select: {
        id: true,
        organizationId: true,
        name: true,
        prefix: true,
        lastFour: true,
        status: true,
        lastUsedAt: true,
        createdAt: true,
        revokedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  app.post('/api-keys', async request => {
    const user = await getCurrentUser(request);
    const data = parseBody(request, createApiKeySchema);
    await assertOrganizationAccess(request, data.organizationId, ['OWNER']);

    const token = createApiKey();
    const preview = getApiKeyPreview(token);
    const apiKey = await prisma.apiKey.create({
      data: {
        userId: user.id,
        organizationId: data.organizationId,
        name: data.name,
        keyHash: hashApiKey(token, env.API_KEY_SECRET),
        prefix: preview.prefix,
        lastFour: preview.lastFour,
      },
      select: {
        id: true,
        organizationId: true,
        name: true,
        prefix: true,
        lastFour: true,
        status: true,
        createdAt: true,
      },
    });

    return { ...apiKey, token };
  });

  app.delete('/api-keys/:id', async (request, reply) => {
    const { id } = parseParams(request, idParamsSchema);
    const apiKey = await prisma.apiKey.findUnique({ where: { id } });
    if (!apiKey) throw new AppError('API key not found', 404, 'API_KEY_NOT_FOUND');

    await assertOrganizationAccess(request, apiKey.organizationId, ['OWNER']);
    await prisma.apiKey.update({
      where: { id },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });

    reply.status(204).send();
  });

  app.post('/api-keys/:id/rotate', async request => {
    const { id } = parseParams(request, idParamsSchema);
    const apiKey = await prisma.apiKey.findUnique({ where: { id } });
    if (!apiKey) throw new AppError('API key not found', 404, 'API_KEY_NOT_FOUND');

    await assertOrganizationAccess(request, apiKey.organizationId, ['OWNER']);

    const token = createApiKey();
    const preview = getApiKeyPreview(token);
    const rotatedKey = await prisma.apiKey.update({
      where: { id },
      data: {
        keyHash: hashApiKey(token, env.API_KEY_SECRET),
        prefix: preview.prefix,
        lastFour: preview.lastFour,
        status: 'ACTIVE',
        lastUsedAt: null,
        revokedAt: null,
      },
      select: {
        id: true,
        organizationId: true,
        name: true,
        prefix: true,
        lastFour: true,
        status: true,
        createdAt: true,
      },
    });

    return { ...rotatedKey, token };
  });

  app.get('/webhooks', async request => {
    const user = await getCurrentUser(request);
    const query = parseQuery(request, webhookQuerySchema);
    const organizationIds = user.memberships.map(item => item.organizationId);
    if (query.instanceId) {
      await assertInstanceAccess(request, query.instanceId);
    }
    const webhooks = await prisma.webhookEndpoint.findMany({
      where: {
        organizationId: { in: organizationIds },
        ...(query.instanceId ? { instanceId: query.instanceId } : {}),
      },
      include: {
        instance: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return webhooks.map(webhook => ({
      ...webhook,
      events: webhook.events.map(webhookEventFromDb),
    }));
  });

  app.post('/webhooks', async request => {
    const data = parseBody(request, createWebhookSchema);
    await assertOrganizationAccess(request, data.organizationId, ['OWNER', 'ADMIN']);
    if (data.instanceId) {
      const instance = await assertInstanceAccess(request, data.instanceId, ['OWNER', 'ADMIN']);
      if (instance.organizationId !== data.organizationId) {
        throw new AppError('Instance does not belong to organization', 400, 'INSTANCE_ORGANIZATION_MISMATCH');
      }
    }

    const webhook = await prisma.webhookEndpoint.create({
      data: {
        organizationId: data.organizationId,
        instanceId: data.instanceId,
        url: data.url,
        events: data.events.map(webhookEventToDb),
        secret: createWebhookSecret(),
      },
      include: {
        instance: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
          },
        },
      },
    });

    return {
      ...webhook,
      events: webhook.events.map(webhookEventFromDb),
    };
  });

  app.patch('/webhooks/:id', async request => {
    const { id } = parseParams(request, idParamsSchema);
    const webhook = await prisma.webhookEndpoint.findUnique({ where: { id } });
    if (!webhook) throw new AppError('Webhook not found', 404, 'WEBHOOK_NOT_FOUND');

    await assertOrganizationAccess(request, webhook.organizationId, ['OWNER', 'ADMIN']);
    const data = parseBody(request, updateWebhookSchema);
    const updated = await prisma.webhookEndpoint.update({
      where: { id },
      data: {
        url: data.url,
        active: data.active,
        events: data.events?.map(webhookEventToDb),
      },
    });

    return {
      ...updated,
      events: updated.events.map(webhookEventFromDb),
    };
  });

  app.delete('/webhooks/:id', async (request, reply) => {
    const { id } = parseParams(request, idParamsSchema);
    const webhook = await prisma.webhookEndpoint.findUnique({ where: { id } });
    if (!webhook) throw new AppError('Webhook not found', 404, 'WEBHOOK_NOT_FOUND');

    await assertOrganizationAccess(request, webhook.organizationId, ['OWNER', 'ADMIN']);
    await prisma.webhookEndpoint.delete({ where: { id } });
    reply.status(204).send();
  });

  app.post('/webhooks/:id/test', async request => {
    const { id } = parseParams(request, idParamsSchema);
    const webhook = await prisma.webhookEndpoint.findUnique({ where: { id } });
    if (!webhook) throw new AppError('Webhook not found', 404, 'WEBHOOK_NOT_FOUND');

    await assertOrganizationAccess(request, webhook.organizationId, ['OWNER', 'ADMIN']);
    await dispatchWebhookEvent(queues, {
      organizationId: webhook.organizationId,
      instanceId: webhook.instanceId ?? undefined,
      event: 'message.received',
      data: { test: true, body: 'RavoxZap webhook test' },
    });

    return { queued: true };
  });

  async function createPublicMediaMessage(input: {
    request: FastifyRequest;
    type: PublicMediaType;
    source: string;
    to: string;
    caption?: string;
    fileName?: string;
  }) {
    const { apiKey, instanceId } = await getPublicInstance(input.request);
    const media = await loadPublicMedia({
      source: input.source,
      type: input.type,
      fileName: input.fileName,
    });
    const remoteJid = remoteJidFromPhone(input.to);
    const extension = extensionFromFile(media.fileName, media.mimeType);
    const storedFileName = `${randomUUID()}.${extension}`;
    const instanceMediaPath = path.join(mediaStoragePath, instanceId);
    const absolutePath = path.join(instanceMediaPath, storedFileName);
    const mediaUrl = `/media/${instanceId}/${storedFileName}`;

    await mkdir(instanceMediaPath, { recursive: true });
    await writeFile(absolutePath, media.buffer);

    const chat = await prisma.chat.upsert({
      where: {
        instanceId_remoteJid: {
          instanceId,
          remoteJid,
        },
      },
      create: {
        instanceId,
        remoteJid,
      },
      update: {
        updatedAt: new Date(),
      },
    });

    const body = input.caption?.trim() || (input.type === 'DOCUMENT' ? media.fileName : undefined);
    const message = await prisma.message.create({
      data: {
        instanceId,
        chatId: chat.id,
        remoteJid,
        fromMe: true,
        type: input.type,
        body,
        mediaUrl,
        status: 'QUEUED',
      },
    });

    await queues.sendMessage.add('send-message', {
      messageId: message.id,
      instanceId,
      organizationId: apiKey.organizationId,
      to: input.to,
      body,
      type: input.type,
      media: {
        path: absolutePath,
        mimeType: media.mimeType,
        fileName: media.fileName,
      },
    });

    return {
      messageId: message.id,
      status: message.status,
      type: message.type,
      mediaUrl,
    };
  }

  app.post('/v1/instances/:instanceId/send-text', async request => {
    const { apiKey, instanceId } = await getPublicInstance(request);
    const body = parseBody(
      request,
      z.object({
        to: z.string().min(6),
        body: z.string().min(1).max(4096),
      }),
    );
    const remoteJid = remoteJidFromPhone(body.to);
    const chat = await prisma.chat.upsert({
      where: {
        instanceId_remoteJid: {
          instanceId,
          remoteJid,
        },
      },
      create: {
        instanceId,
        remoteJid,
      },
      update: {
        updatedAt: new Date(),
        deletedAt: null,
      },
    });

    const message = await prisma.message.create({
      data: {
        instanceId,
        chatId: chat.id,
        remoteJid,
        fromMe: true,
        type: 'TEXT',
        body: body.body,
        status: 'QUEUED',
      },
    });

    await queues.sendMessage.add('send-message', {
      messageId: message.id,
      instanceId,
      organizationId: apiKey.organizationId,
      to: body.to,
      body: body.body,
    });

    return { messageId: message.id, status: message.status };
  });

  app.post('/v1/instances/:instanceId/send-image', async request => {
    const body = parseBody(
      request,
      z.object({
        to: z.string().min(6),
        image: z.string().min(1),
        caption: z.string().max(1024).optional(),
      }),
    );

    return createPublicMediaMessage({
      request,
      type: 'IMAGE',
      source: body.image,
      to: body.to,
      caption: body.caption,
    });
  });

  app.post('/v1/instances/:instanceId/send-audio', async request => {
    const body = parseBody(
      request,
      z.object({
        to: z.string().min(6),
        audio: z.string().min(1),
      }),
    );

    return createPublicMediaMessage({
      request,
      type: 'AUDIO',
      source: body.audio,
      to: body.to,
    });
  });

  app.post('/v1/instances/:instanceId/send-video', async request => {
    const body = parseBody(
      request,
      z.object({
        to: z.string().min(6),
        video: z.string().min(1),
        caption: z.string().max(1024).optional(),
      }),
    );

    return createPublicMediaMessage({
      request,
      type: 'VIDEO',
      source: body.video,
      to: body.to,
      caption: body.caption,
    });
  });

  app.post('/v1/instances/:instanceId/send-document', async request => {
    const body = parseBody(
      request,
      z.object({
        to: z.string().min(6),
        document: z.string().min(1),
        fileName: z.string().min(1).max(180).optional(),
        caption: z.string().max(1024).optional(),
      }),
    );

    return createPublicMediaMessage({
      request,
      type: 'DOCUMENT',
      source: body.document,
      to: body.to,
      caption: body.caption,
      fileName: body.fileName,
    });
  });

  app.post('/v1/instances/:instanceId/send-location', async request => {
    const body = parseBody(
      request,
      toBodySchema.extend({
        latitude: z.number(),
        longitude: z.number(),
        name: z.string().max(180).optional(),
        address: z.string().max(280).optional(),
      }),
    );
    return enqueuePublicOperation(request, 'MESSAGE_SEND_LOCATION', body);
  });

  app.post('/v1/instances/:instanceId/send-contact', async request => {
    const body = parseBody(request, toBodySchema.extend({ contact: contactCardSchema }));
    return enqueuePublicOperation(request, 'MESSAGE_SEND_CONTACT', body);
  });

  app.post('/v1/instances/:instanceId/send-contacts', async request => {
    const body = parseBody(request, toBodySchema.extend({ contacts: z.array(contactCardSchema).min(1).max(50) }));
    return enqueuePublicOperation(request, 'MESSAGE_SEND_CONTACTS', body);
  });

  app.post('/v1/instances/:instanceId/send-sticker', async request => {
    const body = parseBody(request, toBodySchema.extend({ sticker: z.string().min(1) }));
    return enqueuePublicOperation(request, 'MESSAGE_SEND_STICKER', body);
  });

  app.post('/v1/instances/:instanceId/send-gif', async request => {
    const body = parseBody(request, toBodySchema.extend({ gif: z.string().min(1), caption: z.string().max(1024).optional() }));
    return enqueuePublicOperation(request, 'MESSAGE_SEND_GIF', body);
  });

  app.post('/v1/instances/:instanceId/send-link', async request => {
    const body = parseBody(request, toBodySchema.extend({ url: z.string().url(), text: z.string().max(1024).optional() }));
    return enqueuePublicOperation(request, 'MESSAGE_SEND_LINK', body);
  });

  app.post('/v1/instances/:instanceId/send-reaction', async request => {
    const body = parseBody(request, messageKeyBodyBaseSchema.extend({ emoji: z.string().min(1).max(32) }).refine(value => value.remoteJid || value.to, {
      message: 'Informe remoteJid ou to.',
      path: ['remoteJid'],
    }));
    return enqueuePublicOperation(request, 'MESSAGE_SEND_REACTION', body);
  });

  app.post('/v1/instances/:instanceId/remove-reaction', async request => {
    const body = parseBody(request, messageKeyBodySchema);
    return enqueuePublicOperation(request, 'MESSAGE_REMOVE_REACTION', body);
  });

  app.post('/v1/instances/:instanceId/send-poll', async request => {
    const body = parseBody(
      request,
      toBodySchema.extend({
        name: z.string().min(1).max(255),
        options: z.array(z.string().min(1).max(255)).min(2).max(12),
        selectableCount: z.number().int().min(1).max(12).optional(),
      }),
    );
    return enqueuePublicOperation(request, 'MESSAGE_SEND_POLL', body);
  });

  app.post('/v1/instances/:instanceId/send-poll-vote', async request => {
    const body = parseBody(request, z.record(z.string(), z.unknown()));
    return enqueuePublicOperation(request, 'MESSAGE_SEND_POLL_VOTE', body);
  });

  app.post('/v1/instances/:instanceId/send-ptv', async request => {
    const body = parseBody(request, toBodySchema.extend({ video: z.string().min(1), caption: z.string().max(1024).optional() }));
    return enqueuePublicOperation(request, 'MESSAGE_SEND_PTV', body);
  });

  app.post('/v1/instances/:instanceId/messages/reply', async request => {
    const body = parseBody(
      request,
      toBodySchema.extend({
        text: z.string().min(1).max(4096),
        quotedMessageId: z.string().min(1).optional(),
        messageId: z.string().min(1).optional(),
        quotedFromMe: z.boolean().optional(),
      }).refine(value => value.quotedMessageId || value.messageId, {
        message: 'Informe quotedMessageId ou messageId.',
      }),
    );
    return enqueuePublicOperation(request, 'MESSAGE_REPLY', body);
  });

  app.post('/v1/instances/:instanceId/messages/forward', async request => {
    const body = parseBody(request, toBodySchema.extend({ message: z.record(z.string(), z.unknown()) }));
    return enqueuePublicOperation(request, 'MESSAGE_FORWARD', body);
  });

  app.post('/v1/instances/:instanceId/messages/delete', async request => {
    const body = parseBody(request, messageKeyBodySchema);
    return enqueuePublicOperation(request, 'MESSAGE_DELETE', body);
  });

  app.post('/v1/instances/:instanceId/messages/read', async request => {
    const body = parseBody(request, messageKeyBodySchema);
    return enqueuePublicOperation(request, 'MESSAGE_READ', body);
  });

  app.post('/v1/instances/:instanceId/messages/pin', async request => {
    const body = parseBody(
      request,
      messageKeyBodyBaseSchema.extend({
        type: z.union([z.literal(0), z.literal(1)]).optional(),
        time: z.union([z.literal(86400), z.literal(604800), z.literal(2592000)]).optional(),
      }).refine(value => value.remoteJid || value.to, {
        message: 'Informe remoteJid ou to.',
        path: ['remoteJid'],
      }),
    );
    return enqueuePublicOperation(request, 'MESSAGE_PIN', body);
  });

  app.post('/v1/instances/:instanceId/contacts/check', async request => {
    const body = parseBody(request, z.object({ phone: z.string().min(3) }));
    return enqueuePublicOperation(request, 'CONTACT_CHECK', body);
  });

  app.post('/v1/instances/:instanceId/contacts/check-batch', async request => {
    const body = parseBody(request, z.object({ phones: z.array(z.string().min(3)).min(1).max(1000) }));
    return enqueuePublicOperation(request, 'CONTACT_CHECK_BATCH', body);
  });

  app.get('/v1/instances/:instanceId/contacts', async request => {
    const { apiKey } = await getPublicInstance(request);
    const contacts = await prisma.contact.findMany({
      where: { organizationId: apiKey.organizationId },
      orderBy: [{ name: 'asc' }, { createdAt: 'desc' }],
    });

    return contacts.map(publicContact);
  });

  app.post('/v1/instances/:instanceId/contacts', async request => {
    const body = parseBody(request, z.object({ phone: z.string().min(3), name: z.string().min(1).max(180) }));
    return enqueuePublicOperation(request, 'CONTACT_ADD', body);
  });

  app.delete('/v1/instances/:instanceId/contacts/:phone', async request => {
    await getPublicInstance(request);
    const { phone } = parseParams(request, phoneParamsSchema);
    return enqueuePublicOperation(request, 'CONTACT_REMOVE', { phone: decodeURIComponent(phone) });
  });

  app.get('/v1/instances/:instanceId/contacts/:phone/metadata', async request => {
    await getPublicInstance(request);
    const { phone } = parseParams(request, phoneParamsSchema);
    return enqueuePublicOperation(request, 'CONTACT_METADATA', { phone: decodeURIComponent(phone) });
  });

  app.get('/v1/instances/:instanceId/contacts/:phone/profile-picture', async request => {
    await getPublicInstance(request);
    const { phone } = parseParams(request, phoneParamsSchema);
    return enqueuePublicOperation(request, 'CONTACT_PROFILE_PICTURE', { phone: decodeURIComponent(phone) });
  });

  app.post('/v1/instances/:instanceId/contacts/:phone/block', async request => {
    await getPublicInstance(request);
    const { phone } = parseParams(request, phoneParamsSchema);
    return enqueuePublicOperation(request, 'CONTACT_BLOCK', { phone: decodeURIComponent(phone) });
  });

  app.post('/v1/instances/:instanceId/contacts/:phone/unblock', async request => {
    await getPublicInstance(request);
    const { phone } = parseParams(request, phoneParamsSchema);
    return enqueuePublicOperation(request, 'CONTACT_UNBLOCK', { phone: decodeURIComponent(phone) });
  });

  app.post('/v1/instances/:instanceId/contacts/:phone/report', async request => {
    await getPublicInstance(request);
    const { phone } = parseParams(request, phoneParamsSchema);
    return enqueuePublicOperation(request, 'CONTACT_REPORT', { phone: decodeURIComponent(phone) });
  });

  app.get('/v1/instances/:instanceId/privacy', async request => enqueuePublicOperation(request, 'PRIVACY_GET', {}));
  app.get('/v1/instances/:instanceId/privacy/blocklist', async request => enqueuePublicOperation(request, 'PRIVACY_BLOCKLIST', {}));

  app.post('/v1/instances/:instanceId/privacy/last-seen', async request => {
    const body = parseBody(request, privacyValueBodySchema);
    return enqueuePublicOperation(request, 'PRIVACY_LAST_SEEN', body);
  });

  app.post('/v1/instances/:instanceId/privacy/online', async request => {
    const body = parseBody(request, onlinePrivacyBodySchema);
    return enqueuePublicOperation(request, 'PRIVACY_ONLINE', body);
  });

  app.post('/v1/instances/:instanceId/privacy/profile-picture', async request => {
    const body = parseBody(request, privacyValueBodySchema);
    return enqueuePublicOperation(request, 'PRIVACY_PROFILE_PICTURE', body);
  });

  app.post('/v1/instances/:instanceId/privacy/status', async request => {
    const body = parseBody(request, privacyValueBodySchema);
    return enqueuePublicOperation(request, 'PRIVACY_STATUS', body);
  });

  app.post('/v1/instances/:instanceId/privacy/read-receipts', async request => {
    const body = parseBody(request, readReceiptsBodySchema);
    return enqueuePublicOperation(request, 'PRIVACY_READ_RECEIPTS', body);
  });

  app.post('/v1/instances/:instanceId/privacy/group-add', async request => {
    const body = parseBody(request, groupAddPrivacyBodySchema);
    return enqueuePublicOperation(request, 'PRIVACY_GROUP_ADD', body);
  });

  app.post('/v1/instances/:instanceId/privacy/default-disappearing', async request => {
    const body = parseBody(request, disappearingBodySchema);
    return enqueuePublicOperation(request, 'PRIVACY_DEFAULT_DISAPPEARING', body);
  });

  app.get('/v1/instances/:instanceId/me', async request => enqueuePublicOperation(request, 'INSTANCE_ME', {}));
  app.get('/v1/instances/:instanceId/device', async request => enqueuePublicOperation(request, 'INSTANCE_DEVICE', {}));

  app.post('/v1/instances/:instanceId/pairing-code', async request => {
    const body = parseBody(request, z.object({ phone: z.string().min(3), code: z.string().min(1).max(8).optional() }));
    return enqueuePublicOperation(request, 'INSTANCE_PAIRING_CODE', body);
  });

  app.post('/v1/instances/:instanceId/profile/name', async request => {
    const body = parseBody(request, z.object({ name: z.string().min(1).max(120) }));
    return enqueuePublicOperation(request, 'INSTANCE_PROFILE_NAME', body);
  });

  app.post('/v1/instances/:instanceId/profile/description', async request => {
    const body = parseBody(request, z.object({ description: z.string().max(2048) }));
    return enqueuePublicOperation(request, 'INSTANCE_PROFILE_DESCRIPTION', body);
  });

  app.post('/v1/instances/:instanceId/profile/picture', async request => {
    const body = parseBody(request, groupPhotoBodySchema);
    return enqueuePublicOperation(request, 'INSTANCE_PROFILE_PICTURE', body);
  });

  app.post('/v1/instances/:instanceId/profile/picture/remove', async request => enqueuePublicOperation(request, 'INSTANCE_PROFILE_PICTURE_REMOVE', {}));

  app.post('/v1/instances/:instanceId/status/send-text', async request => {
    const body = parseBody(
      request,
      statusRecipientsSchema.extend({
        text: z.string().min(1).max(700),
        backgroundColor: z.string().max(64).optional(),
        font: z.number().int().min(0).max(5).optional(),
      }),
    );
    return enqueuePublicOperation(request, 'STATUS_SEND_TEXT', body);
  });

  app.post('/v1/instances/:instanceId/status/send-image', async request => {
    const body = parseBody(request, statusRecipientsSchema.extend({ image: z.string().min(1), caption: z.string().max(1024).optional() }));
    return enqueuePublicOperation(request, 'STATUS_SEND_IMAGE', body);
  });

  app.post('/v1/instances/:instanceId/status/send-video', async request => {
    const body = parseBody(request, statusRecipientsSchema.extend({ video: z.string().min(1), caption: z.string().max(1024).optional() }));
    return enqueuePublicOperation(request, 'STATUS_SEND_VIDEO', body);
  });

  app.post('/v1/instances/:instanceId/status/reply-text', async request => {
    const body = parseBody(request, z.object({ statusJid: z.string().min(1), messageId: z.string().min(1), text: z.string().min(1).max(4096) }));
    return enqueuePublicOperation(request, 'STATUS_REPLY_TEXT', body);
  });

  app.post('/v1/instances/:instanceId/status/reply-sticker', async request => {
    const body = parseBody(request, z.object({ statusJid: z.string().min(1), messageId: z.string().min(1), sticker: z.string().min(1) }));
    return enqueuePublicOperation(request, 'STATUS_REPLY_STICKER', body);
  });

  app.post('/v1/instances/:instanceId/status/reply-gif', async request => {
    const body = parseBody(request, z.object({ statusJid: z.string().min(1), messageId: z.string().min(1), gif: z.string().min(1) }));
    return enqueuePublicOperation(request, 'STATUS_REPLY_GIF', body);
  });

  app.get('/v1/instances/:instanceId/operations/:operationId', async request => {
    const { apiKey, instanceId } = await getPublicInstance(request);
    const { operationId } = parseParams(request, operationParamsSchema);
    const operation = await prisma.whatsAppOperation.findFirst({
      where: {
        id: operationId,
        instanceId,
        organizationId: apiKey.organizationId,
      },
    });

    if (!operation) throw new AppError('Operation not found', 404, 'OPERATION_NOT_FOUND');
    return serializeOperation(operation);
  });

  app.get('/v1/instances/:instanceId/groups', async request => {
    const { instanceId } = await getPublicInstance(request);
    const groups = await prisma.whatsAppGroup.findMany({
      where: { instanceId },
      include: { participants: { orderBy: [{ isSuperAdmin: 'desc' }, { isAdmin: 'desc' }, { jid: 'asc' }] } },
      orderBy: { subject: 'asc' },
      take: 200,
    });

    return groups.map(serializeGroup);
  });

  app.post('/v1/instances/:instanceId/groups/sync', async request => {
    return enqueuePublicOperation(request, 'GROUP_SYNC', {});
  });

  app.post('/v1/instances/:instanceId/groups', async request => {
    const body = parseBody(request, groupCreateBodySchema);

    return enqueuePublicOperation(request, 'GROUP_CREATE', body);
  });

  app.post('/v1/instances/:instanceId/groups/invite/accept', async request => {
    const body = parseBody(request, inviteCodeBodySchema);
    return enqueuePublicOperation(request, 'GROUP_ACCEPT_INVITE', body);
  });

  app.post('/v1/instances/:instanceId/groups/invite/metadata', async request => {
    const body = parseBody(request, inviteCodeBodySchema);
    return enqueuePublicOperation(request, 'GROUP_INVITE_METADATA', body);
  });

  app.get('/v1/instances/:instanceId/groups/invite/:code/metadata', async request => {
    await getPublicInstance(request);
    const { code } = parseParams(request, inviteCodeParamsSchema);
    return enqueuePublicOperation(request, 'GROUP_INVITE_METADATA', { code });
  });

  app.get('/v1/instances/:instanceId/groups/:groupId', async request => {
    const { group } = await getScopedPublicGroup(request);
    return serializeGroup(group);
  });

  app.get('/v1/instances/:instanceId/groups/:groupId/metadata/light', async request => {
    const { group } = await getScopedPublicGroup(request);
    return serializeGroup({ ...group, participants: undefined });
  });

  app.post('/v1/instances/:instanceId/groups/:groupId/metadata/sync', async request => {
    return enqueuePublicGroupOperation(request, 'GROUP_METADATA_SYNC', {});
  });

  app.post('/v1/instances/:instanceId/groups/:groupId/name', async request => {
    const body = parseBody(request, z.object({ name: z.string().min(1).max(120) }));
    return enqueuePublicGroupOperation(request, 'GROUP_UPDATE_NAME', body);
  });

  app.post('/v1/instances/:instanceId/groups/:groupId/description', async request => {
    const body = parseBody(request, z.object({ description: z.string().max(2048) }));
    return enqueuePublicGroupOperation(request, 'GROUP_UPDATE_DESCRIPTION', body);
  });

  app.post('/v1/instances/:instanceId/groups/:groupId/photo', async request => {
    const body = parseBody(request, groupPhotoBodySchema);
    return enqueuePublicGroupOperation(request, 'GROUP_UPDATE_PHOTO', body);
  });

  app.post('/v1/instances/:instanceId/groups/:groupId/participants/add', async request => {
    const body = parseBody(request, addParticipantsBodySchema);
    return enqueuePublicGroupOperation(request, 'GROUP_PARTICIPANTS_ADD', body);
  });

  app.post('/v1/instances/:instanceId/groups/:groupId/participants/remove', async request => {
    const body = parseBody(request, participantsBodySchema);
    return enqueuePublicGroupOperation(request, 'GROUP_PARTICIPANTS_REMOVE', body);
  });

  app.post('/v1/instances/:instanceId/groups/:groupId/requests/list', async request => {
    return enqueuePublicGroupOperation(request, 'GROUP_REQUESTS_LIST', {});
  });

  app.post('/v1/instances/:instanceId/groups/:groupId/requests/approve', async request => {
    const body = parseBody(request, participantsBodySchema);
    return enqueuePublicGroupOperation(request, 'GROUP_REQUESTS_APPROVE', body);
  });

  app.post('/v1/instances/:instanceId/groups/:groupId/requests/reject', async request => {
    const body = parseBody(request, participantsBodySchema);
    return enqueuePublicGroupOperation(request, 'GROUP_REQUESTS_REJECT', body);
  });

  app.post('/v1/instances/:instanceId/groups/:groupId/admins/promote', async request => {
    const body = parseBody(request, participantsBodySchema);
    return enqueuePublicGroupOperation(request, 'GROUP_ADMINS_PROMOTE', body);
  });

  app.post('/v1/instances/:instanceId/groups/:groupId/admins/demote', async request => {
    const body = parseBody(request, participantsBodySchema);
    return enqueuePublicGroupOperation(request, 'GROUP_ADMINS_DEMOTE', body);
  });

  app.post('/v1/instances/:instanceId/groups/:groupId/mention', async request => {
    const body = parseBody(
      request,
      z.object({
        text: z.string().min(1).max(4096),
        participants: z.array(z.string().min(6)).min(1).max(256),
      }),
    );
    return enqueuePublicGroupOperation(request, 'GROUP_MENTION', body);
  });

  app.post('/v1/instances/:instanceId/groups/:groupId/mention-all', async request => {
    const body = parseBody(request, z.object({ text: z.string().min(1).max(4096) }));
    return enqueuePublicGroupOperation(request, 'GROUP_MENTION_ALL', body);
  });

  app.post('/v1/instances/:instanceId/groups/:groupId/mention-group', async request => {
    const body = parseBody(request, groupMentionGroupsBodySchema);
    return enqueuePublicGroupOperation(request, 'GROUP_MENTION_GROUP', body);
  });

  app.post('/v1/instances/:instanceId/groups/:groupId/settings', async request => {
    const body = parseBody(request, groupSettingsBodySchema);
    return enqueuePublicGroupOperation(request, 'GROUP_SETTINGS_UPDATE', body);
  });

  app.post('/v1/instances/:instanceId/groups/:groupId/leave', async request => {
    return enqueuePublicGroupOperation(request, 'GROUP_LEAVE', {});
  });

  app.get('/v1/instances/:instanceId/groups/:groupId/invite-link', async request => {
    return enqueuePublicGroupOperation(request, 'GROUP_GET_INVITE_LINK', {});
  });

  app.post('/v1/instances/:instanceId/groups/:groupId/invite-link/revoke', async request => {
    return enqueuePublicGroupOperation(request, 'GROUP_REVOKE_INVITE_LINK', {});
  });

  app.post('/v1/instances/:instanceId/communities/sync', async request => {
    return enqueuePublicOperation(request, 'COMMUNITY_SYNC', {});
  });

  app.post('/v1/instances/:instanceId/communities', async request => {
    const body = parseBody(request, communityBodySchema);
    return enqueuePublicOperation(request, 'COMMUNITY_CREATE', body);
  });

  app.post('/v1/instances/:instanceId/communities/invite/accept', async request => {
    const body = parseBody(request, inviteCodeBodySchema);
    return enqueuePublicOperation(request, 'COMMUNITY_ACCEPT_INVITE', body);
  });

  app.get('/v1/instances/:instanceId/communities/:communityId', async request => {
    await getPublicInstance(request);
    const { communityId } = parseParams(request, communityParamsSchema);
    return enqueuePublicOperation(request, 'COMMUNITY_METADATA', { communityId: decodeURIComponent(communityId) });
  });

  app.post('/v1/instances/:instanceId/communities/:communityId/name', async request => {
    await getPublicInstance(request);
    const { communityId } = parseParams(request, communityParamsSchema);
    const body = parseBody(request, z.object({ name: z.string().min(1).max(120) }));
    return enqueuePublicOperation(request, 'COMMUNITY_UPDATE_NAME', { ...body, communityId: decodeURIComponent(communityId) });
  });

  app.post('/v1/instances/:instanceId/communities/:communityId/description', async request => {
    await getPublicInstance(request);
    const { communityId } = parseParams(request, communityParamsSchema);
    const body = parseBody(request, z.object({ description: z.string().max(2048) }));
    return enqueuePublicOperation(request, 'COMMUNITY_UPDATE_DESCRIPTION', { ...body, communityId: decodeURIComponent(communityId) });
  });

  app.post('/v1/instances/:instanceId/communities/:communityId/settings', async request => {
    await getPublicInstance(request);
    const { communityId } = parseParams(request, communityParamsSchema);
    const body = parseBody(request, groupSettingsBodySchema);
    return enqueuePublicOperation(request, 'COMMUNITY_SETTINGS_UPDATE', { ...body, communityId: decodeURIComponent(communityId) });
  });

  app.post('/v1/instances/:instanceId/communities/:communityId/participants/add', async request => {
    await getPublicInstance(request);
    const { communityId } = parseParams(request, communityParamsSchema);
    const body = parseBody(request, participantsBodySchema);
    return enqueuePublicOperation(request, 'COMMUNITY_PARTICIPANTS_ADD', { ...body, communityId: decodeURIComponent(communityId) });
  });

  app.post('/v1/instances/:instanceId/communities/:communityId/participants/remove', async request => {
    await getPublicInstance(request);
    const { communityId } = parseParams(request, communityParamsSchema);
    const body = parseBody(request, participantsBodySchema);
    return enqueuePublicOperation(request, 'COMMUNITY_PARTICIPANTS_REMOVE', { ...body, communityId: decodeURIComponent(communityId) });
  });

  app.post('/v1/instances/:instanceId/communities/:communityId/admins/promote', async request => {
    await getPublicInstance(request);
    const { communityId } = parseParams(request, communityParamsSchema);
    const body = parseBody(request, participantsBodySchema);
    return enqueuePublicOperation(request, 'COMMUNITY_ADMINS_PROMOTE', { ...body, communityId: decodeURIComponent(communityId) });
  });

  app.post('/v1/instances/:instanceId/communities/:communityId/admins/demote', async request => {
    await getPublicInstance(request);
    const { communityId } = parseParams(request, communityParamsSchema);
    const body = parseBody(request, participantsBodySchema);
    return enqueuePublicOperation(request, 'COMMUNITY_ADMINS_DEMOTE', { ...body, communityId: decodeURIComponent(communityId) });
  });

  app.post('/v1/instances/:instanceId/communities/:communityId/groups/link', async request => {
    await getPublicInstance(request);
    const { communityId } = parseParams(request, communityParamsSchema);
    const body = parseBody(request, communityGroupsBodySchema);
    return enqueuePublicOperation(request, 'COMMUNITY_GROUPS_LINK', { ...body, communityId: decodeURIComponent(communityId) });
  });

  app.post('/v1/instances/:instanceId/communities/:communityId/groups/unlink', async request => {
    await getPublicInstance(request);
    const { communityId } = parseParams(request, communityParamsSchema);
    const body = parseBody(request, communityGroupsBodySchema);
    return enqueuePublicOperation(request, 'COMMUNITY_GROUPS_UNLINK', { ...body, communityId: decodeURIComponent(communityId) });
  });

  app.get('/v1/instances/:instanceId/communities/:communityId/invite-link', async request => {
    await getPublicInstance(request);
    const { communityId } = parseParams(request, communityParamsSchema);
    return enqueuePublicOperation(request, 'COMMUNITY_GET_INVITE_LINK', { communityId: decodeURIComponent(communityId) });
  });

  app.post('/v1/instances/:instanceId/communities/:communityId/invite-link/revoke', async request => {
    await getPublicInstance(request);
    const { communityId } = parseParams(request, communityParamsSchema);
    return enqueuePublicOperation(request, 'COMMUNITY_REVOKE_INVITE_LINK', { communityId: decodeURIComponent(communityId) });
  });

  app.post('/v1/instances/:instanceId/newsletters', async request => {
    const body = parseBody(request, newsletterBodySchema);
    return enqueuePublicOperation(request, 'NEWSLETTER_CREATE', body);
  });

  app.get('/v1/instances/:instanceId/newsletters', async request => {
    return enqueuePublicOperation(request, 'NEWSLETTER_LIST', {});
  });

  app.post('/v1/instances/:instanceId/newsletters/search', async request => {
    const body = parseBody(request, z.record(z.string(), z.unknown()));
    return enqueuePublicOperation(request, 'NEWSLETTER_SEARCH', body);
  });

  app.get('/v1/instances/:instanceId/newsletters/:newsletterId', async request => {
    await getPublicInstance(request);
    const { newsletterId } = parseParams(request, newsletterParamsSchema);
    return enqueuePublicOperation(request, 'NEWSLETTER_METADATA', { newsletterId: decodeURIComponent(newsletterId) });
  });

  app.post('/v1/instances/:instanceId/newsletters/:newsletterId/follow', async request => {
    await getPublicInstance(request);
    const { newsletterId } = parseParams(request, newsletterParamsSchema);
    return enqueuePublicOperation(request, 'NEWSLETTER_FOLLOW', { newsletterId: decodeURIComponent(newsletterId) });
  });

  app.post('/v1/instances/:instanceId/newsletters/:newsletterId/unfollow', async request => {
    await getPublicInstance(request);
    const { newsletterId } = parseParams(request, newsletterParamsSchema);
    return enqueuePublicOperation(request, 'NEWSLETTER_UNFOLLOW', { newsletterId: decodeURIComponent(newsletterId) });
  });

  app.post('/v1/instances/:instanceId/newsletters/:newsletterId/mute', async request => {
    await getPublicInstance(request);
    const { newsletterId } = parseParams(request, newsletterParamsSchema);
    return enqueuePublicOperation(request, 'NEWSLETTER_MUTE', { newsletterId: decodeURIComponent(newsletterId) });
  });

  app.post('/v1/instances/:instanceId/newsletters/:newsletterId/unmute', async request => {
    await getPublicInstance(request);
    const { newsletterId } = parseParams(request, newsletterParamsSchema);
    return enqueuePublicOperation(request, 'NEWSLETTER_UNMUTE', { newsletterId: decodeURIComponent(newsletterId) });
  });

  app.delete('/v1/instances/:instanceId/newsletters/:newsletterId', async request => {
    await getPublicInstance(request);
    const { newsletterId } = parseParams(request, newsletterParamsSchema);
    return enqueuePublicOperation(request, 'NEWSLETTER_DELETE', { newsletterId: decodeURIComponent(newsletterId) });
  });

  app.post('/v1/instances/:instanceId/newsletters/:newsletterId/name', async request => {
    await getPublicInstance(request);
    const { newsletterId } = parseParams(request, newsletterParamsSchema);
    const body = parseBody(request, z.object({ name: z.string().min(1).max(120) }));
    return enqueuePublicOperation(request, 'NEWSLETTER_UPDATE_NAME', { ...body, newsletterId: decodeURIComponent(newsletterId) });
  });

  app.post('/v1/instances/:instanceId/newsletters/:newsletterId/description', async request => {
    await getPublicInstance(request);
    const { newsletterId } = parseParams(request, newsletterParamsSchema);
    const body = parseBody(request, z.object({ description: z.string().max(2048) }));
    return enqueuePublicOperation(request, 'NEWSLETTER_UPDATE_DESCRIPTION', { ...body, newsletterId: decodeURIComponent(newsletterId) });
  });

  app.post('/v1/instances/:instanceId/newsletters/:newsletterId/picture', async request => {
    await getPublicInstance(request);
    const { newsletterId } = parseParams(request, newsletterParamsSchema);
    const body = parseBody(request, groupPhotoBodySchema);
    return enqueuePublicOperation(request, 'NEWSLETTER_UPDATE_PICTURE', { ...body, newsletterId: decodeURIComponent(newsletterId) });
  });

  app.post('/v1/instances/:instanceId/newsletters/:newsletterId/admin-invite/accept', async request => {
    await getPublicInstance(request);
    const { newsletterId } = parseParams(request, newsletterParamsSchema);
    const body = parseBody(request, z.record(z.string(), z.unknown()));
    return enqueuePublicOperation(request, 'NEWSLETTER_ACCEPT_ADMIN_INVITE', { ...body, newsletterId: decodeURIComponent(newsletterId) });
  });

  app.post('/v1/instances/:instanceId/newsletters/:newsletterId/admin-invite/revoke', async request => {
    await getPublicInstance(request);
    const { newsletterId } = parseParams(request, newsletterParamsSchema);
    const body = parseBody(request, newsletterAdminBodySchema);
    return enqueuePublicOperation(request, 'NEWSLETTER_REVOKE_ADMIN_INVITE', { ...body, newsletterId: decodeURIComponent(newsletterId) });
  });

  app.post('/v1/instances/:instanceId/newsletters/:newsletterId/admins/remove', async request => {
    await getPublicInstance(request);
    const { newsletterId } = parseParams(request, newsletterParamsSchema);
    const body = parseBody(request, newsletterAdminBodySchema);
    return enqueuePublicOperation(request, 'NEWSLETTER_REMOVE_ADMIN', { ...body, newsletterId: decodeURIComponent(newsletterId) });
  });

  app.post('/v1/instances/:instanceId/newsletters/:newsletterId/transfer-ownership', async request => {
    await getPublicInstance(request);
    const { newsletterId } = parseParams(request, newsletterParamsSchema);
    const body = parseBody(request, newsletterAdminBodySchema);
    return enqueuePublicOperation(request, 'NEWSLETTER_TRANSFER_OWNERSHIP', { ...body, newsletterId: decodeURIComponent(newsletterId) });
  });

  app.post('/v1/instances/:instanceId/newsletters/:newsletterId/messages/react', async request => {
    await getPublicInstance(request);
    const { newsletterId } = parseParams(request, newsletterParamsSchema);
    const body = parseBody(
      request,
      z.object({
        serverId: z.string().min(1).optional(),
        messageId: z.string().min(1).optional(),
        reaction: z.string().max(32).optional(),
        emoji: z.string().max(32).optional(),
      }).refine(value => value.serverId || value.messageId, {
        message: 'Informe serverId ou messageId.',
      }),
    );
    return enqueuePublicOperation(request, 'NEWSLETTER_REACT_MESSAGE', { ...body, newsletterId: decodeURIComponent(newsletterId) });
  });

  app.get('/v1/instances/:instanceId/newsletters/:newsletterId/messages', async request => {
    await getPublicInstance(request);
    const { newsletterId } = parseParams(request, newsletterParamsSchema);
    const query = parseQuery(request, z.object({
      count: z.coerce.number().int().min(1).max(100).default(20),
      since: z.coerce.number().int().min(0).default(0),
      after: z.coerce.number().int().min(0).default(0),
    }));
    return enqueuePublicOperation(request, 'NEWSLETTER_FETCH_MESSAGES', { ...query, newsletterId: decodeURIComponent(newsletterId) });
  });

  app.get('/v1/instances/:instanceId/business/profile', async request => {
    const query = parseQuery(request, z.object({ jid: z.string().min(1).optional(), phone: z.string().min(3).optional() }));
    return enqueuePublicOperation(request, 'BUSINESS_PROFILE', query);
  });

  app.patch('/v1/instances/:instanceId/business/profile', async request => {
    const body = parseBody(request, businessProfileBodySchema);
    return enqueuePublicOperation(request, 'BUSINESS_PROFILE_UPDATE', body);
  });

  app.get('/v1/instances/:instanceId/business/products', async request => {
    const query = parseQuery(request, z.object({
      jid: z.string().min(1).optional(),
      phone: z.string().min(3).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(10),
      cursor: z.string().optional(),
    }));
    return enqueuePublicOperation(request, 'BUSINESS_PRODUCTS_LIST', query);
  });

  app.post('/v1/instances/:instanceId/business/products', async request => {
    const body = parseBody(request, businessProductBodySchema);
    return enqueuePublicOperation(request, 'BUSINESS_PRODUCT_CREATE', body);
  });

  app.get('/v1/instances/:instanceId/business/products/:productId', async request => {
    await getPublicInstance(request);
    const params = parseParams(request, z.object({ instanceId: z.string().min(1), productId: z.string().min(1) }));
    const query = parseQuery(request, z.object({ jid: z.string().min(1).optional(), phone: z.string().min(3).optional() }));
    return enqueuePublicOperation(request, 'BUSINESS_PRODUCT_GET', { ...query, productId: params.productId });
  });

  app.patch('/v1/instances/:instanceId/business/products/:productId', async request => {
    await getPublicInstance(request);
    const { productId } = parseParams(request, z.object({ instanceId: z.string().min(1), productId: z.string().min(1) }));
    const body = parseBody(request, businessProductBodySchema);
    return enqueuePublicOperation(request, 'BUSINESS_PRODUCT_UPDATE', { ...body, productId });
  });

  app.delete('/v1/instances/:instanceId/business/products/:productId', async request => {
    await getPublicInstance(request);
    const { productId } = parseParams(request, z.object({ instanceId: z.string().min(1), productId: z.string().min(1) }));
    return enqueuePublicOperation(request, 'BUSINESS_PRODUCT_DELETE', { productId });
  });

  app.get('/v1/instances/:instanceId/business/collections', async request => {
    const query = parseQuery(request, z.object({
      jid: z.string().min(1).optional(),
      phone: z.string().min(3).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(10),
    }));
    return enqueuePublicOperation(request, 'BUSINESS_COLLECTIONS_LIST', query);
  });

  app.post('/v1/instances/:instanceId/business/tags', async request => {
    const body = parseBody(request, businessTagBodySchema);
    return enqueuePublicOperation(request, 'BUSINESS_TAGS_CREATE', body);
  });

  app.patch('/v1/instances/:instanceId/business/tags/:tagId', async request => {
    await getPublicInstance(request);
    const { tagId } = parseParams(request, z.object({ instanceId: z.string().min(1), tagId: z.string().min(1) }));
    const body = parseBody(request, businessTagBodySchema);
    return enqueuePublicOperation(request, 'BUSINESS_TAGS_UPDATE', { ...body, tagId });
  });

  app.delete('/v1/instances/:instanceId/business/tags/:tagId', async request => {
    await getPublicInstance(request);
    const { tagId } = parseParams(request, z.object({ instanceId: z.string().min(1), tagId: z.string().min(1) }));
    return enqueuePublicOperation(request, 'BUSINESS_TAGS_DELETE', { tagId });
  });

  app.post('/v1/instances/:instanceId/business/tags/:tagId/chats/add', async request => {
    await getPublicInstance(request);
    const { tagId } = parseParams(request, z.object({ instanceId: z.string().min(1), tagId: z.string().min(1) }));
    const body = parseBody(request, z.object({ remoteJid: z.string().min(1).optional(), to: z.string().min(1).optional() }).refine(value => value.remoteJid || value.to, {
      message: 'Informe remoteJid ou to.',
    }));
    return enqueuePublicOperation(request, 'BUSINESS_TAGS_CHAT_ADD', { ...body, tagId });
  });

  app.post('/v1/instances/:instanceId/business/tags/:tagId/chats/remove', async request => {
    await getPublicInstance(request);
    const { tagId } = parseParams(request, z.object({ instanceId: z.string().min(1), tagId: z.string().min(1) }));
    const body = parseBody(request, z.object({ remoteJid: z.string().min(1).optional(), to: z.string().min(1).optional() }).refine(value => value.remoteJid || value.to, {
      message: 'Informe remoteJid ou to.',
    }));
    return enqueuePublicOperation(request, 'BUSINESS_TAGS_CHAT_REMOVE', { ...body, tagId });
  });

  app.get('/v1/instances/:instanceId/queue', async request => {
    const { instanceId } = await getPublicInstance(request);
    const query = parseQuery(request, paginationQuerySchema);
    const queueEntries = await Promise.all([
      queues.sendMessage.getJobs(['waiting', 'delayed', 'paused'], query.start, query.end),
      queues.whatsappOperation.getJobs(['waiting', 'delayed', 'paused'], query.start, query.end),
    ]);
    const jobs = queueEntries.flatMap((entries, queueIndex) => entries.map(job => ({
      id: job.id,
      queue: queueIndex === 0 ? 'send-message' : 'whatsapp-operation',
      name: job.name,
      data: job.data,
      timestamp: job.timestamp ? new Date(job.timestamp).toISOString() : null,
    })));

    return jobs.filter(job => {
      const data = job.data as { instanceId?: string };
      return data.instanceId === instanceId;
    });
  });

  app.delete('/v1/instances/:instanceId/queue', async request => {
    const { instanceId } = await getPublicInstance(request);
    const queueEntries = await Promise.all([
      queues.sendMessage.getJobs(['waiting', 'delayed', 'paused']),
      queues.whatsappOperation.getJobs(['waiting', 'delayed', 'paused']),
    ]);
    const jobs = queueEntries.flat().filter(job => (job.data as { instanceId?: string }).instanceId === instanceId);

    await Promise.all(jobs.map(job => job.remove()));
    return { removed: jobs.length };
  });

  app.get('/v1/instances/:instanceId/queue/settings', async request => {
    const { instanceId } = await getPublicInstance(request);
    return {
      instanceId,
      enqueueWhenDisconnected: true,
      persisted: false,
      note: 'O RavoxZap enfileira operações por padrão; configuração persistida por instância ainda não foi adicionada.',
    };
  });

  app.patch('/v1/instances/:instanceId/queue/settings', async request => {
    const { instanceId } = await getPublicInstance(request);
    const body = parseBody(request, z.object({ enqueueWhenDisconnected: z.boolean().optional() }));
    return {
      instanceId,
      enqueueWhenDisconnected: body.enqueueWhenDisconnected ?? true,
      persisted: false,
      note: 'Contrato exposto; persistência dessa preferência precisa de campo próprio no banco.',
    };
  });

  app.delete('/v1/instances/:instanceId/queue/:queueItemId', async request => {
    const { instanceId } = await getPublicInstance(request);
    const { queueItemId } = parseParams(request, queueItemParamsSchema);
    const jobs = await Promise.all([
      queues.sendMessage.getJob(queueItemId),
      queues.whatsappOperation.getJob(queueItemId),
    ]);
    const job = jobs.find(item => item && (item.data as { instanceId?: string }).instanceId === instanceId);
    if (!job) throw new AppError('Queue item not found', 404, 'QUEUE_ITEM_NOT_FOUND');

    await job.remove();
    return { removed: true, queueItemId };
  });

  app.get('/v1/instances/:instanceId/chats', async request => {
    const { instanceId } = await getPublicInstance(request);

    const chats = await prisma.chat.findMany({
      where: { instanceId, deletedAt: null },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            body: true,
            type: true,
            fromMe: true,
            status: true,
            mediaUrl: true,
            createdAt: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });

    return chats.map(serializeChat);
  });

  app.get('/v1/instances/:instanceId/chats/:chatId', async request => {
    const { chat } = await getScopedPublicChat(request);
    const detailed = await prisma.chat.findUnique({
      where: { id: chat.id },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            body: true,
            type: true,
            fromMe: true,
            status: true,
            mediaUrl: true,
            createdAt: true,
          },
        },
      },
    });

    if (!detailed) throw new AppError('Chat not found', 404, 'CHAT_NOT_FOUND');
    return serializeChat(detailed);
  });

  app.post('/v1/instances/:instanceId/chats/:chatId/read', async request => {
    const body = parseBody(request, z.object({ read: z.boolean().default(true) }));
    return enqueuePublicChatOperation(request, 'CHAT_READ', body);
  });

  app.post('/v1/instances/:instanceId/chats/:chatId/archive', async request => {
    const body = parseBody(request, z.object({ archived: z.boolean().default(true) }));
    return enqueuePublicChatOperation(request, 'CHAT_ARCHIVE', body);
  });

  app.post('/v1/instances/:instanceId/chats/:chatId/pin', async request => {
    const body = parseBody(request, z.object({ pinned: z.boolean().default(true) }));
    return enqueuePublicChatOperation(request, 'CHAT_PIN', body);
  });

  app.post('/v1/instances/:instanceId/chats/:chatId/mute', async request => {
    const body = parseBody(request, z.object({ mutedUntil: z.string().datetime().nullable().optional() }));
    return enqueuePublicChatOperation(request, 'CHAT_MUTE', body);
  });

  app.post('/v1/instances/:instanceId/chats/:chatId/clear', async request => {
    return enqueuePublicChatOperation(request, 'CHAT_CLEAR', {});
  });

  app.post('/v1/instances/:instanceId/chats/:chatId/delete', async request => {
    return enqueuePublicChatOperation(request, 'CHAT_DELETE', {});
  });

  app.post('/v1/instances/:instanceId/chats/:chatId/ephemeral', async request => {
    const body = parseBody(request, z.object({ expirationSeconds: z.number().int().min(0).max(31_536_000) }));
    return enqueuePublicChatOperation(request, 'CHAT_EPHEMERAL', body);
  });

  app.get('/v1/instances/:instanceId/chats/:chatId/messages', async request => {
    const { instanceId } = await getPublicInstance(request);
    const { chatId } = parseParams(request, z.object({ instanceId: z.string().min(1), chatId: z.string().min(1) }));
    const chat = await prisma.chat.findFirst({
      where: { id: chatId, instanceId },
      select: { id: true },
    });

    if (!chat) throw new AppError('Chat not found', 404, 'CHAT_NOT_FOUND');

    return prisma.message.findMany({
      where: { instanceId, chatId },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
  });

  app.get('/v1/instances/:instanceId/status', async request => {
    const { instance, instanceId } = await getPublicInstance(request);
    return {
      instanceId,
      status: instance.status,
      phoneNumber: instance.phoneNumber,
      profileName: instance.profileName,
    };
  });

  app.get('/v1/instances/:instanceId/qrcode', async request => {
    const { instance, instanceId } = await getPublicInstance(request);
    return {
      instanceId,
      status: instance.status,
      qrCode: instance.qrCode,
      qrUpdatedAt: instance.qrUpdatedAt?.toISOString() ?? null,
    };
  });

  app.post('/v1/instances/:instanceId/restart', async request => {
    const { apiKey, instanceId } = await getPublicInstance(request);

    await queues.disconnectInstance.add('disconnect-instance', {
      instanceId,
      organizationId: apiKey.organizationId,
      clearSession: false,
    });

    await queues.connectInstance.add('connect-instance', {
      instanceId,
      organizationId: apiKey.organizationId,
    });

    return { queued: true, instanceId };
  });

  app.post('/v1/instances/:instanceId/logout', async request => {
    const { apiKey, instanceId } = await getPublicInstance(request);

    await queues.disconnectInstance.add('disconnect-instance', {
      instanceId,
      organizationId: apiKey.organizationId,
      clearSession: true,
    });

    await prisma.whatsAppInstance.update({
      where: { id: instanceId },
      data: {
        status: 'LOGGED_OUT',
        disconnectedAt: new Date(),
        qrCode: null,
        qrUpdatedAt: null,
      },
    });

    return { queued: true, instanceId };
  });
}
