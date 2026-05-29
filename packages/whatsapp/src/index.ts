import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadContentFromMessage,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  type WASocket,
} from '@whiskeysockets/baileys';
import { spawn } from 'node:child_process';
import { readFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import Pino from 'pino';
import QRCode from 'qrcode';

import type { MessageStatus, MessageType } from '@ravoxzap/shared';

export type NormalizedIncomingMessage = {
  remoteJid: string;
  aliases?: string[];
  externalId?: string;
  fromMe: boolean;
  type: MessageType;
  body?: string;
  media?: {
    bytes: Buffer;
    mimeType: string;
    extension: string;
  };
  mediaUrl?: string;
  mediaDownloadError?: string;
};

export type NormalizedMessageUpdate = {
  externalId: string;
  remoteJid?: string;
  status: MessageStatus;
};

export type WhatsAppConnectionCallbacks = {
  onConnectionUpdate?: (update: {
    connection?: string;
    hasQr: boolean;
    statusCode?: number;
    errorMessage?: string;
    restartRequired?: boolean;
    isNewLogin?: boolean;
    receivedPendingNotifications?: boolean;
  }) => Promise<void> | void;
  onQr?: (qrCode: string) => Promise<void> | void;
  onConnected?: (profile: { phoneNumber?: string; profileName?: string }) => Promise<void> | void;
  onDisconnected?: (reason: {
    shouldReconnect: boolean;
    statusCode?: number;
    errorMessage?: string;
    restartRequired?: boolean;
  }) => Promise<void> | void;
  onMessage?: (message: NormalizedIncomingMessage) => Promise<void> | void;
  onMessageUpdate?: (message: NormalizedMessageUpdate) => Promise<void> | void;
};

export type ConnectInstanceInput = {
  instanceId: string;
  sessionBasePath: string;
  callbacks?: WhatsAppConnectionCallbacks;
};

export type ConnectInstanceResult = {
  connected: boolean;
  qrCode?: string;
};

export type WhatsAppGroupParticipantMetadata = {
  jid: string;
  name?: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
};

export type WhatsAppGroupMetadata = {
  remoteJid: string;
  subject: string;
  description?: string;
  ownerJid?: string;
  size: number;
  announce?: boolean;
  restrict?: boolean;
  memberAddMode?: boolean;
  joinApprovalMode?: boolean;
  ephemeralDuration?: number | null;
  pictureUrl?: string;
  inviteCode?: string;
  participants: WhatsAppGroupParticipantMetadata[];
};

export type WhatsAppGroupCreateResult = {
  group: WhatsAppGroupMetadata;
  phone: string;
  phonesNotAdded: string[];
  invitationLink?: string;
  autoInvite: boolean;
};

export type WhatsAppGroupParticipantsAddResult = {
  result: Array<{ status?: string | number; jid?: string }>;
  phonesNotAdded: string[];
  invitationLink?: string;
  autoInvite: boolean;
};

export type WhatsAppGroupSettingsInput = {
  messages?: 'admins' | 'all';
  info?: 'admins' | 'all';
  addMembers?: 'admins' | 'all';
  joinApproval?: boolean;
  ephemeralSeconds?: number;
};

export type WhatsAppSendResult = {
  externalId?: string;
  remoteJid: string;
  status: MessageStatus;
};

export type WhatsAppContactCard = {
  displayName: string;
  phone?: string;
  vcard?: string;
};

export type WhatsAppPrivacyValue = 'all' | 'contacts' | 'contact_blacklist' | 'none';
export type WhatsAppOnlinePrivacyValue = 'all' | 'match_last_seen';
export type WhatsAppGroupAddPrivacyValue = 'all' | 'contacts' | 'contact_blacklist';
export type WhatsAppReadReceiptsValue = 'all' | 'none';

export type WhatsAppCommunitySettingsInput = WhatsAppGroupSettingsInput;

type ManagedSocket = {
  socket: WASocket;
  callbacks?: WhatsAppConnectionCallbacks;
};

type IncomingMediaType = Extract<MessageType, 'IMAGE' | 'AUDIO' | 'DOCUMENT' | 'VIDEO'>;

const socketLogger = Pino({ level: 'silent' });

export function normalizePhoneToJid(value: string): string {
  const trimmed = value.trim();

  if (trimmed.endsWith('@lid') || trimmed.endsWith('@hosted.lid')) {
    return trimmed;
  }

  if (trimmed.endsWith('@s.whatsapp.net') || trimmed.endsWith('@g.us')) {
    return normalizePnJid(trimmed);
  }

  const digits = trimmed.replace(/\D/g, '');
  return `${digits}@s.whatsapp.net`;
}

export async function renderQrCodeDataUrl(qr: string): Promise<string> {
  return QRCode.toDataURL(qr, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 360,
  });
}

export function getSessionPath(basePath: string, instanceId: string): string {
  return path.join(basePath, instanceId);
}

function getStatusCode(error: unknown): number | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'output' in error &&
    typeof error.output === 'object' &&
    error.output !== null &&
    'statusCode' in error.output &&
    typeof error.output.statusCode === 'number'
  ) {
    return error.output.statusCode;
  }

  return undefined;
}

function getErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) return error.message;
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return undefined;
}

function normalizePnJid(value: string): string {
  return value.replace(/:(\d+)@/, '@');
}

export function chooseIncomingChatRemoteJid(values: string[], fallbackJid: string): string {
  const normalizedFallback = normalizePnJid(fallbackJid);
  const normalizedValues = values.map(normalizePnJid);
  const groupJid = normalizedValues.find(jid => jid.endsWith('@g.us'));

  if (groupJid) {
    return groupJid;
  }

  return normalizedValues.find(jid => jid.endsWith('@s.whatsapp.net')) ?? normalizedFallback;
}

function isLidJid(value: string): boolean {
  return value.endsWith('@lid') || value.endsWith('@hosted.lid');
}

function phoneFromJid(value: string): string {
  return normalizePnJid(value).replace(/@.+$/, '').replace(/\D/g, '');
}

function groupPhoneFromJid(value: string): string {
  return normalizeGroupJid(value).replace('@g.us', '-group');
}

function normalizeNewsletterJid(value: string): string {
  const trimmed = value.trim();
  if (trimmed.endsWith('@newsletter')) return trimmed;
  return `${trimmed.replace(/\D/g, '')}@newsletter`;
}

function normalizeStatusJidList(values?: string[]) {
  const contacts = values?.map(value => normalizePhoneToJid(value)).filter(value => value.endsWith('@s.whatsapp.net')) ?? [];
  return [...new Set(contacts)];
}

