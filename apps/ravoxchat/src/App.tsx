import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  Bell,
  Check,
  ChevronDown,
  Edit3,
  Mic,
  MessageSquareText,
  MoreVertical,
  Pin,
  Plus,
  Search,
  Send,
  Server,
  Square,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { publicClient } from './api/client';
import { useOperationRunner } from './components/OperationRunner';
import {
  Avatar,
  EmptyState,
  Field,
  IconButton,
  MediaPreview,
  MenuButton,
  MessageBubble,
  Modal,
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
  PrimaryButton,
  RadioGroup,
  RadioGroupItem,
  SecondaryButton,
  Sheet,
  TextInput,
} from './components/ui';
import { ConsoleContent } from './features/ConsolePanels';
import {
  loadActiveConnectionId,
  loadConnections,
  loadContacts,
  loadOperationHistory,
  saveActiveConnectionId,
  saveConnections,
  saveContacts,
  saveOperationHistory,
} from './lib/storage';
import { jidToDisplayId, jidToPhone, mergeRows, normalizeConnection, phonesMayBeSame } from './lib/utils';
import type { InboxRow, LocalContact, OperationRecord, RavoxChatConnection } from './types';

type ConnectionFormState = {
  id?: string;
  name: string;
  apiBaseUrl: string;
  apiKey: string;
  instanceId: string;
};

type Draft = {
  body: string;
  file: File | null;
};

const emptyDraft: Draft = { body: '', file: null };

function formatRecorderTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function emptyConnectionForm(baseUrl = 'http://localhost:3334'): ConnectionFormState {
  return {
    name: '',
    apiBaseUrl: baseUrl,
    apiKey: '',
    instanceId: '',
  };
}

export function App() {
  const [connections, setConnections] = useState<RavoxChatConnection[]>(() => loadConnections());
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(() => loadActiveConnectionId());
  const [formOpen, setFormOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<RavoxChatConnection | null>(null);

  const activeConnection = useMemo(() => {
    if (connections.length === 0) return null;
    return connections.find(connection => connection.id === activeConnectionId) ?? connections[0] ?? null;
  }, [activeConnectionId, connections]);

  useEffect(() => {
    if (!activeConnection && connections.length > 0) {
      setActiveConnectionId(connections[0]?.id ?? null);
      saveActiveConnectionId(connections[0]?.id ?? null);
    }
  }, [activeConnection, connections]);

  function saveConnection(input: ConnectionFormState) {
    const normalized = normalizeConnection({
      id: input.id,
      name: input.name,
      apiBaseUrl: input.apiBaseUrl,
      apiKey: input.apiKey,
      instanceId: input.instanceId,
      createdAt: editingConnection?.createdAt,
      updatedAt: new Date().toISOString(),
    });
    const next = input.id
      ? connections.map(connection => (connection.id === input.id ? normalized : connection))
      : [...connections, normalized];

    setConnections(next);
    saveConnections(next);
    setActiveConnectionId(normalized.id);
    saveActiveConnectionId(normalized.id);
    setEditingConnection(null);
    setFormOpen(false);
  }

  function removeConnection(connectionId: string) {
    const next = connections.filter(connection => connection.id !== connectionId);
    const nextActive = activeConnectionId === connectionId ? next[0]?.id ?? null : activeConnectionId;
    setConnections(next);
    saveConnections(next);
    setActiveConnectionId(nextActive);
    saveActiveConnectionId(nextActive);
  }

  if (!activeConnection) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#0b0c11] p-6 text-gray-100">
        <div className="w-full max-w-md rounded-2xl border border-[#2d3036] bg-[#111318] p-6 text-center">
          <Server size={38} className="mx-auto mb-4 text-[#2edb5c]" />
          <h1 className="text-2xl font-semibold">RavoxChat</h1>
          <p className="mt-2 text-sm leading-6 text-gray-400">Conecte uma API Key e um Instance ID para abrir o console avancado da API RavoxZap.</p>
          <PrimaryButton className="mt-6 w-full" onClick={() => setFormOpen(true)}>Conectar instancia</PrimaryButton>
        </div>
        {formOpen && <ConnectionFormModal connection={null} onClose={() => setFormOpen(false)} onSave={saveConnection} />}
      </main>
    );
  }

  return (
    <>
      <Workspace
        config={activeConnection}
        connections={connections}
        activeConnectionId={activeConnection.id}
        onEditConnection={connection => {
          setEditingConnection(connection);
          setFormOpen(true);
        }}
        onNewConnection={() => {
          setEditingConnection(null);
          setFormOpen(true);
        }}
        onRemoveConnection={removeConnection}
        onSelectConnection={connectionId => {
          setActiveConnectionId(connectionId);
          saveActiveConnectionId(connectionId);
        }}
      />
      {formOpen && (
        <ConnectionFormModal
          connection={editingConnection}
          defaultBaseUrl={connections.at(-1)?.apiBaseUrl}
          onClose={() => {
            setFormOpen(false);
            setEditingConnection(null);
          }}
          onSave={saveConnection}
        />
      )}
    </>
  );
}

