const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3334';
const TOKEN_KEY = 'ravoxzap.token';

export type InstanceStatus =
  | 'CREATED'
  | 'WAITING_QR'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'RECONNECTING'
  | 'ERROR'
  | 'BANNED'
  | 'LOGGED_OUT';

export type Organization = {
  id: string;
  name: string;
  slug: string;
};

export type WhatsAppInstance = {
  id: string;
  organizationId: string;
  name: string;
  status: InstanceStatus;
  phoneNumber: string | null;
  profileName: string | null;
  qrCode?: string | null;
  qrUpdatedAt?: string | null;
};

export type ApiKey = {
  id: string;
  organizationId: string;
  name: string;
  prefix: string;
  lastFour: string;
  status: string;
  token?: string;
};

export type WebhookEndpoint = {
  id: string;
  organizationId: string;
  instanceId?: string | null;
  url: string;
  active: boolean;
  events: string[];
  instance?: {
    id: string;
    name: string;
    phoneNumber: string | null;
  } | null;
};

export type Chat = {
  id: string;
  instanceId: string;
  remoteJid: string;
  name: string | null;
  updatedAt?: string;
  messages?: Array<{
    id: string;
    body: string | null;
    type?: string;
    fromMe: boolean;
    status: string;
    createdAt: string;
  }>;
};

export type Contact = {
  id: string;
  organizationId: string;
  name: string;
  ddi: string;
  ddd: string;
  number: string;
  phoneE164: string;
  remoteJid: string;
};

export type Message = {
  id: string;
  chatId: string | null;
  remoteJid: string;
  fromMe: boolean;
  type?: string;
  body: string | null;
  mediaUrl?: string | null;
  status: string;
  createdAt: string;
};

export type DashboardSummary = {
  generatedAt: string;
  counts: {
    instances: number;
    connected: number;
    disconnected: number;
    contacts: number;
    apiKeys: number;
    webhooks: number;
    sent: number;
    received: number;
  };
  byType: Record<'TEXT' | 'IMAGE' | 'AUDIO' | 'DOCUMENT' | 'VIDEO' | 'UNKNOWN', number>;
  timeline: Array<{
    date: string;
    sent: number;
    received: number;
  }>;
  instances: Array<{
    id: string;
    name: string;
    status: InstanceStatus;
    phoneNumber: string | null;
    updatedAt: string;
  }>;
  recentMessages: Array<{
    id: string;
    body: string | null;
    fromMe: boolean;
    type: string;
    status: string;
    createdAt: string;
    instanceName: string;
  }>;
};

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);

  if (options.body && !(options.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message ?? 'Request failed');
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function absoluteApiUrl(path: string) {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_BASE_URL}${path}`;
}

export const apiClient = {
  login: (email: string, password: string) =>
    api<{ token: string }>('/auth/session', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (name: string, email: string, password: string, organizationName: string) =>
    api<{ token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, organizationName }),
    }),
  account: () => api<{ id: string; name: string; email: string; organizations: Organization[] }>('/account'),
  dashboardSummary: () => api<DashboardSummary>('/dashboard/summary'),
  organizations: () => api<Organization[]>('/organizations'),
  instances: () => api<WhatsAppInstance[]>('/instances'),
  createInstance: (organizationId: string, name: string) =>
    api<WhatsAppInstance>('/instances', {
      method: 'POST',
      body: JSON.stringify({ organizationId, name }),
    }),
  restartInstance: (id: string) => api<{ queued: boolean }>(`/instances/${id}/restart`, { method: 'POST' }),
  resetInstanceQr: (id: string) => api<{ queued: boolean }>(`/instances/${id}/reset-qrcode`, { method: 'POST' }),
  logoutInstance: (id: string) => api<WhatsAppInstance>(`/instances/${id}/logout`, { method: 'POST' }),
  deleteInstance: (id: string) => api<void>(`/instances/${id}`, { method: 'DELETE' }),
  instanceQr: (id: string) =>
    api<{ instanceId: string; status: InstanceStatus; qrCode: string | null; qrUpdatedAt: string | null }>(
      `/instances/${id}/qrcode`,
    ),
  chats: (id: string) => api<Chat[]>(`/instances/${id}/chats`),
  messages: (id: string, chatId: string) => api<Message[]>(`/instances/${id}/chats/${chatId}/messages`),
  contacts: (organizationId: string) => api<Contact[]>(`/contacts?organizationId=${encodeURIComponent(organizationId)}`),
  createContact: (input: { organizationId: string; name: string; ddi: string; phone: string }) =>
    api<Contact>('/contacts', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  sendText: (instanceId: string, to: string, body: string) =>
    api<Message>('/messages/send-text', {
      method: 'POST',
      body: JSON.stringify({ instanceId, to, body }),
    }),
  sendFile: (input: { instanceId: string; to: string; body?: string; file: File }) => {
    const formData = new FormData();
    formData.set('instanceId', input.instanceId);
    formData.set('to', input.to);
    if (input.body) formData.set('body', input.body);
    formData.set('file', input.file);

    return api<Message>('/messages/send-file', {
      method: 'POST',
      body: formData,
    });
  },
  apiKeys: () => api<ApiKey[]>('/api-keys'),
  createApiKey: (organizationId: string, name: string) =>
    api<ApiKey>('/api-keys', {
      method: 'POST',
      body: JSON.stringify({ organizationId, name }),
    }),
  rotateApiKey: (id: string) => api<ApiKey>(`/api-keys/${id}/rotate`, { method: 'POST' }),
  deleteApiKey: (id: string) => api<void>(`/api-keys/${id}`, { method: 'DELETE' }),
  webhooks: (instanceId?: string) =>
    api<WebhookEndpoint[]>(instanceId ? `/webhooks?instanceId=${encodeURIComponent(instanceId)}` : '/webhooks'),
  createWebhook: (organizationId: string, url: string, events: string[], instanceId?: string) =>
    api<WebhookEndpoint>('/webhooks', {
      method: 'POST',
      body: JSON.stringify({ organizationId, instanceId, url, events }),
    }),
  updateWebhook: (id: string, input: { url?: string; active?: boolean; events?: string[] }) =>
    api<WebhookEndpoint>(`/webhooks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
};
