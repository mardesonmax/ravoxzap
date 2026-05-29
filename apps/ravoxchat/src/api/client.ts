import type { Chat, Group, Message, QueueItem, RavoxChatConfig, WhatsAppOperation } from '../types';
import { cleanBaseUrl, fileToDataUrl } from '../lib/utils';

export type OperationStart = {
  operationId: string;
  status: string;
};

export async function ravoxApi<T>(config: RavoxChatConfig, path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  headers.set('authorization', `Bearer ${config.apiKey}`);

  const response = await fetch(`${cleanBaseUrl(config.apiBaseUrl)}${path}`, { ...options, headers });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Falha na requisicao.' }));
    throw new Error(error.message ?? 'Falha na requisicao.');
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function sleep(milliseconds: number) {
  return new Promise(resolve => globalThis.setTimeout(resolve, milliseconds));
}

export async function waitForOperation(config: RavoxChatConfig, operationId: string, attempts = 30) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const operation = await publicClient.operation(config, operationId);
    if (operation.status === 'SUCCESS') return operation;
    if (operation.status === 'FAILED') throw new Error(operation.error ?? 'O WhatsApp recusou a operacao.');
    await sleep(1000);
  }
  throw new Error('A operacao ainda esta em processamento.');
}

function jsonRequest(method: string, body?: unknown): RequestInit {
  return { method, body: body === undefined ? undefined : JSON.stringify(body) };
}

export const publicClient = {
  raw: <T>(config: RavoxChatConfig, path: string, options?: RequestInit) => ravoxApi<T>(config, path, options),
  operation: (config: RavoxChatConfig, operationId: string) =>
    ravoxApi<WhatsAppOperation>(config, `/v1/instances/${config.instanceId}/operations/${operationId}`),
  status: (config: RavoxChatConfig) =>
    ravoxApi<{ instanceId: string; status: string; phoneNumber: string | null; profileName: string | null }>(
      config,
      `/v1/instances/${config.instanceId}/status`,
    ),
  chats: (config: RavoxChatConfig) => ravoxApi<Chat[]>(config, `/v1/instances/${config.instanceId}/chats`),
  messages: (config: RavoxChatConfig, chatId: string) =>
    ravoxApi<Message[]>(config, `/v1/instances/${config.instanceId}/chats/${chatId}/messages`),
  groups: (config: RavoxChatConfig) => ravoxApi<Group[]>(config, `/v1/instances/${config.instanceId}/groups`),
  group: (config: RavoxChatConfig, groupId: string) =>
    ravoxApi<Group>(config, `/v1/instances/${config.instanceId}/groups/${encodeURIComponent(groupId)}`),
  queue: (config: RavoxChatConfig) => ravoxApi<QueueItem[]>(config, `/v1/instances/${config.instanceId}/queue`),
  queueSettings: (config: RavoxChatConfig) => ravoxApi<Record<string, unknown>>(config, `/v1/instances/${config.instanceId}/queue/settings`),
  queueRemove: (config: RavoxChatConfig, queueItemId: string) =>
    ravoxApi<Record<string, unknown>>(config, `/v1/instances/${config.instanceId}/queue/${queueItemId}`, jsonRequest('DELETE')),
  queueClear: (config: RavoxChatConfig) =>
    ravoxApi<Record<string, unknown>>(config, `/v1/instances/${config.instanceId}/queue`, jsonRequest('DELETE')),
  startOperation: (config: RavoxChatConfig, method: string, path: string, body?: unknown) =>
    ravoxApi<OperationStart>(config, path, jsonRequest(method, body)),
  sendText: (config: RavoxChatConfig, to: string, body: string) =>
    ravoxApi<Message>(config, `/v1/instances/${config.instanceId}/send-text`, jsonRequest('POST', { to, body })),
  sendMedia: async (config: RavoxChatConfig, to: string, file: File, caption?: string) => {
    const dataUrl = await fileToDataUrl(file);
    const endpoint = file.type.startsWith('image/')
      ? 'send-image'
      : file.type.startsWith('audio/')
        ? 'send-audio'
        : file.type.startsWith('video/')
          ? 'send-video'
          : 'send-document';
    const key = endpoint.replace('send-', '');
    const payload: Record<string, string> = { to, [key]: dataUrl };
    if (caption?.trim()) payload.caption = caption.trim();
    if (endpoint === 'send-document') payload.fileName = file.name;
    return ravoxApi<Message>(config, `/v1/instances/${config.instanceId}/${endpoint}`, jsonRequest('POST', payload));
  },
};
