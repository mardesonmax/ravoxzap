import type { LocalContact, OperationRecord, RavoxChatConfig, RavoxChatConnection } from '../types';
import { normalizeConnection } from './utils';

const LEGACY_CONFIG_KEY = 'ravoxchat.config';
const CONNECTIONS_KEY = 'ravoxchat.connections';
const ACTIVE_CONNECTION_KEY = 'ravoxchat.activeConnectionId';
const CONTACTS_KEY = 'ravoxchat.contacts';
const OPERATIONS_KEY = 'ravoxchat.operations';

export function loadLegacyConfig(): RavoxChatConfig | null {
  const raw = localStorage.getItem(LEGACY_CONFIG_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RavoxChatConfig;
  } catch {
    localStorage.removeItem(LEGACY_CONFIG_KEY);
    return null;
  }
}

export function loadConnections(): RavoxChatConnection[] {
  const raw = localStorage.getItem(CONNECTIONS_KEY);
  if (raw) {
    try {
      return (JSON.parse(raw) as RavoxChatConnection[]).map(connection => normalizeConnection(connection));
    } catch {
      localStorage.removeItem(CONNECTIONS_KEY);
    }
  }

  const legacy = loadLegacyConfig();
  if (!legacy) return [];

  const firstConnection = normalizeConnection(legacy);
  const migrated = [firstConnection];
  saveConnections(migrated);
  saveActiveConnectionId(firstConnection.id);
  localStorage.removeItem(LEGACY_CONFIG_KEY);
  return migrated;
}

export function saveConnections(connections: RavoxChatConnection[]) {
  localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(connections));
}

export function loadActiveConnectionId() {
  return localStorage.getItem(ACTIVE_CONNECTION_KEY);
}

export function saveActiveConnectionId(connectionId: string | null) {
  if (connectionId) localStorage.setItem(ACTIVE_CONNECTION_KEY, connectionId);
  else localStorage.removeItem(ACTIVE_CONNECTION_KEY);
}

export function loadContacts(): LocalContact[] {
  const raw = localStorage.getItem(CONTACTS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as LocalContact[];
  } catch {
    localStorage.removeItem(CONTACTS_KEY);
    return [];
  }
}

export function saveContacts(contacts: LocalContact[]) {
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
}

export function operationsStorageKey(config: RavoxChatConfig) {
  return `${OPERATIONS_KEY}:${config.apiBaseUrl}:${config.instanceId}`;
}

export function loadOperationHistory(config: RavoxChatConfig): OperationRecord[] {
  const raw = localStorage.getItem(operationsStorageKey(config));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as OperationRecord[];
  } catch {
    localStorage.removeItem(operationsStorageKey(config));
    return [];
  }
}

export function saveOperationHistory(config: RavoxChatConfig, history: OperationRecord[]) {
  localStorage.setItem(operationsStorageKey(config), JSON.stringify(history.slice(0, 80)));
}
