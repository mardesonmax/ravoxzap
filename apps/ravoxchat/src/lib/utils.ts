import type { Chat, Group, InboxRow, LocalContact, MessagePreview, RavoxChatConfig } from '../types';

export function cleanBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}

export function digitsOnly(value: string) {
  return value.replace(/\D/g, '');
}

export function phoneToJid(phone: string) {
  const normalized = digitsOnly(phone);
  return normalized ? `${normalized}@s.whatsapp.net` : '';
}

export function phoneAliases(phone: string) {
  const digits = digitsOnly(phone);
  if (!digits) return [];
  const aliases = new Set([digits]);

  if (digits.startsWith('55')) {
    const ddd = digits.slice(2, 4);
    const number = digits.slice(4);

    if (digits.length === 13 && number.startsWith('9')) {
      aliases.add(`55${ddd}${number.slice(1)}`);
    }

    if (digits.length === 12) {
      aliases.add(`55${ddd}9${number}`);
    }
  }

  return [...aliases];
}

export function phonesMayBeSame(a: string, b: string) {
  const aliases = new Set(phoneAliases(a));
  return phoneAliases(b).some(alias => aliases.has(alias));
}

export function isPhoneJid(remoteJid: string) {
  return /@(s\.whatsapp\.net|c\.us)$/i.test(remoteJid);
}

export function isInternalJid(remoteJid: string) {
  return /@(lid|hosted\.lid)$/i.test(remoteJid);
}

export function jidToPhone(remoteJid: string) {
  if (remoteJid.endsWith('@g.us') || remoteJid.endsWith('@newsletter')) return '';
  const jidUser = remoteJid.replace(/@.+$/, '').replace(/:.+$/, '');
  return isPhoneJid(remoteJid) ? digitsOnly(jidUser) : '';
}

export function jidToDisplayId(remoteJid: string) {
  const phone = jidToPhone(remoteJid);
  if (phone) return phone;
  const rawId = remoteJid.replace(/@.+$/, '').replace(/:.+$/, '');
  if (isInternalJid(remoteJid)) {
    const shortId = digitsOnly(rawId).slice(-8) || rawId.slice(-8);
    return shortId ? `ID privado ${shortId}` : 'ID privado';
  }
  return rawId || remoteJid;
}

export function participantCanUsePhone(jid: string) {
  return Boolean(jidToPhone(jid));
}

export function initials(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const [first, second] = words;
  return `${first?.[0] ?? '?'}${second?.[0] ?? ''}`.toUpperCase();
}

export function formatTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.max(0, Math.floor(diff / 3_600_000));
  if (hours < 1) return 'agora';
  if (hours < 24) return `${hours} h`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function formatMessageTime(value: string) {
  return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function previewFromMessage(message?: MessagePreview) {
  if (!message) return 'Sem mensagens ainda';
  const prefix = message.fromMe ? 'Voce: ' : '';
  const type = message.type ?? 'TEXT';
  if (type === 'IMAGE') return `${prefix}Imagem`;
  if (type === 'AUDIO') return `${prefix}Audio`;
  if (type === 'VIDEO') return `${prefix}Video`;
  if (type === 'DOCUMENT') return `${prefix}Documento`;
  if (type === 'STICKER') return `${prefix}Figurinha`;
  return `${prefix}${message.body ?? 'Mensagem'}`;
}

export function createLocalId(prefix = 'local') {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function defaultConnectionName(instanceId: string) {
  const shortId = instanceId.trim().slice(-6);
  return shortId ? `Instancia ${shortId}` : 'Nova instancia';
}

export function normalizeConnection(input: RavoxChatConfig & { id?: string; name?: string; createdAt?: string; updatedAt?: string }) {
  const now = new Date().toISOString();
  const instanceId = input.instanceId.trim();
  return {
    id: input.id ?? createLocalId('conn'),
    name: input.name?.trim() || defaultConnectionName(instanceId),
    apiBaseUrl: cleanBaseUrl(input.apiBaseUrl),
    apiKey: input.apiKey.trim(),
    instanceId,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

export function mergeRows(chats: Chat[], groups: Group[], contacts: LocalContact[]) {
  const contactByJid = new Map(contacts.map(contact => [contact.remoteJid, contact]));
  const chatByJid = new Map(chats.map(chat => [chat.remoteJid, chat]));
  const groupByJid = new Map(groups.map(group => [group.remoteJid, group]));
  const merged = new Map<string, InboxRow>();

  for (const chat of chats) {
    const isGroup = chat.remoteJid.endsWith('@g.us');
    const group = groupByJid.get(chat.remoteJid) ?? null;
    const contact = contactByJid.get(chat.remoteJid) ?? null;
    const phone = jidToPhone(chat.remoteJid);
    merged.set(chat.remoteJid, {
      id: chat.id,
      kind: isGroup ? 'group' : 'private',
      remoteJid: chat.remoteJid,
      title: contact?.name || group?.subject || chat.name || phone || jidToDisplayId(chat.remoteJid),
      subtitle: isGroup ? `${group?.size ?? 0} participantes` : contact?.phone || phone || jidToDisplayId(chat.remoteJid),
      preview: previewFromMessage(chat.messages?.[0]),
      time: formatTime(chat.updatedAt),
      chat,
      group,
      contact,
    });
  }

  for (const group of groups) {
    if (merged.has(group.remoteJid)) continue;
    merged.set(group.remoteJid, {
      id: group.id,
      kind: 'group',
      remoteJid: group.remoteJid,
      title: group.subject,
      subtitle: `${group.size ?? 0} participantes`,
      preview: 'Grupo sincronizado',
      time: formatTime(group.lastSyncedAt),
      chat: chatByJid.get(group.remoteJid) ?? null,
      group,
      contact: null,
    });
  }

  for (const contact of contacts) {
    if (merged.has(contact.remoteJid)) continue;
    merged.set(contact.remoteJid, {
      id: contact.remoteJid,
      kind: 'contact',
      remoteJid: contact.remoteJid,
      title: contact.name,
      subtitle: contact.phone,
      preview: 'Sem mensagens ainda',
      time: '',
      chat: null,
      group: null,
      contact,
    });
  }

  return [...merged.values()].sort((a, b) => {
    const aPinned = a.chat?.pinnedAt ? 1 : 0;
    const bPinned = b.chat?.pinnedAt ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;
    return new Date(b.chat?.updatedAt ?? b.group?.lastSyncedAt ?? 0).getTime() - new Date(a.chat?.updatedAt ?? a.group?.lastSyncedAt ?? 0).getTime();
  });
}

export async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Nao foi possivel ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

export function parseJsonInput(value: string) {
  if (!value.trim()) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    throw new Error('JSON invalido.');
  }
}

export function stringifyResult(value: unknown) {
  if (value === undefined) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
