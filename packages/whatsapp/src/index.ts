import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  type WASocket,
} from '@whiskeysockets/baileys';
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

type ManagedSocket = {
  socket: WASocket;
  callbacks?: WhatsAppConnectionCallbacks;
};

const socketLogger = Pino({ level: 'silent' });

export function normalizePhoneToJid(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (value.endsWith('@s.whatsapp.net') || value.endsWith('@g.us')) return value;
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
    if (!jid.endsWith('@lid') && !jid.endsWith('@hosted.lid')) continue;

    const pn = await socket.signalRepository.lidMapping.getPNForLID(jid).catch(() => null);
    if (pn) candidates.add(normalizePnJid(pn));
  }

  const aliases = [...candidates];
  const remoteJid = aliases.find(jid => jid.endsWith('@s.whatsapp.net')) ?? normalizePnJid(fallbackJid);

  return {
    remoteJid,
    aliases: aliases.filter(jid => jid !== remoteJid),
  };
}

async function normalizeIncomingMessage(socket: WASocket, rawMessage: WASocket['ev'] extends never ? never : any): Promise<NormalizedIncomingMessage | null> {
  const message = rawMessage.message;
  const remoteJid = rawMessage.key?.remoteJid;

  if (!message || !remoteJid) return null;

  const text =
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.imageMessage?.caption ??
    message.videoMessage?.caption;

  let type: MessageType = 'UNKNOWN';
  if (message.conversation || message.extendedTextMessage) type = 'TEXT';
  else if (message.imageMessage) type = 'IMAGE';
  else if (message.audioMessage) type = 'AUDIO';
  else if (message.documentMessage) type = 'DOCUMENT';
  else if (message.videoMessage) type = 'VIDEO';

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
  if (type !== 'IMAGE') return undefined;

  const mimeType = rawMessage.message?.imageMessage?.mimetype ?? 'image/jpeg';
  const extension = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const bytes = await downloadMediaMessage(
    rawMessage,
    'buffer',
    {},
    {
      logger: socketLogger,
      reuploadRequest: message => socket.updateMediaMessage(message),
    },
  );

  if (!bytes || !Buffer.isBuffer(bytes)) return undefined;

  return {
    bytes,
    mimeType,
    extension,
  };
}

function normalizeMessageStatus(status: number | null | undefined): MessageStatus | null {
  if (status === 2) return 'SENT';
  if (status === 3) return 'DELIVERED';
  if (status === 4 || status === 5) return 'READ';
  if (status === 0) return 'FAILED';
  return null;
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

  async sendText(input: { instanceId: string; to: string; body: string }) {
    const managed = this.activeInstances.get(input.instanceId);
    if (!managed) {
      throw new Error('WhatsApp instance is not connected in this worker process');
    }

    const remoteJid = normalizePhoneToJid(input.to);
    const phoneNumber = remoteJid.replace(/\D/g, '');
    const [recipient] = (await managed.socket.onWhatsApp(phoneNumber)) ?? [];

    if (!recipient?.exists) {
      throw new Error(`Recipient ${phoneNumber} is not available on WhatsApp`);
    }

    const sendJid = recipient.jid ?? remoteJid;
    const result = await managed.socket.sendMessage(sendJid, {
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
    const managed = this.activeInstances.get(input.instanceId);
    if (!managed) {
      throw new Error('WhatsApp instance is not connected in this worker process');
    }

    const remoteJid = normalizePhoneToJid(input.to);
    const phoneNumber = remoteJid.replace(/\D/g, '');
    const [recipient] = (await managed.socket.onWhatsApp(phoneNumber)) ?? [];

    if (!recipient?.exists) {
      throw new Error(`Recipient ${phoneNumber} is not available on WhatsApp`);
    }

    const sendJid = recipient.jid ?? remoteJid;
    const buffer = await readFile(input.path);
    const result = await managed.socket.sendMessage(sendJid, {
      ...(input.type === 'IMAGE'
        ? { image: buffer, caption: input.caption }
        : input.type === 'VIDEO'
          ? { video: buffer, caption: input.caption, mimetype: input.mimeType }
          : input.type === 'AUDIO'
            ? { audio: buffer, mimetype: input.mimeType, ptt: true }
            : {
                document: buffer,
                mimetype: input.mimeType,
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
}