function Workspace({
  config,
  connections,
  activeConnectionId,
  onEditConnection,
  onNewConnection,
  onRemoveConnection,
  onSelectConnection,
}: {
  config: RavoxChatConnection;
  connections: RavoxChatConnection[];
  activeConnectionId: string;
  onEditConnection: (connection: RavoxChatConnection) => void;
  onNewConnection: () => void;
  onRemoveConnection: (connectionId: string) => void;
  onSelectConnection: (connectionId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [contacts, setContacts] = useState<LocalContact[]>(() => loadContacts());
  const [selected, setSelected] = useState<InboxRow | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'private' | 'groups' | 'pinned' | 'unread'>('all');
  const [managerOpen, setManagerOpen] = useState(false);
  const [groupDetailsOpen, setGroupDetailsOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [, setOperationHistory] = useState<OperationRecord[]>(() => loadOperationHistory(config));
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);

  const scrollMessagesToBottom = useCallback(() => {
    const element = messagesScrollRef.current;
    if (!element) return;
    const scroll = () => {
      element.scrollTop = element.scrollHeight;
    };
    requestAnimationFrame(scroll);
    window.setTimeout(scroll, 90);
  }, []);

  useEffect(() => {
    const history = loadOperationHistory(config);
    setOperationHistory(history);
  }, [config.apiBaseUrl, config.instanceId]);

  function recordOperation(record: OperationRecord) {
    setOperationHistory(current => {
      const next = [record, ...current.filter(item => item.id !== record.id)].slice(0, 80);
      saveOperationHistory(config, next);
      return next;
    });
  }

  const run = useOperationRunner(config, recordOperation);

  const status = useQuery({
    queryKey: ['status', config.apiBaseUrl, config.instanceId],
    queryFn: () => publicClient.status(config),
    refetchInterval: 30000,
  });
  const chats = useQuery({
    queryKey: ['chats', config.apiBaseUrl, config.instanceId],
    queryFn: () => publicClient.chats(config),
    refetchInterval: 10000,
  });
  const groups = useQuery({
    queryKey: ['groups', config.apiBaseUrl, config.instanceId],
    queryFn: () => publicClient.groups(config),
    refetchInterval: 30000,
  });
  const messages = useQuery({
    queryKey: ['messages', config.apiBaseUrl, config.instanceId, selected?.chat?.id],
    queryFn: () => publicClient.messages(config, selected!.chat!.id),
    enabled: Boolean(selected?.chat?.id),
    refetchInterval: 7000,
  });

  const allRows = useMemo(() => mergeRows(chats.data ?? [], groups.data ?? [], contacts), [chats.data, groups.data, contacts]);
  const rows = useMemo(() => allRows.filter(row => {
    if (filter === 'private' && row.kind === 'group') return false;
    if (filter === 'groups' && row.kind !== 'group') return false;
    if (filter === 'pinned' && !row.chat?.pinnedAt) return false;
    if (filter === 'unread' && !row.chat?.unreadCount) return false;
    const haystack = `${row.title} ${row.subtitle} ${row.remoteJid}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  }), [allRows, filter, search]);

  useEffect(() => {
    if (!selected) return;
    const updated = allRows.find(row => row.remoteJid === selected.remoteJid);
    if (updated) setSelected(updated);
  }, [allRows, selected?.remoteJid]);

  useEffect(() => {
    scrollMessagesToBottom();
  }, [messages.data?.length, selected?.id, scrollMessagesToBottom]);

  useEffect(() => {
    if (selected?.kind !== 'group') setGroupDetailsOpen(false);
  }, [selected?.kind]);

  const draftKey = selected ? `${config.instanceId}:${selected.remoteJid}` : '';
  const draft = draftKey ? drafts[draftKey] ?? emptyDraft : emptyDraft;
  const canSend = Boolean(selected && (draft.body.trim() || draft.file));

  const refreshChats = () => {
    void queryClient.invalidateQueries({ queryKey: ['chats', config.apiBaseUrl, config.instanceId] });
    if (selected?.chat?.id) void queryClient.invalidateQueries({ queryKey: ['messages', config.apiBaseUrl, config.instanceId, selected.chat.id] });
  };
  const refreshGroups = () => {
    void queryClient.invalidateQueries({ queryKey: ['groups', config.apiBaseUrl, config.instanceId] });
  };

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('Selecione uma conversa.');
      if (draft.file) return publicClient.sendMedia(config, selected.remoteJid, draft.file, draft.body);
      return publicClient.sendText(config, selected.remoteJid, draft.body.trim());
    },
    onSuccess: () => {
      setDrafts(current => ({ ...current, [draftKey]: emptyDraft }));
      refreshChats();
    },
  });

  function setDraft(next: Partial<Draft>) {
    if (!draftKey) return;
    setDrafts(current => ({ ...current, [draftKey]: { ...emptyDraft, ...current[draftKey], ...next } }));
  }

  function saveLocalContact(contact: LocalContact) {
    const next = [...contacts.filter(item => item.remoteJid !== contact.remoteJid), contact].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    setContacts(next);
    saveContacts(next);
  }

  function removeLocalContact(remoteJid: string) {
    const next = contacts.filter(item => item.remoteJid !== remoteJid);
    setContacts(next);
    saveContacts(next);
  }

  async function runChatAction(action: string, body: Record<string, unknown> = {}) {
    if (!selected?.chat) return;
    await runChatActionFor(selected.chat, action, body);
  }

  async function runChatActionFor(chat: NonNullable<InboxRow['chat']>, action: string, body: Record<string, unknown> = {}) {
    await run({
      label: `Chat ${action}`,
      method: 'POST',
      path: `/v1/instances/${config.instanceId}/chats/${chat.id}/${action}`,
      payload: body,
      refresh: refreshChats,
    });
  }

  const consoleProps = {
    section: 'groups' as const,
    config,
    selected,
    rows: allRows,
    groups: groups.data ?? [],
    contacts,
    run,
    refreshChats,
    refreshGroups,
    onSaveContact: saveLocalContact,
    onRemoveContact: removeLocalContact,
  };
  return (
    <main className="flex h-dvh overflow-hidden bg-[#0b0c11] text-gray-100">
      <aside className="flex w-full shrink-0 flex-col border-r border-[#2d3036] bg-[#111318] md:w-[380px]">
        <header className="flex h-16 items-center justify-between border-b border-[#2d3036] px-4">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">RavoxChat</h1>
            <p className="truncate text-xs text-gray-400">{config.name} · {status.data?.phoneNumber ?? config.instanceId}</p>
          </div>
          <div className="flex items-center gap-2">
            <IconButton icon={Server} label="Instancias" active={managerOpen} onClick={() => setManagerOpen(current => !current)} />
          </div>
        </header>

        {managerOpen ? (
          <ConnectionPanel
            activeConnectionId={activeConnectionId}
            connections={connections}
            onEdit={onEditConnection}
            onNew={onNewConnection}
            onRemove={onRemoveConnection}
            onSelect={connectionId => {
              onSelectConnection(connectionId);
              setManagerOpen(false);
            }}
            onClose={() => setManagerOpen(false)}
          />
        ) : (
          <>
            <div className="border-b border-[#2d3036] p-4">
              <label className="flex h-11 items-center gap-3 rounded-full bg-[#202221] px-4 text-gray-400">
                <Search size={18} />
                <input value={search} onChange={event => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-gray-100 outline-none placeholder:text-gray-500" placeholder="Pesquisar conversa" />
              </label>
              <div className="ravox-scrollbar-x mt-3 flex gap-2 overflow-x-auto pb-1">
                {(['all', 'private', 'groups', 'pinned', 'unread'] as const).map(value => (
                  <button
                    key={value}
                    type="button"
                    className={`shrink-0 cursor-pointer rounded-full px-3 py-2 text-sm transition ${filter === value ? 'bg-[#123d24] text-[#2edb5c]' : 'bg-[#202221] text-gray-300 hover:bg-[#2a2d2b]'}`}
                    onClick={() => setFilter(value)}
                  >
                    {value === 'all' ? 'Tudo' : value === 'private' ? 'Pessoas' : value === 'groups' ? 'Grupos' : value === 'pinned' ? 'Fixadas' : 'Nao lidas'}
                  </button>
                ))}
              </div>
            </div>
            <div className="ravox-scrollbar min-h-0 flex-1 overflow-y-auto">
              {rows.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-gray-500">Nenhum chat encontrado.</div>
              ) : rows.map(row => (
                <div
                  key={row.id}
                  className={`group flex w-full items-center gap-2 border-b border-[#2d3036] px-4 py-3 transition hover:bg-[#202221] ${selected?.remoteJid === row.remoteJid ? 'bg-[#2a2d2b]' : ''}`}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                    onClick={() => {
                      setSelected(row);
                      setGroupDetailsOpen(false);
                    }}
                  >
                    <Avatar title={row.title} kind={row.kind} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{row.title}</span>
                      <span className="mt-1 block truncate text-sm text-gray-400">{row.preview}</span>
                    </span>
                  </button>
                  <span className={`shrink-0 text-xs text-gray-500 ${row.chat ? 'group-hover:hidden group-focus-within:hidden' : ''}`}>{row.time}</span>
                  {row.chat && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="hidden h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-gray-400 transition hover:bg-[#2a2d2b] hover:text-white group-hover:grid group-focus-within:grid data-[state=open]:grid"
                          aria-label={`Acoes de ${row.title}`}
                        >
                          <ChevronDown size={18} />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="end" side="bottom" className="w-64">
                        <PopoverClose asChild>
                          <button type="button" className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-gray-200 transition hover:bg-[#2a2d2b]" onClick={() => void runChatActionFor(row.chat!, 'archive', { archived: !row.chat?.archivedAt })}>
                            <Archive size={17} className="text-gray-400" />
                            {row.chat.archivedAt ? 'Desarquivar conversa' : 'Arquivar conversa'}
                          </button>
                        </PopoverClose>
                        <PopoverClose asChild>
                          <button type="button" className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-gray-200 transition hover:bg-[#2a2d2b]" onClick={() => void runChatActionFor(row.chat!, 'mute', { mutedUntil: row.chat?.mutedUntil ? null : new Date(Date.now() + 8 * 3_600_000).toISOString() })}>
                            <Bell size={17} className="text-gray-400" />
                            {row.chat.mutedUntil ? 'Reativar notificacoes' : 'Silenciar por 8 horas'}
                          </button>
                        </PopoverClose>
                        <PopoverClose asChild>
                          <button type="button" className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-gray-200 transition hover:bg-[#2a2d2b]" onClick={() => void runChatActionFor(row.chat!, 'pin', { pinned: !row.chat?.pinnedAt })}>
                            <Pin size={17} className="text-gray-400" />
                            {row.chat.pinnedAt ? 'Desfixar conversa' : 'Fixar conversa'}
                          </button>
                        </PopoverClose>
                        {Boolean(row.chat.unreadCount) && (
                          <PopoverClose asChild>
                            <button type="button" className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-gray-200 transition hover:bg-[#2a2d2b]" onClick={() => void runChatActionFor(row.chat!, 'read', { read: true })}>
                              <Check size={17} className="text-gray-400" />
                              Marcar como lida
                            </button>
                          </PopoverClose>
                        )}
                        <div className="my-1 border-t border-[#2d3036]" />
                        <PopoverClose asChild>
                          <button type="button" className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-red-300 transition hover:bg-red-500/10" onClick={() => void runChatActionFor(row.chat!, 'clear')}>
                            <Trash2 size={17} />
                            Limpar conversa
                          </button>
                        </PopoverClose>
                        <PopoverClose asChild>
                          <button type="button" className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-red-300 transition hover:bg-red-500/10" onClick={() => void runChatActionFor(row.chat!, 'delete')}>
                            <Trash2 size={17} />
                            Apagar conversa
                          </button>
                        </PopoverClose>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </aside>

      <section className="min-w-0 flex-1">
        <ChatPane
          config={config}
          selected={selected}
          messages={messages.data ?? []}
          draft={draft}
          canSend={canSend}
          pending={sendMutation.isPending}
          error={sendMutation.error?.message}
          messagesScrollRef={messagesScrollRef}
          onMediaLoad={scrollMessagesToBottom}
          fileInputRef={fileInputRef}
          onDraftChange={setDraft}
          onSend={() => sendMutation.mutate()}
          onChatAction={runChatAction}
          onOpenGroupDetails={() => setGroupDetailsOpen(true)}
          onSaveLocalContact={saveLocalContact}
          contacts={contacts}
        />
      </section>

      {groupDetailsOpen && selected?.kind === 'group' && (
        <Sheet title="Dados do grupo" subtitle={selected.title} onClose={() => setGroupDetailsOpen(false)}>
          <ConsoleContent {...consoleProps} />
        </Sheet>
      )}
    </main>
  );
}

function ChatPane({
  config,
  selected,
  messages,
  draft,
  canSend,
  pending,
  error,
  messagesScrollRef,
  onMediaLoad,
  fileInputRef,
  onDraftChange,
  onSend,
  onChatAction,
  onOpenGroupDetails,
  onSaveLocalContact,
  contacts,
}: {
  config: RavoxChatConnection;
  selected: InboxRow | null;
  messages: import('./types').Message[];
  draft: Draft;
  canSend: boolean;
  pending: boolean;
  error?: string;
  messagesScrollRef: React.RefObject<HTMLDivElement | null>;
  onMediaLoad: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onDraftChange: (next: Partial<Draft>) => void;
  onSend: () => void;
  onChatAction: (action: string, body?: Record<string, unknown>) => Promise<void>;
  onOpenGroupDetails: () => void;
  onSaveLocalContact: (contact: LocalContact) => void;
  contacts: LocalContact[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [saveContactOpen, setSaveContactOpen] = useState(false);
  const [contactName, setContactName] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingError, setRecordingError] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const discardRecordingRef = useRef(false);

  function clearRecordingTimer() {
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }

  function cleanupRecordingStream() {
    recordingStreamRef.current?.getTracks().forEach(track => track.stop());
    recordingStreamRef.current = null;
  }

  useEffect(() => () => {
    clearRecordingTimer();
    cleanupRecordingStream();
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  if (!selected) {
    return (
      <div className="chat-wallpaper flex h-full items-center justify-center p-8 text-center">
        <div>
          <MessageSquareText size={42} className="mx-auto mb-4 text-gray-600" />
          <h2 className="text-xl font-semibold">Selecione uma conversa</h2>
          <p className="mt-2 max-w-sm text-sm text-gray-400">Escolha um chat para conversar.</p>
        </div>
      </div>
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (isRecording) return;
    if (canSend) onSend();
  }

  async function startRecording() {
    setRecordingError('');

    if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) {
      setRecordingError('Gravacao de audio nao esta disponivel neste navegador.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';
      const recorder = preferredMimeType ? new MediaRecorder(stream, { mimeType: preferredMimeType }) : new MediaRecorder(stream);

      recordingStreamRef.current = stream;
      recordingChunksRef.current = [];
      discardRecordingRef.current = false;
      mediaRecorderRef.current = recorder;

      recorder.addEventListener('dataavailable', event => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      });

      recorder.addEventListener('stop', () => {
        clearRecordingTimer();
        cleanupRecordingStream();
        setIsRecording(false);

        const chunks = recordingChunksRef.current;
        recordingChunksRef.current = [];
        if (discardRecordingRef.current || chunks.length === 0) return;

        const mimeType = recorder.mimeType || 'audio/webm';
        const extension = mimeType.includes('ogg') ? 'ogg' : 'webm';
        const blob = new Blob(chunks, { type: mimeType });
        const file = new File([blob], `audio-${Date.now()}.${extension}`, { type: mimeType });
        onDraftChange({ file, body: '' });
      });

      recorder.start();
      setRecordingSeconds(0);
      setIsRecording(true);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds(seconds => seconds + 1);
      }, 1000);
    } catch (error) {
      cleanupRecordingStream();
      setIsRecording(false);
      setRecordingError(error instanceof Error ? error.message : 'Nao foi possivel acessar o microfone.');
    }
  }

  function stopRecording(discard = false) {
    discardRecordingRef.current = discard;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
      return;
    }
    clearRecordingTimer();
    cleanupRecordingStream();
    setIsRecording(false);
  }

  const contactPhone = jidToPhone(selected.remoteJid);
  const contactRemoteJid = selected.remoteJid;
  const defaultContactName = selected.contact?.name || (selected.title && selected.title !== contactPhone ? selected.title : selected.subtitle || contactPhone);

  function openSaveContact() {
    setContactName(defaultContactName);
    setSaveContactOpen(true);
  }

  function submitContact(event: FormEvent) {
    event.preventDefault();
    const name = contactName.trim() || defaultContactName || contactPhone;
    if (!contactPhone) return;
    onSaveLocalContact({ name, phone: contactPhone, remoteJid: contactRemoteJid });
    setSaveContactOpen(false);
  }

  function senderNameFor(message: import('./types').Message) {
    if (selected!.kind !== 'group' || message.fromMe || !message.participantJid) return undefined;
    const phone = jidToPhone(message.participantJid);
    const savedContact = phone
      ? contacts.find(contact => phonesMayBeSame(contact.phone, phone))
      : contacts.find(contact => contact.remoteJid === message.participantJid);
    const participant = selected!.group?.participants?.find(item => {
      if (item.jid === message.participantJid) return true;
      const participantPhone = jidToPhone(item.jid);
      return Boolean(phone && participantPhone && phonesMayBeSame(participantPhone, phone));
    });

    return savedContact?.name || participant?.name || phone || jidToDisplayId(message.participantJid);
  }

  return (
    <div className="flex h-full min-w-0 flex-col bg-[#0b0f0f]">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-[#2d3036] bg-[#181a21] px-4">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left transition hover:bg-white/5 disabled:hover:bg-transparent"
          onClick={selected.kind === 'group' ? onOpenGroupDetails : undefined}
          disabled={selected.kind !== 'group'}
          title={selected.kind === 'group' ? 'Abrir detalhes do grupo' : undefined}
        >
          <Avatar title={selected.title} kind={selected.kind} />
          <span className="min-w-0 flex-1">
            <strong className="block truncate">{selected.title}</strong>
            <span className="block truncate text-sm text-gray-400">{selected.subtitle}</span>
          </span>
        </button>
        {selected.kind !== 'group' && contactPhone && (
          <SecondaryButton
            type="button"
            className="hidden h-10 sm:block"
            onClick={openSaveContact}
          >
            {selected.contact ? 'Editar contato' : 'Salvar contato'}
          </SecondaryButton>
        )}
        {selected.chat && (
          <div className="relative" data-popover-root>
            <IconButton icon={MoreVertical} label="Acoes do chat" active={menuOpen} onClick={() => setMenuOpen(current => !current)} />
            {menuOpen && (
              <div className="absolute right-0 top-11 z-40 w-60 rounded-xl border border-[#2d3036] bg-[#1f2128] p-2 shadow-2xl">
                <MenuButton icon={Check} label="Marcar como lido" onClick={() => void onChatAction('read', { read: true })} />
                <MenuButton icon={Archive} label={selected.chat.archivedAt ? 'Desarquivar' : 'Arquivar'} onClick={() => void onChatAction('archive', { archived: !selected.chat?.archivedAt })} />
                <MenuButton icon={Bell} label="Mutar por 8 horas" onClick={() => void onChatAction('mute', { mutedUntil: new Date(Date.now() + 8 * 3_600_000).toISOString() })} />
                <MenuButton icon={Trash2} label="Limpar conversa" danger onClick={() => void onChatAction('clear')} />
                <MenuButton icon={Trash2} label="Apagar conversa" danger onClick={() => void onChatAction('delete')} />
              </div>
            )}
          </div>
        )}
      </header>

      <div ref={messagesScrollRef} className="chat-wallpaper min-h-0 flex-1 overflow-auto p-4">
        {!selected.chat ? (
          <EmptyState title="Conversa ainda sem historico">Envie uma mensagem para criar o chat no RavoxZap.</EmptyState>
        ) : messages.length === 0 ? (
          <EmptyState title="Nenhuma mensagem carregada" />
        ) : (
          <div className="space-y-3">
            {messages.map(message => <MessageBubble key={message.id} message={message} config={config} onMediaLoad={onMediaLoad} senderName={senderNameFor(message)} />)}
          </div>
        )}
      </div>

      <form className="shrink-0 border-t border-[#2d3036] bg-[#181a21] p-3" onSubmit={submit}>
        {draft.file && (
          <div className="mb-3 flex items-center gap-3 rounded-2xl bg-[#202221] p-3">
            <MediaPreview file={draft.file} />
            <button type="button" className="ml-auto flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-gray-400 transition hover:bg-[#2a2d2b] hover:text-white" onClick={() => onDraftChange({ file: null })}>
              <X size={18} />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 rounded-full bg-[#202221] p-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={event => {
              const file = event.target.files?.[0];
              if (file) onDraftChange({ file });
              event.currentTarget.value = '';
            }}
          />
          <button type="button" className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-gray-200 transition hover:bg-[#2a2d2b]" onClick={() => fileInputRef.current?.click()}>
            <Plus size={24} />
          </button>
          {isRecording ? (
            <div className="flex min-w-0 flex-1 items-center gap-3 px-1 text-sm">
              <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-400" />
              <span className="font-mono text-red-200">{formatRecorderTime(recordingSeconds)}</span>
              <span className="min-w-0 flex-1 truncate text-gray-300">Gravando audio</span>
              <button type="button" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-gray-300 transition hover:bg-[#2a2d2b] hover:text-white" onClick={() => stopRecording(true)} aria-label="Cancelar audio">
                <X size={18} />
              </button>
            </div>
          ) : (
            <input value={draft.body} onChange={event => onDraftChange({ body: event.target.value })} className="h-10 min-w-0 flex-1 bg-transparent px-1 text-gray-100 outline-none placeholder:text-gray-500" placeholder={draft.file ? 'Legenda opcional' : 'Digite uma mensagem'} />
          )}
          {isRecording ? (
            <button type="button" className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-[#2edb5c] text-[#0b0c11] transition hover:bg-[#25c452]" onClick={() => stopRecording()} aria-label="Finalizar audio">
              <Square size={18} fill="currentColor" />
            </button>
          ) : canSend ? (
            <button type="submit" className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-[#2edb5c] text-[#0b0c11] transition hover:bg-[#25c452] disabled:cursor-not-allowed disabled:opacity-50" disabled={!canSend || pending}>
              <Send size={20} />
            </button>
          ) : (
            <button type="button" className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-[#2edb5c] text-[#0b0c11] transition hover:bg-[#25c452] disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void startRecording()} disabled={pending} aria-label="Gravar audio">
              <Mic size={20} />
            </button>
          )}
        </div>
        {(error || recordingError) && <p className="mt-2 text-sm text-red-300">{error || recordingError}</p>}
      </form>
      {saveContactOpen && (
        <Modal title={selected.contact ? 'Editar contato' : 'Salvar contato'} onClose={() => setSaveContactOpen(false)}>
          <form className="space-y-4" onSubmit={submitContact}>
            <Field label="Nome">
              <TextInput value={contactName} onChange={event => setContactName(event.target.value)} autoFocus />
            </Field>
            <Field label="Telefone">
              <TextInput value={contactPhone} readOnly />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <SecondaryButton type="button" onClick={() => setSaveContactOpen(false)}>Cancelar</SecondaryButton>
              <PrimaryButton type="submit">Salvar</PrimaryButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function ConnectionPanel({
  activeConnectionId,
  connections,
  onEdit,
  onNew,
  onRemove,
  onSelect,
  onClose,
}: {
  activeConnectionId: string;
  connections: RavoxChatConnection[];
  onEdit: (connection: RavoxChatConnection) => void;
  onNew: () => void;
  onRemove: (connectionId: string) => void;
  onSelect: (connectionId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="ravox-scrollbar min-h-0 flex-1 overflow-auto p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Instancias</h2>
          <p className="text-xs text-gray-500">Escolha uma conexao ativa.</p>
        </div>
        <button type="button" className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-gray-300 transition hover:bg-[#202221] hover:text-white" onClick={onClose} aria-label="Fechar instancias">
          <X size={18} />
        </button>
      </div>
      <PrimaryButton className="mb-4 w-full" onClick={onNew}>Nova instancia</PrimaryButton>
      <RadioGroup value={activeConnectionId} onValueChange={onSelect} className="space-y-2">
        {connections.map(connection => (
          <div
            key={connection.id}
            className={`rounded-xl border p-3 transition hover:bg-[#181b20] ${connection.id === activeConnectionId ? 'border-[#2edb5c]/70 bg-[#0b2415]' : 'border-[#2d3036] bg-[#111318]'}`}
          >
            <div className="flex items-start gap-3">
              <button type="button" className="min-w-0 flex-1 cursor-pointer text-left" onClick={() => onSelect(connection.id)}>
                <strong className="block truncate text-sm">{connection.name}</strong>
                <span className="mt-1 block truncate font-mono text-xs text-gray-500">{connection.instanceId}</span>
                <span className="mt-0.5 block truncate text-xs text-gray-500">{connection.apiBaseUrl}</span>
              </button>
              <RadioGroupItem value={connection.id} aria-label={connection.name} />
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-gray-300 transition hover:bg-[#202221] hover:text-white"
                    aria-label={`Opcoes da instancia ${connection.name}`}
                    onClick={event => event.stopPropagation()}
                  >
                    <MoreVertical size={18} />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" side="bottom" className="w-56">
                  <PopoverClose asChild>
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-gray-200 transition hover:bg-[#2a2d2b]"
                      onClick={() => {
                        onEdit(connection);
                      }}
                    >
                      <Edit3 size={17} className="text-gray-400" />
                      Editar
                    </button>
                  </PopoverClose>
                  <PopoverClose asChild>
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-red-300 transition hover:bg-red-500/10"
                      onClick={() => {
                        onRemove(connection.id);
                      }}
                    >
                      <Trash2 size={17} />
                      Remover
                    </button>
                  </PopoverClose>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}

function ConnectionFormModal({
  connection,
  defaultBaseUrl,
  onClose,
  onSave,
}: {
  connection: RavoxChatConnection | null;
  defaultBaseUrl?: string;
  onClose: () => void;
  onSave: (input: ConnectionFormState) => void;
}) {
  const [form, setForm] = useState<ConnectionFormState>(() => connection
    ? {
        id: connection.id,
        name: connection.name,
        apiBaseUrl: connection.apiBaseUrl,
        apiKey: connection.apiKey,
        instanceId: connection.instanceId,
      }
    : emptyConnectionForm(defaultBaseUrl));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.apiBaseUrl.trim() || !form.apiKey.trim() || !form.instanceId.trim()) return;
    onSave(form);
  }

  return (
    <Modal title={connection ? 'Editar instancia' : 'Conectar instancia'} onClose={onClose}>
      <form className="space-y-3" onSubmit={submit}>
        <Field label="Nome">
          <TextInput value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Suporte, cobranca..." />
        </Field>
        <Field label="API Base URL">
          <TextInput value={form.apiBaseUrl} onChange={event => setForm(current => ({ ...current, apiBaseUrl: event.target.value }))} placeholder="http://localhost:3334" required />
        </Field>
        <Field label="API Key">
          <TextInput value={form.apiKey} onChange={event => setForm(current => ({ ...current, apiKey: event.target.value }))} placeholder="ravox_live_xxxxx" required />
        </Field>
        <Field label="Instance ID">
          <TextInput value={form.instanceId} onChange={event => setForm(current => ({ ...current, instanceId: event.target.value }))} placeholder="instance id" required />
        </Field>
        <PrimaryButton type="submit" className="w-full">{connection ? 'Salvar' : 'Conectar'}</PrimaryButton>
      </form>
    </Modal>
  );
}
