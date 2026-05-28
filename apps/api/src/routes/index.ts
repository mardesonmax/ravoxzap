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
const webhookQuerySchema = z.object({ instanceId: z.string().min(1).optional() });
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
  const dataUrlMatch = input.source.match(/^data:([^;,]+);base64,(.+)$/s);

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

    return prisma.chat.findMany({
      where: { instanceId: id },
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
            createdAt: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
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

    const message = await prisma.message.create({
      data: {
        instanceId,
        remoteJid: body.to.replace(/\D/g, ''),
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

  app.get('/v1/instances/:instanceId/chats', async request => {
    const { instanceId } = await getPublicInstance(request);

    return prisma.chat.findMany({
      where: { instanceId },
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
            createdAt: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
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
