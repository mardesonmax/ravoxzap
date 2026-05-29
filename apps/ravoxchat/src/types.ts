export type RavoxChatConfig = {
  apiBaseUrl: string;
  apiKey: string;
  instanceId: string;
};

export type RavoxChatConnection = RavoxChatConfig & {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type Chat = {
  id: string;
  instanceId: string;
  remoteJid: string;
  name: string | null;
  archivedAt?: string | null;
  pinnedAt?: string | null;
  mutedUntil?: string | null;
  isRead?: boolean;
  unreadCount?: number;
  updatedAt?: string;
  messages?: MessagePreview[];
};

export type MessagePreview = {
  id: string;
  body: string | null;
  type?: string;
  fromMe: boolean;
  status: string;
  mediaUrl?: string | null;
  createdAt: string;
};

export type Message = {
  id: string;
  chatId: string | null;
  remoteJid: string;
  participantJid?: string | null;
  fromMe: boolean;
  type?: string;
  body: string | null;
  mediaUrl?: string | null;
  failureReason?: string | null;
  status: string;
  createdAt: string;
  externalId?: string | null;
};

export type GroupParticipant = {
  id?: string;
  jid: string;
  name: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
};

export type Group = {
  id: string;
  instanceId: string;
  remoteJid: string;
  subject: string;
  description: string | null;
  ownerJid?: string | null;
  size: number | null;
  announce?: boolean | null;
  restrict?: boolean | null;
  memberAddMode?: boolean | null;
  joinApprovalMode?: boolean | null;
  ephemeralDuration?: number | null;
  pictureUrl?: string | null;
  inviteCode?: string | null;
  lastSyncedAt: string | null;
  participants?: GroupParticipant[];
};

export type LocalContact = {
  name: string;
  remoteJid: string;
  phone: string;
};

export type InboxRow = {
  id: string;
  kind: 'private' | 'group' | 'contact';
  remoteJid: string;
  title: string;
  subtitle: string;
  preview: string;
  time: string;
  chat: Chat | null;
  group: Group | null;
  contact: LocalContact | null;
};

export type WhatsAppOperation = {
  operationId: string;
  instanceId?: string;
  type?: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  input?: unknown;
  result: unknown;
  error: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type OperationRecord = {
  id: string;
  label: string;
  method: string;
  path: string;
  payload?: unknown;
  operationId?: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  result?: unknown;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type QueueItem = {
  id?: string;
  queue: string;
  name: string;
  data: unknown;
  timestamp: string | null;
};