function makeVcard(contact: WhatsAppContactCard) {
  if (contact.vcard) return contact.vcard;
  const phone = contact.phone?.replace(/\D/g, '') ?? '';
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${contact.displayName}`,
    phone ? `TEL;type=CELL;type=VOICE;waid=${phone}:+${phone}` : '',
    'END:VCARD',
  ].filter(Boolean).join('\n');
}

export function extractGroupInviteCode(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  try {
    const url = new URL(trimmed);
    if (url.hostname === 'chat.whatsapp.com') {
      return url.pathname.replace(/^\/+/, '').split('/')[0]?.trim() || undefined;
    }
  } catch {
    // Not a URL; treat it as the raw invite code below.
  }

  return trimmed
    .replace(/^https?:\/\/chat\.whatsapp\.com\//i, '')
    .split(/[/?#]/)[0]
    ?.trim() || undefined;
}

async function resolveLidToPhoneJid(socket: WASocket, jid: string): Promise<string | null> {
  if (!isLidJid(jid)) return null;

  const phoneJid = await socket.signalRepository.lidMapping.getPNForLID(jid).catch(() => null);
  return typeof phoneJid === 'string' ? normalizePnJid(phoneJid) : null;
}

function getMessageContent(message: Record<string, any> | undefined): Record<string, any> | undefined {
  if (!message) return undefined;

  let content = message;

  for (let index = 0; index < 6; index += 1) {
    const nested =
      content.ephemeralMessage?.message ??
      content.viewOnceMessage?.message ??
      content.viewOnceMessageV2?.message ??
      content.viewOnceMessageV2Extension?.message ??
      content.documentWithCaptionMessage?.message ??
      content.editedMessage?.message;

    if (!nested || nested === content) break;
    content = nested;
  }

  return content;
}

function extensionFromMimeType(mimeType: string, fileName?: string): string {
  const fileExtension = fileName ? path.extname(fileName).replace('.', '').toLowerCase() : '';
  if (fileExtension) return fileExtension;

  const normalizedMime = mimeType.toLowerCase().split(';')[0]?.trim() ?? '';
  const extensionByMime: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'audio/ogg': 'ogg',
    'audio/opus': 'opus',
    'audio/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/wav': 'wav',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'application/pdf': 'pdf',
  };

  return extensionByMime[normalizedMime] ?? 'bin';
}

async function resolveJidAliases(socket: WASocket, rawKey: Record<string, unknown>, fallbackJid: string) {
  const candidates = new Set<string>();
  const rawValues = [
    rawKey.remoteJid,
    rawKey.remoteJidAlt,
    rawKey.remoteJidUsername,
    rawKey.participant,
    rawKey.participantAlt,
    rawKey.participantUsername,
  ];

  for (const value of rawValues) {
    if (typeof value === 'string' && value.includes('@')) {
      candidates.add(normalizePnJid(value));
    }
  }

  candidates.add(normalizePnJid(fallbackJid));

  for (const jid of [...candidates]) {
    if (!isLidJid(jid)) continue;

    const pn = await resolveLidToPhoneJid(socket, jid);
    if (pn) candidates.add(normalizePnJid(pn));
  }

  const aliases = [...candidates];
  const remoteJid = chooseIncomingChatRemoteJid(aliases, fallbackJid);

  return {
    remoteJid,
    aliases: aliases.filter(jid => jid !== remoteJid),
  };
}

async function normalizeIncomingMessage(socket: WASocket, rawMessage: WASocket['ev'] extends never ? never : any): Promise<NormalizedIncomingMessage | null> {
  const message = getMessageContent(rawMessage.message);
  const remoteJid = rawMessage.key?.remoteJid;

  if (!message || !remoteJid) return null;

  const text =
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.imageMessage?.caption ??
    message.videoMessage?.caption ??
    message.ptvMessage?.caption ??
    message.documentMessage?.caption ??
    message.documentMessage?.fileName;

  let type: MessageType = 'UNKNOWN';
  if (message.conversation || message.extendedTextMessage) type = 'TEXT';
  else if (message.imageMessage) type = 'IMAGE';
  else if (message.audioMessage) type = 'AUDIO';
  else if (message.documentMessage) type = 'DOCUMENT';
  else if (message.videoMessage || message.ptvMessage) type = 'VIDEO';

  const resolvedJids = await resolveJidAliases(socket, rawMessage.key ?? {}, remoteJid);
  let media: NormalizedIncomingMessage['media'];
  let mediaDownloadError: string | undefined;

  try {
    media = await downloadIncomingMedia(socket, rawMessage, type);
  } catch (error) {
    mediaDownloadError = getErrorMessage(error) ?? String(error);
  }

  return {
    remoteJid: resolvedJids.remoteJid,
    aliases: resolvedJids.aliases,
    externalId: rawMessage.key?.id,
    fromMe: Boolean(rawMessage.key?.fromMe),
    type,
    body: text,
    media,
    mediaDownloadError,
  };
}

async function downloadIncomingMedia(
  socket: WASocket,
  rawMessage: WASocket['ev'] extends never ? never : any,
  type: MessageType,
) {
  if (!isIncomingMediaType(type)) return undefined;

  const message = getMessageContent(rawMessage.message);
  const mediaMessage =
    message?.imageMessage ??
    message?.audioMessage ??
    message?.videoMessage ??
    message?.ptvMessage ??
    message?.documentMessage;

  if (!mediaMessage) return undefined;

  const fallbackMimeByType: Record<IncomingMediaType, string> = {
    IMAGE: 'image/jpeg',
    AUDIO: 'audio/ogg',
    DOCUMENT: 'application/octet-stream',
    VIDEO: 'video/mp4',
  };
  const mimeType = mediaMessage.mimetype ?? fallbackMimeByType[type];
  const extension = extensionFromMimeType(mimeType, mediaMessage.fileName);
  let bytes: Buffer | undefined;
  let mediaMessageError: unknown;

  try {
    const downloaded = await downloadMediaMessage(
      rawMessage,
      'buffer',
      {},
      {
        logger: socketLogger,
        reuploadRequest: message => socket.updateMediaMessage(message),
      },
    );

    if (downloaded && Buffer.isBuffer(downloaded)) bytes = downloaded;
  } catch (error) {
    mediaMessageError = error;
  }

  if (!bytes) {
    try {
      const stream = await downloadContentFromMessage(mediaMessage, baileysMediaType(type));
      bytes = await streamToBuffer(stream);
    } catch (error) {
      if (mediaMessageError) {
        throw new Error(
          `Failed to download media. downloadMediaMessage: ${getErrorMessage(mediaMessageError) ?? String(mediaMessageError)}; downloadContentFromMessage: ${getErrorMessage(error) ?? String(error)}`,
        );
      }

      throw error;
    }
  }

  if (!bytes || !Buffer.isBuffer(bytes)) return undefined;

  return {
    bytes,
    mimeType,
    extension,
  };
}

function isIncomingMediaType(type: MessageType): type is IncomingMediaType {
  return type === 'IMAGE' || type === 'AUDIO' || type === 'DOCUMENT' || type === 'VIDEO';
}

function baileysMediaType(type: IncomingMediaType) {
  if (type === 'IMAGE') return 'image';
  if (type === 'AUDIO') return 'audio';
  if (type === 'VIDEO') return 'video';
  return 'document';
}

async function streamToBuffer(stream: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function normalizeMessageStatus(status: number | null | undefined): MessageStatus | null {
  if (status === 2) return 'SENT';
  if (status === 3) return 'DELIVERED';
  if (status === 4 || status === 5) return 'READ';
  if (status === 0) return 'FAILED';
  return null;
}

function normalizeGroupJid(value: string): string {
  if (value.endsWith('@g.us')) return value;
  return `${value.replace(/\D/g, '')}@g.us`;
}

function serializeSendResult(remoteJid: string, result: { key?: { id?: string | null }; status?: number | null } | undefined): WhatsAppSendResult {
  return {
    externalId: result?.key?.id ?? undefined,
    remoteJid,
    status: normalizeMessageStatus(result?.status) ?? 'QUEUED',
  };
}

function normalizeGroupMetadata(metadata: any): WhatsAppGroupMetadata {
  const participants = Array.isArray(metadata?.participants) ? metadata.participants : [];

  return {
    remoteJid: metadata?.id ?? metadata?.remoteJid ?? '',
    subject: metadata?.subject ?? metadata?.name ?? 'Grupo sem nome',
    description: metadata?.desc ?? metadata?.description,
    ownerJid: metadata?.owner,
    size: Number(metadata?.size ?? participants.length ?? 0),
    announce: typeof metadata?.announce === 'boolean' ? metadata.announce : undefined,
    restrict: typeof metadata?.restrict === 'boolean' ? metadata.restrict : undefined,
    memberAddMode: typeof metadata?.memberAddMode === 'boolean' ? metadata.memberAddMode : undefined,
    joinApprovalMode: typeof metadata?.joinApprovalMode === 'boolean' ? metadata.joinApprovalMode : undefined,
    ephemeralDuration: typeof metadata?.ephemeralDuration === 'number' ? metadata.ephemeralDuration : 0,
    pictureUrl: typeof metadata?.pictureUrl === 'string' ? metadata.pictureUrl : undefined,
    inviteCode: metadata?.inviteCode,
    participants: participants
      .map((participant: any) => {
        const admin = participant?.admin;
        const jid = participant?.id ?? participant?.jid;
        if (!jid) return null;

        return {
          jid: normalizePnJid(jid),
          name: participant?.name ?? participant?.notify,
          isAdmin: admin === 'admin' || admin === 'superadmin',
          isSuperAdmin: admin === 'superadmin',
        };
      })
      .filter(Boolean),
  };
}

async function normalizeGroupMetadataWithAliases(socket: WASocket, metadata: any): Promise<WhatsAppGroupMetadata> {
  const group = normalizeGroupMetadata(metadata);
  const ownerJid =
    group.ownerJid && isLidJid(group.ownerJid)
      ? (await resolveLidToPhoneJid(socket, group.ownerJid)) ?? group.ownerJid
      : group.ownerJid;

  const participants = await Promise.all(
    group.participants.map(async participant => {
      if (!isLidJid(participant.jid)) return participant;

      const phoneJid = await resolveLidToPhoneJid(socket, participant.jid);
      if (!phoneJid) return participant;

      return {
        ...participant,
        jid: phoneJid,
        name: participant.name ?? phoneFromJid(phoneJid),
      };
    }),
  );

  return {
    ...group,
    ownerJid,
    participants,
  };
}

async function runFfmpegAudioTranscode(inputPath: string, codec: 'libopus' | 'opus'): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      inputPath,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '48000',
      '-c:a',
      codec,
      ...(codec === 'opus' ? ['-strict', '-2'] : []),
      '-b:a',
      '32k',
      '-f',
      'ogg',
      'pipe:1',
    ];
    const ffmpeg = spawn('ffmpeg', args);

    ffmpeg.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    ffmpeg.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
    ffmpeg.on('error', error => {
      reject(new Error(`ffmpeg is required to send recorded audio: ${error.message}`));
    });
    ffmpeg.on('close', code => {
      if (code === 0 && chunks.length > 0) {
        resolve(Buffer.concat(chunks));
        return;
      }

      const message = Buffer.concat(errors).toString('utf8').trim();
      reject(new Error(message || `ffmpeg exited with code ${code ?? 'unknown'}`));
    });
  });
}

async function transcodeAudioToWhatsAppVoice(inputPath: string): Promise<Buffer> {
  try {
    return await runFfmpegAudioTranscode(inputPath, 'libopus');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('Unknown encoder')) throw error;
    return runFfmpegAudioTranscode(inputPath, 'opus');
  }
}

export class WhatsAppConnectionManager {
  private readonly activeInstances = new Map<string, ManagedSocket>();
  private readonly pendingConnections = new Map<string, Promise<ConnectInstanceResult>>();

  isConnected(instanceId: string): boolean {
    return this.activeInstances.has(instanceId);
  }

  async connect(input: ConnectInstanceInput): Promise<ConnectInstanceResult> {
    const existing = this.activeInstances.get(input.instanceId);
    if (existing) {
      existing.callbacks = input.callbacks;
      return { connected: true };
    }

    const pending = this.pendingConnections.get(input.instanceId);
    if (pending) return pending;

    const connection = this.createConnection(input);
    this.pendingConnections.set(input.instanceId, connection);

    try {
      return await connection;
    } finally {
      this.pendingConnections.delete(input.instanceId);
    }
  }

  private async createConnection(input: ConnectInstanceInput): Promise<ConnectInstanceResult> {
    const sessionPath = getSessionPath(input.sessionBasePath, input.instanceId);
    await mkdir(sessionPath, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    return new Promise((resolve, reject) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve({ connected: this.activeInstances.has(input.instanceId) });
        }
      }, 45_000);

      try {
        const socket = makeWASocket({
          version,
          logger: socketLogger,
          auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, socketLogger),
          },
          browser: Browsers.ubuntu('RavoxZap'),
          markOnlineOnConnect: false,
          printQRInTerminal: false,
          getMessage: async () => undefined,
        });

        this.activeInstances.set(input.instanceId, {
          socket,
          callbacks: input.callbacks,
        });

        socket.ev.on('creds.update', saveCreds);

        socket.ev.on('connection.update', update => {
          const managed = this.activeInstances.get(input.instanceId);
          const statusCode = getStatusCode(update.lastDisconnect?.error);
          const errorMessage = getErrorMessage(update.lastDisconnect?.error);
          const restartRequired = statusCode === DisconnectReason.restartRequired;
          const updateDetails = update as {
            isNewLogin?: boolean;
            receivedPendingNotifications?: boolean;
          };

          void managed?.callbacks?.onConnectionUpdate?.({
            connection: update.connection,
            hasQr: Boolean(update.qr),
            statusCode,
            errorMessage,
            restartRequired,
            isNewLogin: updateDetails.isNewLogin,
            receivedPendingNotifications: updateDetails.receivedPendingNotifications,
          });

          if (update.qr) {
            void renderQrCodeDataUrl(update.qr).then(qrCode => {
              void managed?.callbacks?.onQr?.(qrCode);
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                resolve({ connected: false, qrCode });
              }
            });
          }

          if (update.connection === 'open') {
            const profile = {
              phoneNumber: socket.user?.id?.split(':')[0],
              profileName: socket.user?.name,
            };

            void managed?.callbacks?.onConnected?.(profile);
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              resolve({ connected: true });
            }
          }

          if (update.connection === 'close') {
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            this.activeInstances.delete(input.instanceId);
            void managed?.callbacks?.onDisconnected?.({
              shouldReconnect,
              statusCode,
              errorMessage,
              restartRequired,
            });

            if (restartRequired) {
              setTimeout(() => {
                void this.connect(input).catch(reconnectError => {
                  void managed?.callbacks?.onConnectionUpdate?.({
                    connection: 'close',
                    hasQr: false,
                    errorMessage: getErrorMessage(reconnectError) ?? String(reconnectError),
                  });
                });
              }, 750);
            }

            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              resolve({ connected: false });
            }
          }
        });

        socket.ev.on('messages.upsert', event => {
          const managed = this.activeInstances.get(input.instanceId);
          for (const rawMessage of event.messages) {
            void normalizeIncomingMessage(socket, rawMessage).then(message => {
              if (message) void managed?.callbacks?.onMessage?.(message);
            });
          }
        });

        socket.ev.on('messages.update', updates => {
          const managed = this.activeInstances.get(input.instanceId);
          for (const item of updates) {
            const externalId = item.key.id;
            const status = normalizeMessageStatus(item.update.status);
            if (!externalId || !status) continue;

            void managed?.callbacks?.onMessageUpdate?.({
              externalId,
              remoteJid: item.key.remoteJid ?? undefined,
              status,
            });
          }
        });
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  async disconnect(instanceId: string): Promise<void> {
    this.pendingConnections.delete(instanceId);
    const managed = this.activeInstances.get(instanceId);
    if (!managed) return;

    this.activeInstances.delete(instanceId);
    await managed.socket.end(undefined).catch(() => undefined);
  }

  async logout(instanceId: string): Promise<void> {
    this.pendingConnections.delete(instanceId);
    const managed = this.activeInstances.get(instanceId);
    if (!managed) return;

    this.activeInstances.delete(instanceId);
    await managed.socket.logout('RavoxZap logout').catch(() => undefined);
  }

  async clearSession(input: { instanceId: string; sessionBasePath: string }): Promise<void> {
    await this.logout(input.instanceId);
    await rm(getSessionPath(input.sessionBasePath, input.instanceId), {
      recursive: true,
      force: true,
    });
  }

  private getConnectedSocket(instanceId: string) {
    const managed = this.activeInstances.get(instanceId);
    if (!managed) {
      throw new Error('WhatsApp instance is not connected in this worker process');
    }

    return managed.socket;
  }

  private async resolveRecipientJid(socket: WASocket, to: string) {
    const remoteJid = normalizePhoneToJid(to);
    if (remoteJid.endsWith('@g.us')) return remoteJid;
    if (isLidJid(remoteJid)) {
      const phoneJid = await resolveLidToPhoneJid(socket, remoteJid);
      if (phoneJid) return phoneJid;

      throw new Error(`Não foi possível resolver o participante ${remoteJid} para um número do WhatsApp.`);
    }

    const phoneNumber = remoteJid.replace(/\D/g, '');
    const [recipient] = (await socket.onWhatsApp(phoneNumber)) ?? [];

    if (!recipient?.exists) {
      throw new Error(`Recipient ${phoneNumber} is not available on WhatsApp`);
    }

    return recipient.jid ?? remoteJid;
  }

  private async resolveGroupParticipantJids(socket: WASocket, participants: string[]) {
    const resolved = await Promise.all(
      participants.map(async participant => {
        const remoteJid = normalizePhoneToJid(participant);

        if (remoteJid.endsWith('@g.us')) {
          throw new Error('Participantes de grupo devem ser números do WhatsApp, não IDs de grupo.');
        }

        if (isLidJid(remoteJid)) {
          const phoneJid = await resolveLidToPhoneJid(socket, remoteJid);
          if (phoneJid) return phoneJid;

          throw new Error(`Não foi possível resolver o participante ${remoteJid} para um número do WhatsApp.`);
        }

        return this.resolveRecipientJid(socket, remoteJid);
      }),
    );

    return [...new Set(resolved)];
  }

  private async resolveCreatableGroupParticipantJids(socket: WASocket, participants: string[]) {
    const resolved = new Set<string>();
    const phonesNotAdded = new Set<string>();
    const selfPhone = phoneFromJid(socket.user?.id ?? '');

    for (const participant of participants) {
      const remoteJid = normalizePhoneToJid(participant);
      const requestedValue = isLidJid(remoteJid) ? remoteJid : phoneFromJid(remoteJid);

      if (!requestedValue || remoteJid.endsWith('@g.us') || isLidJid(remoteJid) || requestedValue === selfPhone) {
        if (requestedValue) phonesNotAdded.add(requestedValue);
        continue;
      }

      try {
        resolved.add(await this.resolveRecipientJid(socket, remoteJid));
      } catch {
        phonesNotAdded.add(requestedValue);
      }
    }

    return {
      participants: [...resolved],
      phonesNotAdded: [...phonesNotAdded],
    };
  }

  private getMissingCreatedGroupParticipants(metadata: WhatsAppGroupMetadata, requestedParticipants: string[]) {
    const joined = new Set(
      metadata.participants.flatMap(participant => [
        normalizePnJid(participant.jid),
        phoneFromJid(participant.jid),
        phoneFromJid(participant.name ?? ''),
      ]),
    );

    return requestedParticipants
      .map(participant => (isLidJid(participant) ? participant : phoneFromJid(participant)))
      .filter(participant => participant && !joined.has(participant));
  }

  private async sendGroupInvitesToPhones(socket: WASocket, phones: string[], invitationLink: string) {
    const text = `Convite para entrar no grupo: ${invitationLink}`;

    await Promise.all(
      phones
        .filter(phone => phone && !isLidJid(phone))
        .map(async phone => {
          try {
            const jid = await this.resolveRecipientJid(socket, phone);
            await socket.sendMessage(jid, { text });
          } catch {
            // Best effort: failure to send one private invite should not fail group creation.
          }
        }),
    );
  }

  private async getGroupPictureUrl(socket: WASocket, groupJid: string) {
    try {
      return await (socket as any).profilePictureUrl(normalizeGroupJid(groupJid), 'image');
    } catch {
      return undefined;
    }
  }

  private async loadGroupPictureSource(source: string) {
    const trimmed = source.trim();
    const dataUrlMatch = trimmed.match(/^data:image\/[^;,]+(?:;[^,]*)?;base64,(.+)$/s);

    if (dataUrlMatch) {
      const buffer = Buffer.from(dataUrlMatch[1] ?? '', 'base64');
      if (!buffer.length) throw new Error('A imagem do grupo está vazia.');
      return buffer;
    }

    if (/^https?:\/\//i.test(trimmed)) {
      return { url: trimmed };
    }

    const buffer = Buffer.from(trimmed, 'base64');
    if (!buffer.length) throw new Error('A imagem do grupo deve ser uma URL, data URL ou base64.');
    return buffer;
  }

  private async loadMediaSource(source: string) {
    const trimmed = source.trim();
    const dataUrlMatch = trimmed.match(/^data:[^;,]+(?:;[^,]*)?;base64,(.+)$/s);

    if (dataUrlMatch) {
      const buffer = Buffer.from(dataUrlMatch[1] ?? '', 'base64');
      if (!buffer.length) throw new Error('A mídia está vazia.');
      return buffer;
    }

    if (/^https?:\/\//i.test(trimmed)) {
      return { url: trimmed };
    }

    const buffer = Buffer.from(trimmed, 'base64');
    if (!buffer.length) throw new Error('A mídia deve ser uma URL, data URL ou base64.');
    return buffer;
  }

  private normalizeExistingGroupParticipantJids(participants: string[]) {
    return [
      ...new Set(
        participants.map(participant => normalizePhoneToJid(participant)).filter(jid => jid && !jid.endsWith('@g.us')),
      ),
    ];
  }

  private async resolveGroupParticipantUpdateAliases(socket: WASocket, participants: string[]) {
    const lidMapping = (socket as any).signalRepository?.lidMapping;
    const getLidForPhone = lidMapping?.getLIDForPN;
    const aliases = await Promise.all(
      participants.map(async participant => {
        const jid = normalizePhoneToJid(participant);

        if (isLidJid(jid)) {
          return (await resolveLidToPhoneJid(socket, jid)) ?? jid;
        }

        if (typeof getLidForPhone === 'function') {
          const lidJid = await getLidForPhone.call(lidMapping, jid).catch(() => null);
          if (typeof lidJid === 'string' && lidJid) return normalizePnJid(lidJid);
        }

        return jid;
      }),
    );

    return [...new Set(aliases.filter(jid => jid && !jid.endsWith('@g.us')))];
  }

  private async updateExistingGroupParticipants(
    socket: WASocket,
    groupJid: string,
    participants: string[],
    action: 'remove' | 'promote' | 'demote',
  ) {
    const primaryParticipants = this.normalizeExistingGroupParticipantJids(participants);

    if (primaryParticipants.length === 0) {
      throw new Error('Nenhum participante válido foi informado.');
    }

    const normalizedGroupJid = normalizeGroupJid(groupJid);

    try {
      return await (socket as any).groupParticipantsUpdate(normalizedGroupJid, primaryParticipants, action);
    } catch (error) {
      const aliasParticipants = await this.resolveGroupParticipantUpdateAliases(socket, primaryParticipants);
      const hasDifferentAlias = aliasParticipants.length > 0 && aliasParticipants.join('|') !== primaryParticipants.join('|');

      if (hasDifferentAlias) {
        try {
          return await (socket as any).groupParticipantsUpdate(normalizedGroupJid, aliasParticipants, action);
        } catch {
          throw error;
        }
      }

      throw error;
    }
  }

  private applyRequestedParticipantPhones(
    metadata: WhatsAppGroupMetadata,
    requestedParticipants: string[],
  ): WhatsAppGroupMetadata {
    const phones = [...requestedParticipants];

    return {
      ...metadata,
      participants: metadata.participants.map(participant => {
        if (!isLidJid(participant.jid) || participant.isSuperAdmin) return participant;

        const requestedPhone = phones.shift();
        return requestedPhone ? { ...participant, name: participant.name ?? phoneFromJid(requestedPhone) } : participant;
      }),
    };
  }

  async sendText(input: { instanceId: string; to: string; body: string }) {
    const socket = this.getConnectedSocket(input.instanceId);
    const sendJid = await this.resolveRecipientJid(socket, input.to);
    const result = await socket.sendMessage(sendJid, {
      text: input.body,
    });
    const status = normalizeMessageStatus(result?.status) ?? 'QUEUED';

    return {
      externalId: result?.key.id ?? undefined,
      remoteJid: sendJid,
      status,
    };
  }

  async sendMedia(input: {
    instanceId: string;
    to: string;
    type: 'IMAGE' | 'AUDIO' | 'DOCUMENT' | 'VIDEO';
    path: string;
    mimeType: string;
    fileName: string;
    caption?: string;
  }) {
    const socket = this.getConnectedSocket(input.instanceId);
    const sendJid = await this.resolveRecipientJid(socket, input.to);
    const media =
      input.type === 'AUDIO'
        ? {
            buffer: await transcodeAudioToWhatsAppVoice(input.path),
            mimeType: 'audio/ogg; codecs=opus',
          }
        : {
            buffer: await readFile(input.path),
            mimeType: input.mimeType,
          };
    const result = await socket.sendMessage(sendJid, {
      ...(input.type === 'IMAGE'
        ? { image: media.buffer, caption: input.caption }
        : input.type === 'VIDEO'
          ? { video: media.buffer, caption: input.caption, mimetype: media.mimeType }
          : input.type === 'AUDIO'
            ? { audio: media.buffer, mimetype: media.mimeType, ptt: true }
            : {
                document: media.buffer,
                mimetype: media.mimeType,
                fileName: input.fileName,
                caption: input.caption,
              }),
    });
    const status = normalizeMessageStatus(result?.status) ?? 'QUEUED';

    return {
      externalId: result?.key.id ?? undefined,
      remoteJid: sendJid,
      status,
    };
  }

  async sendLocation(input: {
    instanceId: string;
    to: string;
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  }) {
    const socket = this.getConnectedSocket(input.instanceId);
    const sendJid = await this.resolveRecipientJid(socket, input.to);
    const result = await socket.sendMessage(sendJid, {
      location: {
        degreesLatitude: input.latitude,
        degreesLongitude: input.longitude,
        name: input.name,
        address: input.address,
      },
    } as any);
    return serializeSendResult(sendJid, result);
  }

  async sendContact(input: { instanceId: string; to: string; contact: WhatsAppContactCard }) {
    const socket = this.getConnectedSocket(input.instanceId);
    const sendJid = await this.resolveRecipientJid(socket, input.to);
    const result = await socket.sendMessage(sendJid, {
      contacts: {
        displayName: input.contact.displayName,
        contacts: [{ displayName: input.contact.displayName, vcard: makeVcard(input.contact) }],
      },
    } as any);
    return serializeSendResult(sendJid, result);
  }

  async sendContacts(input: { instanceId: string; to: string; contacts: WhatsAppContactCard[] }) {
    const socket = this.getConnectedSocket(input.instanceId);
    const sendJid = await this.resolveRecipientJid(socket, input.to);
    const result = await socket.sendMessage(sendJid, {
      contacts: {
        displayName: `${input.contacts.length} contatos`,
        contacts: input.contacts.map(contact => ({
          displayName: contact.displayName,
          vcard: makeVcard(contact),
        })),
      },
    } as any);
    return serializeSendResult(sendJid, result);
  }

  async sendSticker(input: { instanceId: string; to: string; sticker: string }) {
    const socket = this.getConnectedSocket(input.instanceId);
    const sendJid = await this.resolveRecipientJid(socket, input.to);
    const result = await socket.sendMessage(sendJid, {
      sticker: await this.loadMediaSource(input.sticker),
    } as any);
    return serializeSendResult(sendJid, result);
  }

  async sendGif(input: { instanceId: string; to: string; gif: string; caption?: string }) {
    const socket = this.getConnectedSocket(input.instanceId);
    const sendJid = await this.resolveRecipientJid(socket, input.to);
    const result = await socket.sendMessage(sendJid, {
      video: await this.loadMediaSource(input.gif),
      gifPlayback: true,
      caption: input.caption,
    } as any);
    return serializeSendResult(sendJid, result);
  }

  async sendLink(input: { instanceId: string; to: string; url: string; text?: string }) {
    return this.sendText({
      instanceId: input.instanceId,
      to: input.to,
      body: input.text ? `${input.text}\n${input.url}` : input.url,
    });
  }

  async sendReaction(input: {
    instanceId: string;
    remoteJid: string;
    messageId: string;
    emoji?: string;
    fromMe?: boolean;
  }) {
    const socket = this.getConnectedSocket(input.instanceId);
    const remoteJid = await this.resolveRecipientJid(socket, input.remoteJid);
    const result = await socket.sendMessage(remoteJid, {
      react: {
        text: input.emoji ?? '',
        key: {
          remoteJid,
          id: input.messageId,
          fromMe: input.fromMe ?? false,
        },
      },
    } as any);
    return serializeSendResult(remoteJid, result);
  }

  async sendPoll(input: {
    instanceId: string;
    to: string;
    name: string;
    options: string[];
    selectableCount?: number;
  }) {
    const socket = this.getConnectedSocket(input.instanceId);
    const sendJid = await this.resolveRecipientJid(socket, input.to);
    const result = await socket.sendMessage(sendJid, {
      poll: {
        name: input.name,
        values: input.options,
        selectableCount: input.selectableCount ?? 1,
      },
    } as any);
    return serializeSendResult(sendJid, result);
  }

  async sendPollVote(): Promise<never> {
    throw new Error('Enviar voto de enquete ainda não é suportado com segurança pelo adapter atual.');
  }

  async replyMessage(input: {
    instanceId: string;
    to: string;
    text: string;
    quotedMessageId: string;
    quotedFromMe?: boolean;
  }) {
    const socket = this.getConnectedSocket(input.instanceId);
    const sendJid = await this.resolveRecipientJid(socket, input.to);
    const result = await socket.sendMessage(sendJid, {
      text: input.text,
    }, {
      quoted: {
        key: {
          remoteJid: sendJid,
          id: input.quotedMessageId,
          fromMe: input.quotedFromMe ?? false,
        },
        message: { conversation: input.text },
      } as any,
    });
    return serializeSendResult(sendJid, result);
  }

  async forwardMessage(input: { instanceId: string; to: string; message: Record<string, unknown> }) {
    const socket = this.getConnectedSocket(input.instanceId);
    const sendJid = await this.resolveRecipientJid(socket, input.to);
    const result = await socket.sendMessage(sendJid, {
      forward: input.message,
      force: true,
    } as any);
    return serializeSendResult(sendJid, result);
  }

  async deleteMessage(input: { instanceId: string; remoteJid: string; messageId: string; fromMe?: boolean }) {
    const socket = this.getConnectedSocket(input.instanceId);
    const remoteJid = await this.resolveRecipientJid(socket, input.remoteJid);
    const result = await socket.sendMessage(remoteJid, {
      delete: {
        remoteJid,
        id: input.messageId,
        fromMe: input.fromMe ?? true,
      },
    } as any);
    return serializeSendResult(remoteJid, result);
  }

  async readMessage(input: { instanceId: string; remoteJid: string; messageId: string; fromMe?: boolean }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const remoteJid = normalizePhoneToJid(input.remoteJid);
    await socket.readMessages([{ remoteJid, id: input.messageId, fromMe: input.fromMe ?? false }]);
    return { read: true };
  }

  async pinMessage(input: {
    instanceId: string;
    remoteJid: string;
    messageId: string;
    fromMe?: boolean;
    type?: 0 | 1;
    time?: 86400 | 604800 | 2592000;
  }) {
    const socket = this.getConnectedSocket(input.instanceId);
    const remoteJid = await this.resolveRecipientJid(socket, input.remoteJid);
    const result = await socket.sendMessage(remoteJid, {
      pin: {
        type: input.type ?? 1,
        time: input.time ?? 86400,
        key: {
          remoteJid,
          id: input.messageId,
          fromMe: input.fromMe ?? true,
        },
      },
    } as any);
    return serializeSendResult(remoteJid, result);
  }

  async sendPtv(input: { instanceId: string; to: string; video: string; caption?: string }) {
    const socket = this.getConnectedSocket(input.instanceId);
    const sendJid = await this.resolveRecipientJid(socket, input.to);
    const result = await socket.sendMessage(sendJid, {
      video: await this.loadMediaSource(input.video),
      ptv: true,
      caption: input.caption,
    } as any);
    return serializeSendResult(sendJid, result);
  }

  async checkWhatsApp(input: { instanceId: string; phone: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const phone = input.phone.replace(/\D/g, '');
    const [result] = (await socket.onWhatsApp(phone)) ?? [];
    return { phone, exists: Boolean(result?.exists), jid: result?.jid };
  }

  async checkWhatsAppBatch(input: { instanceId: string; phones: string[] }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const phones = input.phones.map(phone => phone.replace(/\D/g, '')).filter(Boolean);
    const results = (await socket.onWhatsApp(...phones)) ?? [];
    return results.map((result: { exists: boolean; jid?: string }, index: number) => ({
      phone: phones[index],
      exists: Boolean(result?.exists),
      jid: result?.jid,
    }));
  }

  async getContactMetadata(input: { instanceId: string; phone: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const jid = await this.resolveRecipientJid(socket, input.phone);
    const [status] = (await socket.fetchStatus(jid)) ?? [];
    return { jid, status };
  }

  async getContactProfilePicture(input: { instanceId: string; phone: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const jid = await this.resolveRecipientJid(socket, input.phone);
    const url = await socket.profilePictureUrl(jid, 'image').catch(() => undefined);
    return { jid, url };
  }

  async addPhoneContact(input: { instanceId: string; phone: string; name: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const jid = normalizePhoneToJid(input.phone);
    await socket.addOrEditContact(jid, { fullName: input.name, firstName: input.name } as any);
    return { jid, name: input.name };
  }

  async removePhoneContact(input: { instanceId: string; phone: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const jid = normalizePhoneToJid(input.phone);
    await socket.removeContact(jid);
    return { jid, removed: true };
  }

  async updateContactBlock(input: { instanceId: string; phone: string; blocked: boolean }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const jid = await this.resolveRecipientJid(socket, input.phone);
    await socket.updateBlockStatus(jid, input.blocked ? 'block' : 'unblock');
    return { jid, blocked: input.blocked };
  }

  async reportContact(): Promise<never> {
    throw new Error('Denunciar contato não é suportado com segurança pelo adapter atual.');
  }

  async getPrivacySettings(instanceId: string) {
    const socket = this.getConnectedSocket(instanceId) as any;
    return socket.fetchPrivacySettings(true);
  }

  async updatePrivacy(input: {
    instanceId: string;
    kind: 'lastSeen' | 'online' | 'profilePicture' | 'status' | 'readReceipts' | 'groupAdd' | 'defaultDisappearing';
    value: string | number;
  }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;

    if (input.kind === 'lastSeen') await socket.updateLastSeenPrivacy(input.value as WhatsAppPrivacyValue);
    else if (input.kind === 'online') await socket.updateOnlinePrivacy(input.value as WhatsAppOnlinePrivacyValue);
    else if (input.kind === 'profilePicture') await socket.updateProfilePicturePrivacy(input.value as WhatsAppPrivacyValue);
    else if (input.kind === 'status') await socket.updateStatusPrivacy(input.value as WhatsAppPrivacyValue);
    else if (input.kind === 'readReceipts') await socket.updateReadReceiptsPrivacy(input.value as WhatsAppReadReceiptsValue);
    else if (input.kind === 'groupAdd') await socket.updateGroupsAddPrivacy(input.value as WhatsAppGroupAddPrivacyValue);
    else await socket.updateDefaultDisappearingMode(Number(input.value));

    return { kind: input.kind, value: input.value };
  }

  async getBlocklist(instanceId: string) {
    const socket = this.getConnectedSocket(instanceId) as any;
    return { blocklist: (await socket.fetchBlocklist())?.filter(Boolean) ?? [] };
  }

  async getInstanceMe(instanceId: string) {
    const socket = this.getConnectedSocket(instanceId) as any;
    return {
      user: socket.user,
      privacy: await socket.fetchPrivacySettings(false).catch(() => undefined),
    };
  }

  async getInstanceDevice(instanceId: string) {
    const socket = this.getConnectedSocket(instanceId) as any;
    return {
      user: socket.user,
      type: socket.type,
      connected: true,
    };
  }

  async requestPairingCode(input: { instanceId: string; phone: string; code?: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const pairingCode = await socket.requestPairingCode(input.phone.replace(/\D/g, ''), input.code);
    return { pairingCode };
  }

  async updateProfileName(input: { instanceId: string; name: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    await socket.updateProfileName(input.name);
    return { name: input.name };
  }

  async updateProfileDescription(input: { instanceId: string; description: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    await socket.updateProfileStatus(input.description);
    return { description: input.description };
  }

  async updateOwnProfilePicture(input: { instanceId: string; image: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const jid = socket.user?.id;
    if (!jid) throw new Error('Não foi possível identificar o JID da instância.');
    await socket.updateProfilePicture(jid, await this.loadMediaSource(input.image));
    return { updated: true };
  }

  async removeOwnProfilePicture(instanceId: string) {
    const socket = this.getConnectedSocket(instanceId) as any;
    const jid = socket.user?.id;
    if (!jid) throw new Error('Não foi possível identificar o JID da instância.');
    await socket.removeProfilePicture(jid);
    return { removed: true };
  }

  async sendStatusText(input: { instanceId: string; text: string; recipients?: string[]; backgroundColor?: string; font?: number }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const result = await socket.sendMessage('status@broadcast', {
      text: input.text,
      backgroundColor: input.backgroundColor,
      font: input.font,
    }, {
      statusJidList: normalizeStatusJidList(input.recipients),
    });
    return serializeSendResult('status@broadcast', result);
  }

  async sendStatusMedia(input: { instanceId: string; type: 'image' | 'video'; media: string; caption?: string; recipients?: string[] }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const result = await socket.sendMessage('status@broadcast', {
      [input.type]: await this.loadMediaSource(input.media),
      caption: input.caption,
    }, {
      statusJidList: normalizeStatusJidList(input.recipients),
    });
    return serializeSendResult('status@broadcast', result);
  }

  async replyStatusText(input: { instanceId: string; statusJid: string; messageId: string; text: string }) {
    const socket = this.getConnectedSocket(input.instanceId);
    const result = await socket.sendMessage(input.statusJid, { text: input.text }, {
      quoted: {
        key: { remoteJid: 'status@broadcast', id: input.messageId, participant: input.statusJid },
        message: { conversation: input.text },
      } as any,
    });
    return serializeSendResult(input.statusJid, result);
  }

  async replyStatusMedia(input: { instanceId: string; statusJid: string; messageId: string; type: 'sticker' | 'gif'; media: string }) {
    const socket = this.getConnectedSocket(input.instanceId);
    const content = input.type === 'sticker'
      ? { sticker: await this.loadMediaSource(input.media) }
      : { video: await this.loadMediaSource(input.media), gifPlayback: true };
    const result = await socket.sendMessage(input.statusJid, content as any, {
      quoted: {
        key: { remoteJid: 'status@broadcast', id: input.messageId, participant: input.statusJid },
        message: { conversation: '' },
      } as any,
    });
    return serializeSendResult(input.statusJid, result);
  }

  async syncGroups(instanceId: string): Promise<WhatsAppGroupMetadata[]> {
    const socket = this.getConnectedSocket(instanceId) as any;
    const groups = await socket.groupFetchAllParticipating();
    return Promise.all(Object.values(groups ?? {}).map(group => normalizeGroupMetadataWithAliases(socket, group)));
  }

  async createGroup(input: {
    instanceId: string;
    name: string;
    participants: string[];
    autoInvite?: boolean;
  }): Promise<WhatsAppGroupCreateResult> {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const requestedParticipants = input.participants.map(participant => normalizePhoneToJid(participant));
    const resolved = await this.resolveCreatableGroupParticipantJids(socket, input.participants);
    const participants = resolved.participants;

    if (participants.length === 0) {
      throw new Error('Informe pelo menos um telefone válido para criar o grupo. IDs @lid não são aceitos na criação.');
    }

    const result = await socket.groupCreate(input.name, participants);
    let group = this.applyRequestedParticipantPhones(await normalizeGroupMetadataWithAliases(socket, result), requestedParticipants);
    const phonesNotAdded = [
      ...new Set([
        ...resolved.phonesNotAdded,
        ...this.getMissingCreatedGroupParticipants(group, participants),
      ]),
    ];
    let invitationLink: string | undefined;

    try {
      const code = await socket.groupInviteCode(normalizeGroupJid(group.remoteJid));
      invitationLink = code ? `https://chat.whatsapp.com/${code}` : undefined;
      group = {
        ...group,
        inviteCode: extractGroupInviteCode(invitationLink),
      };
    } catch {
      invitationLink = undefined;
    }

    if (input.autoInvite && invitationLink && phonesNotAdded.length > 0) {
      await this.sendGroupInvitesToPhones(socket, phonesNotAdded, invitationLink);
    }

    return {
      group,
      phone: groupPhoneFromJid(group.remoteJid),
      phonesNotAdded,
      invitationLink,
      autoInvite: Boolean(input.autoInvite),
    };
  }

  async getGroupMetadata(input: { instanceId: string; groupJid: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const metadata = await socket.groupMetadata(normalizeGroupJid(input.groupJid));
    const group = await normalizeGroupMetadataWithAliases(socket, metadata);
    return {
      ...group,
      pictureUrl: await this.getGroupPictureUrl(socket, group.remoteJid),
    };
  }

  async updateGroupName(input: { instanceId: string; groupJid: string; name: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    await socket.groupUpdateSubject(normalizeGroupJid(input.groupJid), input.name);
    return this.getGroupMetadata(input);
  }

  async updateGroupDescription(input: { instanceId: string; groupJid: string; description: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    await socket.groupUpdateDescription(normalizeGroupJid(input.groupJid), input.description);
    return this.getGroupMetadata(input);
  }

  async updateGroupPhoto(input: { instanceId: string; groupJid: string; image: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const groupJid = normalizeGroupJid(input.groupJid);
    const content = await this.loadGroupPictureSource(input.image);
    await socket.updateProfilePicture(groupJid, content);
    return this.getGroupMetadata({ instanceId: input.instanceId, groupJid });
  }

  async addGroupParticipants(input: {
    instanceId: string;
    groupJid: string;
    participants: string[];
    autoInvite?: boolean;
  }): Promise<WhatsAppGroupParticipantsAddResult> {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const participants = await this.resolveGroupParticipantJids(socket, input.participants);
    const result = await socket.groupParticipantsUpdate(normalizeGroupJid(input.groupJid), participants, 'add');
    const failedJids = result
      .filter((item: { status?: string | number }) => item.status && String(item.status) !== '200')
      .map((item: { jid?: string }) => item.jid)
      .filter((jid: string | undefined): jid is string => Boolean(jid));
    const phonesNotAdded: string[] = [
      ...new Set<string>(
        failedJids.length > 0
          ? failedJids.map(phoneFromJid).filter((phone: string): phone is string => Boolean(phone))
          : [],
      ),
    ];
    let invitationLink: string | undefined;

    if (input.autoInvite && phonesNotAdded.length > 0) {
      const invite = await this.getGroupInviteLink({ instanceId: input.instanceId, groupJid: input.groupJid });
      invitationLink = invite.url;
      if (invitationLink) await this.sendGroupInvitesToPhones(socket, phonesNotAdded, invitationLink);
    }

    return {
      result,
      phonesNotAdded,
      invitationLink,
      autoInvite: Boolean(input.autoInvite),
    };
  }

  async removeGroupParticipants(input: { instanceId: string; groupJid: string; participants: string[] }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    return this.updateExistingGroupParticipants(socket, input.groupJid, input.participants, 'remove');
  }

  async promoteGroupAdmins(input: { instanceId: string; groupJid: string; participants: string[] }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    return this.updateExistingGroupParticipants(socket, input.groupJid, input.participants, 'promote');
  }

  async demoteGroupAdmins(input: { instanceId: string; groupJid: string; participants: string[] }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    return this.updateExistingGroupParticipants(socket, input.groupJid, input.participants, 'demote');
  }

  async mentionGroupParticipants(input: { instanceId: string; groupJid: string; text: string; participants: string[] }) {
    const socket = this.getConnectedSocket(input.instanceId);
    const groupJid = normalizeGroupJid(input.groupJid);
    const mentions = await this.resolveGroupParticipantJids(socket, input.participants);
    const result = await socket.sendMessage(groupJid, {
      text: input.text,
      mentions,
    });

    return {
      externalId: result?.key.id ?? undefined,
      remoteJid: groupJid,
      status: normalizeMessageStatus(result?.status) ?? 'QUEUED',
    };
  }

  async mentionAllGroupParticipants(input: { instanceId: string; groupJid: string; text: string }) {
    const socket = this.getConnectedSocket(input.instanceId);
    const groupJid = normalizeGroupJid(input.groupJid);
    const result = await socket.sendMessage(groupJid, {
      text: input.text,
      mentionAll: true,
    });

    return {
      externalId: result?.key.id ?? undefined,
      remoteJid: groupJid,
      status: normalizeMessageStatus(result?.status) ?? 'QUEUED',
    };
  }

  async mentionGroups(input: { instanceId: string; groupJid: string; text: string; groups: string[] }) {
    const socket = this.getConnectedSocket(input.instanceId);
    const groupJid = normalizeGroupJid(input.groupJid);
    const groupMentions = input.groups.map(group => ({
      groupJid: normalizeGroupJid(group),
      groupSubject: normalizeGroupJid(group),
    }));

    const result = await socket.sendMessage(groupJid, {
      text: input.text,
      contextInfo: {
        groupMentions,
      },
    });

    return {
      externalId: result?.key.id ?? undefined,
      remoteJid: groupJid,
      status: normalizeMessageStatus(result?.status) ?? 'QUEUED',
    };
  }

  async listGroupJoinRequests(input: { instanceId: string; groupJid: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    return socket.groupRequestParticipantsList(normalizeGroupJid(input.groupJid));
  }

  async updateGroupJoinRequests(input: {
    instanceId: string;
    groupJid: string;
    participants: string[];
    action: 'approve' | 'reject';
  }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const participants = await this.resolveGroupParticipantJids(socket, input.participants);
    return socket.groupRequestParticipantsUpdate(normalizeGroupJid(input.groupJid), participants, input.action);
  }

  async updateGroupSettings(input: {
    instanceId: string;
    groupJid: string;
    settings: WhatsAppGroupSettingsInput;
  }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const groupJid = normalizeGroupJid(input.groupJid);

    if (input.settings.messages) {
      await socket.groupSettingUpdate(groupJid, input.settings.messages === 'admins' ? 'announcement' : 'not_announcement');
    }

    if (input.settings.info) {
      await socket.groupSettingUpdate(groupJid, input.settings.info === 'admins' ? 'locked' : 'unlocked');
    }

    if (input.settings.addMembers) {
      await socket.groupMemberAddMode(groupJid, input.settings.addMembers === 'admins' ? 'admin_add' : 'all_member_add');
    }

    if (typeof input.settings.joinApproval === 'boolean') {
      await socket.groupJoinApprovalMode(groupJid, input.settings.joinApproval ? 'on' : 'off');
    }

    if (typeof input.settings.ephemeralSeconds === 'number') {
      await socket.groupToggleEphemeral(groupJid, input.settings.ephemeralSeconds);
    }

    return this.getGroupMetadata({ instanceId: input.instanceId, groupJid });
  }

  async leaveGroup(input: { instanceId: string; groupJid: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    await socket.groupLeave(normalizeGroupJid(input.groupJid));
    return { left: true };
  }

  async getGroupInviteLink(input: { instanceId: string; groupJid: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const code = await socket.groupInviteCode(normalizeGroupJid(input.groupJid));
    return {
      code,
      url: code ? `https://chat.whatsapp.com/${code}` : undefined,
    };
  }

  async revokeGroupInviteLink(input: { instanceId: string; groupJid: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const code = await socket.groupRevokeInvite(normalizeGroupJid(input.groupJid));
    return {
      code,
      url: code ? `https://chat.whatsapp.com/${code}` : undefined,
    };
  }

  async acceptGroupInvite(input: { instanceId: string; code: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const code = extractGroupInviteCode(input.code);
    if (!code) throw new Error('Código de convite inválido.');
    const groupJid = await socket.groupAcceptInvite(code);
    return { groupJid };
  }

  async getGroupInviteMetadata(input: { instanceId: string; code: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const code = extractGroupInviteCode(input.code);
    if (!code) throw new Error('Código de convite inválido.');
    const metadata = await socket.groupGetInviteInfo(code);
    return normalizeGroupMetadataWithAliases(socket, metadata);
  }

  async syncCommunities(instanceId: string) {
    const socket = this.getConnectedSocket(instanceId) as any;
    const communities = await socket.communityFetchAllParticipating();
    return Promise.all(Object.values(communities ?? {}).map(community => normalizeGroupMetadataWithAliases(socket, community)));
  }

  async createCommunity(input: { instanceId: string; name: string; description?: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const metadata = await socket.communityCreate(input.name, input.description ?? '');
    return metadata ? normalizeGroupMetadataWithAliases(socket, metadata) : null;
  }

  async getCommunityMetadata(input: { instanceId: string; communityJid: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    return normalizeGroupMetadataWithAliases(socket, await socket.communityMetadata(normalizeGroupJid(input.communityJid)));
  }

  async updateCommunityName(input: { instanceId: string; communityJid: string; name: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    await socket.communityUpdateSubject(normalizeGroupJid(input.communityJid), input.name);
    return this.getCommunityMetadata(input);
  }

  async updateCommunityDescription(input: { instanceId: string; communityJid: string; description: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    await socket.communityUpdateDescription(normalizeGroupJid(input.communityJid), input.description);
    return this.getCommunityMetadata(input);
  }

  async updateCommunitySettings(input: { instanceId: string; communityJid: string; settings: WhatsAppCommunitySettingsInput }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const communityJid = normalizeGroupJid(input.communityJid);

    if (input.settings.messages) {
      await socket.communitySettingUpdate(communityJid, input.settings.messages === 'admins' ? 'announcement' : 'not_announcement');
    }
    if (input.settings.info) {
      await socket.communitySettingUpdate(communityJid, input.settings.info === 'admins' ? 'locked' : 'unlocked');
    }
    if (input.settings.addMembers) {
      await socket.communityMemberAddMode(communityJid, input.settings.addMembers === 'admins' ? 'admin_add' : 'all_member_add');
    }
    if (typeof input.settings.joinApproval === 'boolean') {
      await socket.communityJoinApprovalMode(communityJid, input.settings.joinApproval ? 'on' : 'off');
    }
    if (typeof input.settings.ephemeralSeconds === 'number') {
      await socket.communityToggleEphemeral(communityJid, input.settings.ephemeralSeconds);
    }

    return this.getCommunityMetadata({ instanceId: input.instanceId, communityJid });
  }

  async updateCommunityParticipants(input: {
    instanceId: string;
    communityJid: string;
    participants: string[];
    action: 'add' | 'remove' | 'promote' | 'demote';
  }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const participants = await this.resolveGroupParticipantJids(socket, input.participants);
    return socket.communityParticipantsUpdate(normalizeGroupJid(input.communityJid), participants, input.action);
  }

  async linkCommunityGroups(input: { instanceId: string; communityJid: string; groupJids: string[]; linked: boolean }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const communityJid = normalizeGroupJid(input.communityJid);
    const results = [];

    for (const groupJid of input.groupJids) {
      const normalizedGroupJid = normalizeGroupJid(groupJid);
      if (input.linked) {
        await socket.communityLinkGroup(normalizedGroupJid, communityJid);
      } else {
        await socket.communityUnlinkGroup(normalizedGroupJid, communityJid);
      }
      results.push({ groupJid: normalizedGroupJid, linked: input.linked });
    }

    return { communityJid, results };
  }

  async getCommunityInviteLink(input: { instanceId: string; communityJid: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const code = await socket.communityInviteCode(normalizeGroupJid(input.communityJid));
    return { code, url: code ? `https://chat.whatsapp.com/${code}` : undefined };
  }

  async revokeCommunityInviteLink(input: { instanceId: string; communityJid: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const code = await socket.communityRevokeInvite(normalizeGroupJid(input.communityJid));
    return { code, url: code ? `https://chat.whatsapp.com/${code}` : undefined };
  }

  async acceptCommunityInvite(input: { instanceId: string; code: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const code = extractGroupInviteCode(input.code);
    if (!code) throw new Error('Código de convite inválido.');
    const communityJid = await socket.communityAcceptInvite(code);
    return { communityJid };
  }

  async createNewsletter(input: { instanceId: string; name: string; description?: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    return socket.newsletterCreate(input.name, input.description);
  }

  async listNewsletters(input: { instanceId: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const owned = await socket.newsletterMetadata('invite', '').catch(() => null);
    return { newsletters: owned ? [owned] : [] };
  }

  async searchNewsletters(): Promise<never> {
    throw new Error('Busca pública de canais não é suportada com segurança pelo adapter atual.');
  }

  async getNewsletterMetadata(input: { instanceId: string; newsletterId: string; type?: 'invite' | 'jid' }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    return socket.newsletterMetadata(input.type ?? 'jid', input.newsletterId);
  }

  async updateNewsletter(input: {
    instanceId: string;
    newsletterId: string;
    action: 'follow' | 'unfollow' | 'mute' | 'unmute' | 'delete';
  }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const jid = normalizeNewsletterJid(input.newsletterId);
    if (input.action === 'follow') return socket.newsletterFollow(jid);
    if (input.action === 'unfollow') return socket.newsletterUnfollow(jid);
    if (input.action === 'mute') return socket.newsletterMute(jid);
    if (input.action === 'unmute') return socket.newsletterUnmute(jid);
    return socket.newsletterDelete(jid);
  }

  async updateNewsletterName(input: { instanceId: string; newsletterId: string; name: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    return socket.newsletterUpdateName(normalizeNewsletterJid(input.newsletterId), input.name);
  }

  async updateNewsletterDescription(input: { instanceId: string; newsletterId: string; description: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    return socket.newsletterUpdateDescription(normalizeNewsletterJid(input.newsletterId), input.description);
  }

  async updateNewsletterPicture(input: { instanceId: string; newsletterId: string; image: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    return socket.newsletterUpdatePicture(normalizeNewsletterJid(input.newsletterId), await this.loadMediaSource(input.image));
  }

  async acceptNewsletterAdminInvite(): Promise<never> {
    throw new Error('Aceitar convite de admin de canal exige payload de mensagem de convite e ainda não está exposto com segurança.');
  }

  async revokeNewsletterAdminInvite(input: { instanceId: string; newsletterId: string; invitedJid: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    return socket.newsletterRevokeAdminInvite?.(normalizeNewsletterJid(input.newsletterId), normalizePhoneToJid(input.invitedJid));
  }

  async removeNewsletterAdmin(input: { instanceId: string; newsletterId: string; userJid: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    return socket.newsletterDemote(normalizeNewsletterJid(input.newsletterId), normalizePhoneToJid(input.userJid));
  }

  async transferNewsletterOwnership(input: { instanceId: string; newsletterId: string; userJid: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    return socket.newsletterChangeOwner(normalizeNewsletterJid(input.newsletterId), normalizePhoneToJid(input.userJid));
  }

  async reactNewsletterMessage(input: { instanceId: string; newsletterId: string; serverId: string; reaction?: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    await socket.newsletterReactMessage(normalizeNewsletterJid(input.newsletterId), input.serverId, input.reaction);
    return { reacted: Boolean(input.reaction) };
  }

  async fetchNewsletterMessages(input: { instanceId: string; newsletterId: string; count?: number; since?: number; after?: number }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    return socket.newsletterFetchMessages(normalizeNewsletterJid(input.newsletterId), input.count ?? 20, input.since ?? 0, input.after ?? 0);
  }

  async getBusinessProfile(input: { instanceId: string; jid?: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const jid = input.jid ? normalizePhoneToJid(input.jid) : socket.user?.id;
    return socket.getBusinessProfile(jid);
  }

  async updateBusinessProfile(input: { instanceId: string; updates: Record<string, unknown> }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    return socket.updateBussinesProfile(input.updates);
  }

  async listBusinessProducts(input: { instanceId: string; jid?: string; limit?: number; cursor?: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const jid = input.jid ? normalizePhoneToJid(input.jid) : socket.user?.id;
    return socket.getCatalog({ jid, limit: input.limit ?? 10, cursor: input.cursor });
  }

  async getBusinessProduct(input: { instanceId: string; productId: string; jid?: string }) {
    const catalog = await this.listBusinessProducts({ instanceId: input.instanceId, jid: input.jid, limit: 100 });
    return catalog.products?.find((product: { id?: string }) => product.id === input.productId) ?? null;
  }

  async createBusinessProduct(input: { instanceId: string; product: Record<string, unknown> }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    return socket.productCreate(input.product);
  }

  async updateBusinessProduct(input: { instanceId: string; productId: string; product: Record<string, unknown> }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    return socket.productUpdate(input.productId, input.product);
  }

  async deleteBusinessProduct(input: { instanceId: string; productIds: string[] }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    return socket.productDelete(input.productIds);
  }

  async listBusinessCollections(input: { instanceId: string; jid?: string; limit?: number }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const jid = input.jid ? normalizePhoneToJid(input.jid) : undefined;
    return socket.getCollections(jid, input.limit ?? 10);
  }

  async updateBusinessTag(input: { instanceId: string; tagId?: string; name: string; color?: number; deleted?: boolean }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    await socket.addLabel(input.tagId ?? '', { name: input.name, color: input.color, deleted: input.deleted } as any);
    return { tagId: input.tagId, name: input.name, color: input.color, deleted: Boolean(input.deleted) };
  }

  async updateBusinessChatTag(input: { instanceId: string; remoteJid: string; tagId: string; linked: boolean }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const jid = await this.resolveRecipientJid(socket, input.remoteJid);
    if (input.linked) await socket.addChatLabel(jid, input.tagId);
    else await socket.removeChatLabel(jid, input.tagId);
    return { jid, tagId: input.tagId, linked: input.linked };
  }

  async readChat(input: { instanceId: string; keys: Array<{ remoteJid: string; id: string; fromMe: boolean }> }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    if (input.keys.length > 0) {
      await socket.readMessages(input.keys);
    }
    return { read: true };
  }

  async archiveChat(input: { instanceId: string; remoteJid: string; archived: boolean }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    await socket.chatModify({ archive: input.archived }, normalizePhoneToJid(input.remoteJid));
    return { archived: input.archived };
  }

  async pinChat(input: { instanceId: string; remoteJid: string; pinned: boolean }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    await socket.chatModify({ pin: input.pinned }, normalizePhoneToJid(input.remoteJid));
    return { pinned: input.pinned };
  }

  async muteChat(input: { instanceId: string; remoteJid: string; mutedUntil?: string | null }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    const mute = input.mutedUntil ? Math.floor(new Date(input.mutedUntil).getTime() / 1000) : null;
    await socket.chatModify({ mute }, normalizePhoneToJid(input.remoteJid));
    return { mutedUntil: input.mutedUntil ?? null };
  }

  async clearChat(input: { instanceId: string; remoteJid: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    await socket.chatModify({ clear: true }, normalizePhoneToJid(input.remoteJid));
    return { cleared: true };
  }

  async deleteChat(input: { instanceId: string; remoteJid: string }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    await socket.chatModify({ delete: true }, normalizePhoneToJid(input.remoteJid));
    return { deleted: true };
  }

  async setChatEphemeral(input: { instanceId: string; remoteJid: string; expirationSeconds: number }) {
    const socket = this.getConnectedSocket(input.instanceId) as any;
    await socket.chatModify({ disappearingMessagesInChat: input.expirationSeconds }, normalizePhoneToJid(input.remoteJid));
    return { expirationSeconds: input.expirationSeconds };
  }
}
