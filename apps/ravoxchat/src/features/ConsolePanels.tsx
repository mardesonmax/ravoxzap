import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Check, ChevronDown, Copy, Edit3, Info, Link, ListChecks, RefreshCw, Search, ShieldCheck, Timer, UserMinus, UserPlus, Users, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { publicClient } from '../api/client';
import type { Group, InboxRow, LocalContact, QueueItem, RavoxChatConfig } from '../types';
import type { RunOperation } from '../components/OperationRunner';
import { ActionForm, BlockedAction, Field, JsonEditor, JsonResult, Modal, Popover, PopoverClose, PopoverContent, PopoverTrigger, PrimaryButton, SecondaryButton, Switch, TextInput } from '../components/ui';
import { fileToDataUrl, jidToPhone, parseJsonInput, participantCanUsePhone, phoneAliases } from '../lib/utils';

export type ConsoleSection =
  | 'messages'
  | 'groups'
  | 'contacts'
  | 'status'
  | 'profile'
  | 'privacy'
  | 'communities'
  | 'newsletters'
  | 'business'
  | 'queue'
  | 'operations';

type ConsoleProps = {
  section: ConsoleSection;
  config: RavoxChatConfig;
  selected: InboxRow | null;
  rows: InboxRow[];
  groups: Group[];
  contacts: LocalContact[];
  run: RunOperation;
  refreshChats: () => void;
  refreshGroups: () => void;
  onSaveContact: (contact: LocalContact) => void;
  onRemoveContact: (remoteJid: string) => void;
};

type ActionDef = {
  label: string;
  method: string;
  path: string;
  payload?: Record<string, unknown>;
  blocked?: string;
};

function instancePath(config: RavoxChatConfig, path: string) {
  return `/v1/instances/${config.instanceId}${path}`;
}

function encode(value: string) {
  return encodeURIComponent(value);
}

function sectionTitle(section: ConsoleSection) {
  return {
    messages: 'Mensagens',
    groups: 'Grupos',
    contacts: 'Contatos',
    status: 'Status',
    profile: 'Perfil',
    privacy: 'Privacidade',
    communities: 'Comunidades',
    newsletters: 'Canais',
    business: 'Business',
    queue: 'Fila',
    operations: 'Operacoes',
  }[section];
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[#2d3036] bg-[#111318]">
      <header className="flex h-12 items-center gap-3 border-b border-[#2d3036] px-4">
        <ListChecks size={18} className="text-[#2edb5c]" />
        <h3 className="font-semibold">{title}</h3>
      </header>
      <div className="space-y-3 p-4">{children}</div>
    </section>
  );
}

function EndpointAction({ action, run, refresh }: { action: ActionDef; run: RunOperation; refresh?: () => void }) {
  const [json, setJson] = useState(JSON.stringify(action.payload ?? {}, null, 2));
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: async () => {
      setError('');
      await run({
        label: action.label,
        method: action.method,
        path: action.path,
        payload: action.method === 'GET' || action.method === 'DELETE' ? undefined : parseJsonInput(json),
        refresh,
      });
    },
    onError: err => {
      setError(err instanceof Error ? err.message : 'JSON invalido.');
    },
  });

  if (action.blocked) return <BlockedAction title={action.label} reason={action.blocked} />;

  return (
    <ActionForm
      title={action.label}
      description={`${action.method} ${action.path}`}
      submitLabel={mutation.isPending ? 'Executando...' : 'Executar'}
      disabled={mutation.isPending}
      onSubmit={() => {
        mutation.mutate();
      }}
    >
      {action.method !== 'GET' && action.method !== 'DELETE' && <JsonEditor value={json} onChange={setJson} minHeight={110} />}
      {error && <p className="text-sm text-red-300">{error}</p>}
    </ActionForm>
  );
}

export function ConsolePanels(props: ConsoleProps) {
  return (
    <aside className="hidden min-h-0 w-[420px] shrink-0 flex-col border-l border-[#2d3036] bg-[#0f1117] xl:flex">
      <header className="flex h-16 shrink-0 items-center border-b border-[#2d3036] px-4">
        <div>
          <h2 className="font-semibold">{sectionTitle(props.section)}</h2>
          <p className="text-xs text-gray-500">Console avancado da API publica</p>
        </div>
      </header>
      <div className="ravox-scrollbar min-h-0 flex-1 space-y-4 overflow-auto p-4">
        <ConsoleContent {...props} />
      </div>
    </aside>
  );
}

export function ConsoleContent(props: ConsoleProps) {
  if (props.section === 'queue') return <QueueConsole {...props} />;
  if (props.section === 'contacts') return <ContactsConsole {...props} />;
  if (props.section === 'groups') return <GroupsConsole {...props} />;
  const actions = buildActions(props);
  return (
    <>
      <ContextCard {...props} />
      {actions.map(action => (
        <EndpointAction
          key={`${action.method}:${action.path}:${action.label}`}
          action={action}
          run={props.run}
          refresh={props.section === 'groups' ? () => {
            props.refreshGroups();
            props.refreshChats();
          } : props.section === 'messages' ? props.refreshChats : undefined}
        />
      ))}
    </>
  );
}

function GroupActionRow({
  icon: Icon,
  title,
  description,
  busy = false,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full cursor-pointer items-center gap-4 border-b border-[#2d3036] px-4 py-4 text-left transition last:border-b-0 hover:bg-[#202421] disabled:cursor-wait disabled:opacity-75"
      onClick={onClick}
      disabled={busy}
    >
      <Icon size={21} className={`shrink-0 text-gray-300 ${busy ? 'animate-spin text-[#2edb5c]' : ''}`} />
      <span className="min-w-0 flex-1">
        <strong className="block truncate">{busy ? 'Atualizando...' : title}</strong>
        <span className="mt-1 block truncate text-sm text-gray-400">{description}</span>
      </span>
      {busy && <span className="h-2 w-2 shrink-0 rounded-full bg-[#2edb5c]" />}
    </button>
  );
}

function GroupSheetRow({
  icon: Icon,
  title,
  description,
  meta,
  danger = false,
  disabled = false,
  busy = false,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  meta?: string;
  danger?: boolean;
  disabled?: boolean;
  busy?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-5 px-6 py-4 text-left transition hover:bg-[#202221] disabled:cursor-not-allowed disabled:opacity-55 ${danger ? 'text-red-300' : 'text-gray-100'}`}
      onClick={onClick}
      disabled={disabled || busy}
    >
      <Icon size={22} className={`shrink-0 ${danger ? 'text-red-300' : busy ? 'animate-spin text-[#2edb5c]' : 'text-gray-400'}`} />
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-sm font-semibold">{busy ? 'Atualizando...' : title}</strong>
        {description && <span className="mt-0.5 block text-sm leading-5 text-gray-400">{description}</span>}
      </span>
      {meta && <span className="shrink-0 text-sm text-gray-400">{meta}</span>}
    </button>
  );
}

function GroupSheetToggle({
  icon,
  title,
  description,
  checked,
  busy,
  onToggle,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  checked: boolean;
  busy?: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-5 px-6 py-4">
      <div className="shrink-0">
        {(() => {
          const Icon = icon;
          return <Icon size={22} className={`${checked ? 'text-[#2edb5c]' : 'text-gray-400'} ${busy ? 'animate-pulse' : ''}`} />;
        })()}
      </div>
      <button type="button" className="min-w-0 flex-1 text-left disabled:cursor-wait disabled:opacity-70" onClick={() => onToggle(!checked)} disabled={busy}>
        <strong className="block truncate text-sm font-semibold">{title}</strong>
        <span className="mt-0.5 block text-sm leading-5 text-gray-400">{description}</span>
      </button>
      <Switch
        checked={checked}
        onCheckedChange={onToggle}
        disabled={busy}
        aria-label={title}
      />
    </div>
  );
}

function GroupSheetDivider() {
  return <div className="mx-6 border-t border-[#2d3036]" />;
}

const groupEphemeralOptions = [
  { label: 'Desativadas', detail: 'Sem apagar mensagens automaticamente', seconds: 0 },
  { label: '24 horas', detail: 'Apaga mensagens depois de 1 dia', seconds: 86_400 },
  { label: '7 dias', detail: 'Apaga mensagens depois de 1 semana', seconds: 604_800 },
  { label: '90 dias', detail: 'Apaga mensagens depois de 3 meses', seconds: 7_776_000 },
] as const;

function groupEphemeralLabel(seconds?: number | null) {
  const value = seconds ?? 0;
  const option = groupEphemeralOptions.find(item => item.seconds === value);
  if (option) return option.label;
  if (value <= 0) return 'Desativadas';
  if (value % 86_400 === 0) return `${value / 86_400} dias`;
  if (value % 3_600 === 0) return `${value / 3_600} horas`;
  return `${value} segundos`;
}

function GroupEphemeralSelect({
  value,
  busy,
  onSelect,
}: {
  value?: number | null;
  busy?: boolean;
  onSelect: (seconds: number) => void;
}) {
  const currentValue = value ?? 0;
  const currentLabel = groupEphemeralLabel(currentValue);

  return (
    <div className="flex w-full items-center gap-5 px-6 py-4 text-left transition hover:bg-[#202221]">
      <Timer size={22} className={`shrink-0 ${currentValue > 0 ? 'text-[#2edb5c]' : 'text-gray-400'} ${busy ? 'animate-pulse' : ''}`} />
      <div className="min-w-0 flex-1">
        <strong className="block truncate text-sm font-semibold">Mensagens temporarias</strong>
        <span className="mt-0.5 block text-sm leading-5 text-gray-400">{currentValue > 0 ? `Ativadas por ${currentLabel.toLowerCase()}` : 'Desativadas'}</span>
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-[#2d3036] bg-[#151820] px-3 text-sm font-semibold text-gray-100 transition hover:bg-[#202221] disabled:cursor-wait disabled:opacity-60"
            disabled={busy}
          >
            {currentLabel}
            <ChevronDown size={15} className="text-gray-400" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" side="bottom" className="w-72">
          {groupEphemeralOptions.map(option => (
            <PopoverClose asChild key={option.seconds}>
              <button
                type="button"
                className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-left transition hover:bg-[#2a2d2b] disabled:cursor-default ${option.seconds === currentValue ? 'text-[#2edb5c]' : 'text-gray-100'}`}
                disabled={busy || option.seconds === currentValue}
                onClick={() => onSelect(option.seconds)}
              >
                <Check size={17} className={option.seconds === currentValue ? 'opacity-100' : 'opacity-0'} />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{option.label}</span>
                  <span className="mt-0.5 block text-xs leading-4 text-gray-500">{option.detail}</span>
                </span>
              </button>
            </PopoverClose>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function GroupsConsole(props: ConsoleProps) {
  const { config, groups, selected, run, refreshChats, refreshGroups, contacts, onSaveContact } = props;
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [memberInput, setMemberInput] = useState('');
  const [selectedMemberPhones, setSelectedMemberPhones] = useState<string[]>([]);
  const [participantContact, setParticipantContact] = useState<{ name: string; phone: string; remoteJid: string } | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [actionError, setActionError] = useState('');
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const group = selected?.group
    ?? groups.find(item => item.remoteJid === selected?.remoteJid || item.id === selected?.id)
    ?? null;
  const activeGroupId = group?.id ?? 'GROUP_ID';
  const groupPath = (suffix: string) => instancePath(config, `/groups/${encode(activeGroupId)}${suffix}`);
  const participants = group?.participants ?? [];
  const participantPhones = participants.map(participant => participantCanUsePhone(participant.jid) ? jidToPhone(participant.jid) : '').filter(Boolean);
  const participantPhoneAliases = new Set(participantPhones.flatMap(phoneAliases));
  const availableContacts = contacts.filter(contact => contact.phone && !phoneAliases(contact.phone).some(alias => participantPhoneAliases.has(alias)));
  const currentInviteUrl = inviteUrl || (group?.inviteCode ? `https://chat.whatsapp.com/${group.inviteCode}` : '');

  function contactForPhone(phone: string) {
    const aliases = phoneAliases(phone);
    return contacts.find(contact => phoneAliases(contact.phone).some(alias => aliases.includes(alias))) ?? null;
  }

  useEffect(() => {
    setInviteUrl(group?.inviteCode ? `https://chat.whatsapp.com/${group.inviteCode}` : '');
  }, [group?.id, group?.inviteCode]);

  function operationResult(value: unknown): unknown {
    if (value && typeof value === 'object' && 'result' in value) return (value as { result?: unknown }).result;
    return value;
  }

  async function runGroupAction(key: string, input: Parameters<RunOperation>[0]) {
    setBusyAction(key);
    setActionError('');
    try {
      const result = await run({
        ...input,
        refresh: () => {
          refreshGroups();
          refreshChats();
        },
      });
      return operationResult(result);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Nao foi possivel executar a acao.');
      throw error;
    } finally {
      setBusyAction(null);
    }
  }

  async function updateGroupPhoto(file: File | undefined) {
    if (!file) return;
    const image = await fileToDataUrl(file);
    await runGroupAction('photo', {
      label: 'Atualizar foto do grupo',
      method: 'POST',
      path: groupPath('/photo'),
      payload: { image },
    });
  }

  async function saveGroupName() {
    const name = nameInput.trim();
    if (!name) return;
    await runGroupAction('name', {
      label: 'Atualizar nome do grupo',
      method: 'POST',
      path: groupPath('/name'),
      payload: { name },
    });
    setEditingName(false);
  }

  async function saveGroupDescription() {
    await runGroupAction('description', {
      label: 'Atualizar descricao do grupo',
      method: 'POST',
      path: groupPath('/description'),
      payload: { description: descriptionInput.trim() },
    });
    setEditingDescription(false);
  }

  async function addMember() {
    const manualPhones = memberInput.split(/[\n,; ]+/).map(item => item.trim()).filter(Boolean);
    const participants = [...new Set([...selectedMemberPhones, ...manualPhones])];
    if (participants.length === 0) return;
    await runGroupAction('add-member', {
      label: 'Adicionar membro',
      method: 'POST',
      path: groupPath('/participants/add'),
      payload: { participants, autoInvite: true },
    });
    setMemberInput('');
    setSelectedMemberPhones([]);
    setAddMemberOpen(false);
  }

  async function loadInviteLink() {
    const result = await runGroupAction('invite-link', { label: 'Link convite', method: 'GET', path: groupPath('/invite-link') });
    const url = result && typeof result === 'object' && 'url' in result ? String((result as { url?: unknown }).url ?? '') : '';
    if (url) {
      setInviteUrl(url);
    }
  }

  async function copyInviteLink() {
    if (!currentInviteUrl) return;
    await navigator.clipboard?.writeText(currentInviteUrl).catch(() => undefined);
  }

  async function revokeInviteLink() {
    const result = await runGroupAction('invite-link-revoke', {
      label: 'Redefinir link do grupo',
      method: 'POST',
      path: groupPath('/invite-link/revoke'),
      payload: {},
    });
    const url = result && typeof result === 'object' && 'url' in result ? String((result as { url?: unknown }).url ?? '') : '';
    setInviteUrl(url);
  }

  if (!group) {
    return (
      <div className="p-5">
        <Card title="Grupo">
          <p className="text-sm leading-5 text-gray-400">Selecione um grupo no chat para ver detalhes e configuracoes.</p>
        </Card>
        <div className="mt-4 overflow-hidden rounded-xl border border-[#2d3036]">
          <GroupActionRow
            icon={RefreshCw}
            title="Sincronizar grupos"
            description="Busca os grupos no WhatsApp para habilitar os controles"
            busy={busyAction === 'sync-all'}
            onClick={() => void runGroupAction('sync-all', {
              label: 'Sincronizar grupos',
              method: 'POST',
              path: instancePath(config, '/groups/sync'),
              payload: {},
            })}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="pb-8">
      <section className="px-6 py-7 text-center">
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={event => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            void updateGroupPhoto(file);
          }}
        />
        <div className="mx-auto flex max-w-sm flex-col items-center">
          <button
            type="button"
            className="group relative grid h-32 w-32 place-items-center overflow-hidden rounded-full bg-[#052033] text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
            onClick={() => photoInputRef.current?.click()}
            disabled={busyAction === 'photo'}
            title={group.pictureUrl ? 'Alterar foto do grupo' : 'Adicionar imagem do grupo'}
          >
            {group.pictureUrl ? (
              <>
                <img src={group.pictureUrl} alt="" className="h-full w-full rounded-full object-cover" />
                <span className="absolute inset-0 grid place-items-center rounded-full bg-black/40 text-xs font-semibold opacity-0 transition group-hover:opacity-100">
                  <span className="flex flex-col items-center gap-1 px-4">
                    <Camera size={20} />
                    {busyAction === 'photo' ? 'Atualizando foto' : 'Alterar foto'}
                  </span>
                </span>
              </>
            ) : (
              <span className="flex flex-col items-center gap-2 px-4 text-xs font-semibold">
                {busyAction === 'photo' ? <RefreshCw size={30} className="animate-spin text-[#2edb5c]" /> : <Camera size={24} className="text-[#d8f2ff]" />}
                {busyAction === 'photo' ? 'Atualizando foto' : 'Adicionar foto'}
              </span>
            )}
          </button>
        </div>
        {editingName ? (
          <form className="mx-auto mt-6 grid max-w-sm grid-cols-[minmax(0,1fr)_auto_auto] gap-2" onSubmit={event => {
            event.preventDefault();
            void saveGroupName();
          }}>
            <TextInput value={nameInput} onChange={event => setNameInput(event.target.value)} autoFocus />
            <PrimaryButton type="submit" className="h-11 px-3" disabled={busyAction === 'name'}>{busyAction === 'name' ? '...' : 'Salvar'}</PrimaryButton>
            <SecondaryButton type="button" className="h-11 px-3" onClick={() => setEditingName(false)}>X</SecondaryButton>
          </form>
        ) : (
          <div className="mt-6 flex items-center justify-center gap-2">
            <h2 className="min-w-0 truncate text-2xl font-semibold">{group.subject}</h2>
            <button
              type="button"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-gray-300 transition hover:bg-[#202221] hover:text-white"
              onClick={() => {
                setNameInput(group.subject);
                setEditingName(true);
              }}
              title="Editar nome do grupo"
            >
              <Edit3 size={18} />
            </button>
          </div>
        )}
        <p className="mt-1 text-sm text-gray-400">
          Grupo · <span className="font-semibold text-[#2edb5c]">{group.size ?? participants.length} membros</span>
        </p>
        <p className="mx-auto mt-1 max-w-[320px] truncate text-xs text-gray-500">{group.remoteJid}</p>
      </section>

      <GroupSheetDivider />

      <section className="py-2">
        {editingDescription ? (
          <form className="space-y-3 px-6 py-4" onSubmit={event => {
            event.preventDefault();
            void saveGroupDescription();
          }}>
            <textarea
              value={descriptionInput}
              onChange={event => setDescriptionInput(event.target.value)}
              autoFocus
              className="min-h-24 w-full resize-y rounded-lg border border-[#2d3036] bg-[#0b0f0f] px-3 py-3 text-sm text-gray-100 outline-none focus:border-[#2edb5c]"
              placeholder="Descricao do grupo"
            />
            <div className="grid grid-cols-2 gap-2">
              <SecondaryButton type="button" onClick={() => setEditingDescription(false)}>Cancelar</SecondaryButton>
              <PrimaryButton type="submit" disabled={busyAction === 'description'}>{busyAction === 'description' ? 'Salvando...' : 'Salvar'}</PrimaryButton>
            </div>
          </form>
        ) : group.description ? (
          <button
            type="button"
            className="flex w-full items-start justify-between gap-4 px-6 py-4 text-left transition hover:bg-[#202221]"
            onClick={() => {
              setDescriptionInput(group.description ?? '');
              setEditingDescription(true);
            }}
          >
            <p className="text-sm leading-5 text-gray-300">{group.description}</p>
            <Edit3 size={18} className="shrink-0 text-gray-400" />
          </button>
        ) : (
          <button
            type="button"
            className="w-full px-6 py-4 text-left text-sm font-semibold text-[#2edb5c] transition hover:bg-[#202221]"
            onClick={() => {
              setDescriptionInput('');
              setEditingDescription(true);
            }}
          >
            Adicionar descricao ao grupo
          </button>
        )}
      </section>

      <GroupSheetDivider />

      {actionError && (
        <>
          <section className="py-2">
            <p className="px-6 py-2 text-sm text-red-300">{actionError}</p>
          </section>
          <GroupSheetDivider />
        </>
      )}

      <section className="py-2">
        <GroupSheetRow
          icon={RefreshCw}
          title="Atualizar dados do grupo"
          description="Busca metadata, foto e participantes no WhatsApp"
          busy={busyAction === 'metadata-row'}
          onClick={() => void runGroupAction('metadata-row', {
            label: 'Atualizar dados do grupo',
            method: 'POST',
            path: groupPath('/metadata/sync'),
            payload: {},
          })}
        />
        <GroupSheetToggle
          icon={Users}
          title="So admins enviam"
          description={group.announce ? 'Restrito aos administradores' : 'Todos podem enviar mensagens'}
          checked={Boolean(group.announce)}
          busy={busyAction === 'messages'}
          onToggle={next => void runGroupAction('messages', {
            label: next ? 'So admins enviam' : 'Todos enviam mensagens',
            method: 'POST',
            path: groupPath('/settings'),
            payload: { messages: next ? 'admins' : 'all' },
          })}
        />
        <GroupSheetToggle
          icon={Info}
          title="So admins editam dados"
          description={group.restrict ? 'Nome, foto e descricao restritos' : 'Todos podem editar dados do grupo'}
          checked={Boolean(group.restrict)}
          busy={busyAction === 'info'}
          onToggle={next => void runGroupAction('info', {
            label: next ? 'So admins editam dados' : 'Todos editam dados',
            method: 'POST',
            path: groupPath('/settings'),
            payload: { info: next ? 'admins' : 'all' },
          })}
        />
        <GroupSheetToggle
          icon={Check}
          title="Aprovacao para entrar"
          description={group.joinApprovalMode ? 'Pedidos por link exigem aprovacao' : 'Entradas por link nao exigem aprovacao'}
          checked={Boolean(group.joinApprovalMode)}
          busy={busyAction === 'approval'}
          onToggle={next => void runGroupAction('approval', {
            label: next ? 'Ativar aprovacao' : 'Desativar aprovacao',
            method: 'POST',
            path: groupPath('/settings'),
            payload: { joinApproval: next },
          })}
        />
        <GroupSheetToggle
          icon={UserPlus}
          title="Membros podem adicionar pessoas"
          description={group.memberAddMode ? 'Todos podem adicionar membros' : 'Apenas admins podem adicionar membros'}
          checked={Boolean(group.memberAddMode)}
          busy={busyAction === 'addMembers'}
          onToggle={next => void runGroupAction('addMembers', {
            label: next ? 'Todos adicionam membros' : 'Apenas admins adicionam membros',
            method: 'POST',
            path: groupPath('/settings'),
            payload: { addMembers: next ? 'all' : 'admins' },
          })}
        />
        <GroupEphemeralSelect
          value={group.ephemeralDuration}
          busy={busyAction === 'ephemeral'}
          onSelect={seconds => void runGroupAction('ephemeral', {
            label: `Temporarias ${groupEphemeralLabel(seconds)}`,
            method: 'POST',
            path: groupPath('/settings'),
            payload: { ephemeralSeconds: seconds },
          })}
        />
      </section>

      <GroupSheetDivider />

      <section className="py-2">
        <div className="flex items-center justify-between px-6 py-3">
          <strong className="text-sm text-gray-400">{group.size ?? participants.length} membros</strong>
          <Search size={20} className="text-gray-400" />
        </div>
        <GroupSheetRow icon={UserPlus} title="Adicionar membro" onClick={() => setAddMemberOpen(true)} />
        <GroupSheetRow icon={Link} title={currentInviteUrl ? 'Link do grupo' : 'Convidar via link'} description={currentInviteUrl || 'Gerar link de convite'} busy={busyAction === 'invite-link'} onClick={() => void loadInviteLink()} />
        {currentInviteUrl && (
          <div className="mx-6 mb-3 grid grid-cols-2 gap-2">
            <button type="button" className="flex h-10 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#2d3036] px-3 text-sm text-gray-200 transition hover:bg-[#202221]" onClick={() => void copyInviteLink()}>
              <Copy size={16} className="shrink-0" />
              Copiar
            </button>
            <button type="button" className="flex h-10 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-red-500/25 px-3 text-sm text-red-300 transition hover:bg-red-500/10 disabled:cursor-wait disabled:opacity-60" disabled={busyAction === 'invite-link-revoke'} onClick={() => void revokeInviteLink()}>
              <RefreshCw size={16} className={`shrink-0 ${busyAction === 'invite-link-revoke' ? 'animate-spin' : ''}`} />
              Redefinir link
            </button>
          </div>
        )}
        {!currentInviteUrl && (
          <div className="mx-6 mb-3">
            <button type="button" className="flex h-10 w-full min-w-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-red-500/25 px-3 text-sm text-red-300 transition hover:bg-red-500/10 disabled:cursor-wait disabled:opacity-60" disabled={busyAction === 'invite-link-revoke'} onClick={() => void revokeInviteLink()}>
              <RefreshCw size={16} className={`shrink-0 ${busyAction === 'invite-link-revoke' ? 'animate-spin' : ''}`} />
              Redefinir e gerar link
            </button>
          </div>
        )}
        {participants.length === 0 ? (
          <p className="px-6 py-4 text-sm text-gray-500">Atualize os dados do grupo para carregar a lista.</p>
        ) : (
          <div>
            {participants.map(participant => {
              const phone = participantCanUsePhone(participant.jid) ? jidToPhone(participant.jid) : '';
              const savedContact = phone ? contactForPhone(phone) : null;
              const displayName = savedContact?.name || participant.name || phone || 'ID privado';
              return (
                <div key={participant.jid} className="flex items-center gap-4 px-6 py-3 transition hover:bg-[#202221]">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#2a2f38] text-sm font-semibold text-gray-100">
                    {displayName !== 'ID privado' ? displayName.slice(0, 1).toUpperCase() : <Users size={18} />}
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <strong className="block truncate text-sm">{displayName}</strong>
                    <p className="mt-0.5 truncate text-xs text-gray-500">{phone || 'ID privado do WhatsApp'}</p>
                  </div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-[#2a2d2b]" aria-label={`Acoes de ${participant.name || phone || 'membro'}`}>
                        {(participant.isSuperAdmin || participant.isAdmin) && (
                          <span className="rounded-md bg-[#145333] px-2 py-1 text-xs font-semibold text-[#b9f6ce]">{participant.isSuperAdmin ? 'Dono' : 'Admin'}</span>
                        )}
                        <ChevronDown size={16} className="text-gray-400" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" side="bottom" sideOffset={8}>
                      {participant.isSuperAdmin ? (
                        <div className="px-4 py-3 text-sm text-gray-500">Dono do grupo</div>
                      ) : (
                        <>
                          {phone && (
                            <PopoverClose asChild>
                              <button
                                type="button"
                                className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-4 py-3 text-left text-sm text-gray-200 transition hover:bg-[#2a2d2b]"
                                onClick={() => setParticipantContact({ name: savedContact?.name || participant.name || phone, phone, remoteJid: participant.jid })}
                              >
                                <Edit3 size={18} className="text-gray-400" />
                                {savedContact ? 'Editar contato' : 'Salvar contato'}
                              </button>
                            </PopoverClose>
                          )}
                          <PopoverClose asChild>
                            <button
                              type="button"
                              className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-4 py-3 text-left text-sm text-gray-200 transition hover:bg-[#2a2d2b] disabled:cursor-wait disabled:opacity-60"
                              disabled={busyAction === `admin-${participant.jid}`}
                              onClick={() => {
                                void runGroupAction(`admin-${participant.jid}`, {
                                  label: participant.isAdmin ? 'Remover admin' : 'Promover admin',
                                  method: 'POST',
                                  path: groupPath(participant.isAdmin ? '/admins/demote' : '/admins/promote'),
                                  payload: { participants: [participant.jid] },
                                });
                              }}
                            >
                              <ShieldCheck size={18} className="text-gray-400" />
                              {participant.isAdmin ? 'Remover de admin' : 'Promover a admin'}
                            </button>
                          </PopoverClose>
                          <PopoverClose asChild>
                            <button
                              type="button"
                              className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-4 py-3 text-left text-sm text-red-300 transition hover:bg-red-500/10 disabled:cursor-wait disabled:opacity-60"
                              disabled={busyAction === `remove-${participant.jid}`}
                              onClick={() => {
                                void runGroupAction(`remove-${participant.jid}`, {
                                  label: 'Remover participante',
                                  method: 'POST',
                                  path: groupPath('/participants/remove'),
                                  payload: { participants: [participant.jid] },
                                });
                              }}
                            >
                              <UserMinus size={18} />
                              Remover do grupo
                            </button>
                          </PopoverClose>
                        </>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
              );
            })}
          </div>
        )}
      </section>
      {addMemberOpen && (
        <Modal title="Adicionar membro" onClose={() => setAddMemberOpen(false)}>
          <form className="space-y-4" onSubmit={event => {
            event.preventDefault();
            void addMember();
          }}>
            <div>
              <p className="mb-2 text-sm font-medium text-gray-300">Selecionar contatos</p>
              <div className="ravox-scrollbar max-h-64 overflow-auto rounded-xl border border-[#2d3036]">
                {availableContacts.length === 0 ? (
                  <p className="px-4 py-5 text-sm text-gray-500">Nenhum contato salvo fora deste grupo.</p>
                ) : availableContacts.map(contact => {
                  const checked = selectedMemberPhones.includes(contact.phone);
                  return (
                    <button
                      key={contact.remoteJid}
                      type="button"
                      className={`flex w-full cursor-pointer items-center gap-3 border-b border-[#2d3036] px-4 py-3 text-left transition last:border-b-0 hover:bg-[#202221] ${checked ? 'bg-[#0b2415]' : ''}`}
                      onClick={() => setSelectedMemberPhones(current => current.includes(contact.phone) ? current.filter(phone => phone !== contact.phone) : [...current, contact.phone])}
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#2a2f38] text-sm font-semibold text-gray-100">{contact.name.slice(0, 1).toUpperCase()}</span>
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm">{contact.name}</strong>
                        <span className="mt-0.5 block truncate text-xs text-gray-500">{contact.phone}</span>
                      </span>
                      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${checked ? 'border-[#2edb5c] bg-[#123d24] text-[#2edb5c]' : 'border-[#454b54] text-transparent'}`}>
                        <Check size={13} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <Field label="Adicionar por numero">
              <textarea
                value={memberInput}
                onChange={event => setMemberInput(event.target.value)}
                className="min-h-24 w-full resize-y rounded-lg border border-[#2d3036] bg-[#0b0f0f] px-3 py-3 text-sm text-gray-100 outline-none transition placeholder:text-gray-500 focus:border-[#2edb5c]"
                placeholder="5585999999999&#10;5585888888888"
              />
            </Field>
            <p className="text-xs leading-5 text-gray-500">Selecionados: {selectedMemberPhones.length}. Tambem pode colar varios numeros separados por espaco, virgula ou quebra de linha.</p>
            <div className="grid grid-cols-2 gap-2">
              <SecondaryButton type="button" onClick={() => setAddMemberOpen(false)}>Cancelar</SecondaryButton>
              <PrimaryButton type="submit" disabled={busyAction === 'add-member' || (selectedMemberPhones.length === 0 && memberInput.trim().length === 0)}>{busyAction === 'add-member' ? 'Adicionando...' : 'Adicionar'}</PrimaryButton>
            </div>
          </form>
        </Modal>
      )}
      {participantContact && (
        <Modal title="Contato" onClose={() => setParticipantContact(null)}>
          <form className="space-y-4" onSubmit={event => {
            event.preventDefault();
            const name = participantContact.name.trim() || participantContact.phone;
            onSaveContact({ name, phone: participantContact.phone, remoteJid: participantContact.remoteJid });
            setParticipantContact(null);
          }}>
            <Field label="Nome">
              <TextInput value={participantContact.name} onChange={event => setParticipantContact(current => current ? { ...current, name: event.target.value } : current)} autoFocus />
            </Field>
            <Field label="Telefone">
              <TextInput value={participantContact.phone} readOnly />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <SecondaryButton type="button" onClick={() => setParticipantContact(null)}>Cancelar</SecondaryButton>
              <PrimaryButton type="submit">Salvar</PrimaryButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function ContextCard({ selected, groups, rows, section }: ConsoleProps) {
  const phones = rows.filter(row => row.kind !== 'group' && participantCanUsePhone(row.remoteJid)).length;
  return (
    <Card title="Contexto">
      <p className="text-sm text-gray-400">Selecionado: {selected?.title ?? 'nenhum'}</p>
      <p className="truncate text-xs text-gray-500">{selected?.remoteJid ?? 'Escolha um chat para preencher exemplos.'}</p>
      {section === 'groups' && <p className="text-xs text-gray-500">{groups.length} grupos sincronizados · {phones} contatos com telefone real</p>}
    </Card>
  );
}

function buildActions({ config, selected, groups, section }: ConsoleProps): ActionDef[] {
  const target = selected?.remoteJid ?? '5585999999999';
  const phone = jidToPhone(target) || '5585999999999';
  const group = selected?.group ?? groups[0];
  const groupId = group?.id ?? 'GROUP_ID';
  const communityId = 'COMMUNITY_ID';
  const newsletterId = 'NEWSLETTER_ID';

  if (selected?.remoteJid.includes('@lid')) {
    // Keep examples safe: private IDs can receive messages, but phone-only participant actions should be explicit.
  }

  const bySection: Record<Exclude<ConsoleSection, 'queue' | 'operations' | 'contacts'>, ActionDef[]> = {
    messages: [
      { label: 'Enviar localizacao', method: 'POST', path: instancePath(config, '/send-location'), payload: { to: target, latitude: -3.7319, longitude: -38.5267, name: 'Fortaleza' } },
      { label: 'Enviar contato', method: 'POST', path: instancePath(config, '/send-contact'), payload: { to: target, contact: { displayName: 'Contato teste', phone } } },
      { label: 'Enviar contatos', method: 'POST', path: instancePath(config, '/send-contacts'), payload: { to: target, contacts: [{ displayName: 'Contato 1', phone }] } },
      { label: 'Enviar sticker', method: 'POST', path: instancePath(config, '/send-sticker'), payload: { to: target, sticker: 'https://example.com/sticker.webp' } },
      { label: 'Enviar GIF', method: 'POST', path: instancePath(config, '/send-gif'), payload: { to: target, gif: 'https://example.com/anim.gif', caption: 'GIF' } },
      { label: 'Enviar link', method: 'POST', path: instancePath(config, '/send-link'), payload: { to: target, url: 'https://ravoxzap.local', text: 'Veja isso' } },
      { label: 'Enviar enquete', method: 'POST', path: instancePath(config, '/send-poll'), payload: { to: target, name: 'Escolha', options: ['Sim', 'Nao'], selectableCount: 1 } },
      { label: 'Enviar PTV', method: 'POST', path: instancePath(config, '/send-ptv'), payload: { to: target, video: 'https://example.com/video.mp4' } },
      { label: 'Reagir mensagem', method: 'POST', path: instancePath(config, '/send-reaction'), payload: { remoteJid: target, messageId: 'MESSAGE_ID', emoji: '👍' } },
      { label: 'Remover reacao', method: 'POST', path: instancePath(config, '/remove-reaction'), payload: { remoteJid: target, messageId: 'MESSAGE_ID' } },
      { label: 'Responder mensagem', method: 'POST', path: instancePath(config, '/messages/reply'), payload: { to: target, text: 'Resposta', messageId: 'MESSAGE_ID' } },
      { label: 'Encaminhar mensagem', method: 'POST', path: instancePath(config, '/messages/forward'), payload: { to: target, message: {} } },
      { label: 'Apagar mensagem', method: 'POST', path: instancePath(config, '/messages/delete'), payload: { remoteJid: target, messageId: 'MESSAGE_ID', fromMe: true } },
      { label: 'Marcar mensagem lida', method: 'POST', path: instancePath(config, '/messages/read'), payload: { remoteJid: target, messageId: 'MESSAGE_ID' } },
      { label: 'Fixar mensagem', method: 'POST', path: instancePath(config, '/messages/pin'), payload: { remoteJid: target, messageId: 'MESSAGE_ID', type: 1, time: 86400 } },
      { label: 'Votar em enquete', method: 'POST', path: instancePath(config, '/send-poll-vote'), blocked: 'O adapter atual nao envia voto de enquete com seguranca.' },
    ],
    groups: [
      { label: 'Sincronizar grupos', method: 'POST', path: instancePath(config, '/groups/sync'), payload: {} },
      { label: 'Criar grupo', method: 'POST', path: instancePath(config, '/groups'), payload: { name: 'Novo grupo', participants: [phone], autoInvite: true } },
      { label: 'Aceitar convite', method: 'POST', path: instancePath(config, '/groups/invite/accept'), payload: { url: 'https://chat.whatsapp.com/CODE' } },
      { label: 'Metadata convite', method: 'POST', path: instancePath(config, '/groups/invite/metadata'), payload: { url: 'https://chat.whatsapp.com/CODE' } },
      { label: 'Metadata light', method: 'GET', path: instancePath(config, `/groups/${encode(groupId)}/metadata/light`) },
      { label: 'Sync metadata live', method: 'POST', path: instancePath(config, `/groups/${encode(groupId)}/metadata/sync`), payload: {} },
      { label: 'Atualizar nome', method: 'POST', path: instancePath(config, `/groups/${encode(groupId)}/name`), payload: { name: group?.subject ?? 'Novo nome' } },
      { label: 'Atualizar descricao', method: 'POST', path: instancePath(config, `/groups/${encode(groupId)}/description`), payload: { description: 'Descricao' } },
      { label: 'Atualizar foto', method: 'POST', path: instancePath(config, `/groups/${encode(groupId)}/photo`), payload: { image: 'https://example.com/photo.jpg' } },
      { label: 'Adicionar participantes', method: 'POST', path: instancePath(config, `/groups/${encode(groupId)}/participants/add`), payload: { participants: [phone], autoInvite: true } },
      { label: 'Remover participantes', method: 'POST', path: instancePath(config, `/groups/${encode(groupId)}/participants/remove`), payload: { participants: [phone] } },
      { label: 'Listar solicitacoes', method: 'POST', path: instancePath(config, `/groups/${encode(groupId)}/requests/list`), payload: {} },
      { label: 'Aprovar solicitacoes', method: 'POST', path: instancePath(config, `/groups/${encode(groupId)}/requests/approve`), payload: { participants: [phone] } },
      { label: 'Rejeitar solicitacoes', method: 'POST', path: instancePath(config, `/groups/${encode(groupId)}/requests/reject`), payload: { participants: [phone] } },
      { label: 'Promover admin', method: 'POST', path: instancePath(config, `/groups/${encode(groupId)}/admins/promote`), payload: { participants: [phone] } },
      { label: 'Remover admin', method: 'POST', path: instancePath(config, `/groups/${encode(groupId)}/admins/demote`), payload: { participants: [phone] } },
      { label: 'Mencionar participantes', method: 'POST', path: instancePath(config, `/groups/${encode(groupId)}/mention`), payload: { text: 'Ola', participants: [phone] } },
      { label: 'Mencionar todos', method: 'POST', path: instancePath(config, `/groups/${encode(groupId)}/mention-all`), payload: { text: 'Ola, todos' } },
      { label: 'Mencionar outro grupo', method: 'POST', path: instancePath(config, `/groups/${encode(groupId)}/mention-group`), payload: { text: 'Grupo', groups: [group?.remoteJid ?? 'GROUP_JID'] } },
      { label: 'Configuracoes completas', method: 'POST', path: instancePath(config, `/groups/${encode(groupId)}/settings`), payload: { messages: 'admins', info: 'admins', addMembers: 'admins', joinApproval: true, ephemeralSeconds: 86400 } },
      { label: 'Sair do grupo', method: 'POST', path: instancePath(config, `/groups/${encode(groupId)}/leave`), payload: {} },
      { label: 'Link convite', method: 'GET', path: instancePath(config, `/groups/${encode(groupId)}/invite-link`) },
      { label: 'Renovar convite', method: 'POST', path: instancePath(config, `/groups/${encode(groupId)}/invite-link/revoke`), payload: {} },
    ],
    status: [
      { label: 'Enviar status texto', method: 'POST', path: instancePath(config, '/status/send-text'), payload: { text: 'Status RavoxZap', recipients: [] } },
      { label: 'Enviar status imagem', method: 'POST', path: instancePath(config, '/status/send-image'), payload: { image: 'https://example.com/image.jpg', caption: 'Imagem' } },
      { label: 'Enviar status video', method: 'POST', path: instancePath(config, '/status/send-video'), payload: { video: 'https://example.com/video.mp4', caption: 'Video' } },
      { label: 'Responder status texto', method: 'POST', path: instancePath(config, '/status/reply-text'), payload: { statusJid: phone, messageId: 'MESSAGE_ID', text: 'Resposta' } },
      { label: 'Responder status sticker', method: 'POST', path: instancePath(config, '/status/reply-sticker'), payload: { statusJid: phone, messageId: 'MESSAGE_ID', sticker: 'https://example.com/sticker.webp' } },
      { label: 'Responder status GIF', method: 'POST', path: instancePath(config, '/status/reply-gif'), payload: { statusJid: phone, messageId: 'MESSAGE_ID', gif: 'https://example.com/anim.gif' } },
    ],
    profile: [
      { label: 'Me', method: 'GET', path: instancePath(config, '/me') },
      { label: 'Device', method: 'GET', path: instancePath(config, '/device') },
      { label: 'Pairing code', method: 'POST', path: instancePath(config, '/pairing-code'), payload: { phone } },
      { label: 'Atualizar nome', method: 'POST', path: instancePath(config, '/profile/name'), payload: { name: 'RavoxZap' } },
      { label: 'Atualizar recado', method: 'POST', path: instancePath(config, '/profile/description'), payload: { description: 'Atendimento via RavoxZap' } },
      { label: 'Atualizar foto', method: 'POST', path: instancePath(config, '/profile/picture'), payload: { image: 'https://example.com/photo.jpg' } },
      { label: 'Remover foto', method: 'POST', path: instancePath(config, '/profile/picture/remove'), payload: {} },
    ],
    privacy: [
      { label: 'Privacidade atual', method: 'GET', path: instancePath(config, '/privacy') },
      { label: 'Blacklist', method: 'GET', path: instancePath(config, '/privacy/blocklist') },
      { label: 'Visto por ultimo', method: 'POST', path: instancePath(config, '/privacy/last-seen'), payload: { value: 'contacts' } },
      { label: 'Online', method: 'POST', path: instancePath(config, '/privacy/online'), payload: { value: 'match_last_seen' } },
      { label: 'Foto de perfil', method: 'POST', path: instancePath(config, '/privacy/profile-picture'), payload: { value: 'contacts' } },
      { label: 'Recado/status', method: 'POST', path: instancePath(config, '/privacy/status'), payload: { value: 'contacts' } },
      { label: 'Confirmacoes de leitura', method: 'POST', path: instancePath(config, '/privacy/read-receipts'), payload: { value: 'all' } },
      { label: 'Adicionar em grupos', method: 'POST', path: instancePath(config, '/privacy/group-add'), payload: { value: 'contacts' } },
      { label: 'Temporarias padrao', method: 'POST', path: instancePath(config, '/privacy/default-disappearing'), payload: { duration: 0 } },
    ],
    communities: [
      { label: 'Sync/listar comunidades', method: 'POST', path: instancePath(config, '/communities/sync'), payload: {} },
      { label: 'Criar comunidade', method: 'POST', path: instancePath(config, '/communities'), payload: { name: 'Comunidade', description: 'Descricao' } },
      { label: 'Aceitar convite comunidade', method: 'POST', path: instancePath(config, '/communities/invite/accept'), payload: { url: 'https://chat.whatsapp.com/CODE' } },
      { label: 'Metadata comunidade', method: 'GET', path: instancePath(config, `/communities/${encode(communityId)}`) },
      { label: 'Nome comunidade', method: 'POST', path: instancePath(config, `/communities/${encode(communityId)}/name`), payload: { name: 'Novo nome' } },
      { label: 'Descricao comunidade', method: 'POST', path: instancePath(config, `/communities/${encode(communityId)}/description`), payload: { description: 'Descricao' } },
      { label: 'Config comunidade', method: 'POST', path: instancePath(config, `/communities/${encode(communityId)}/settings`), payload: { messages: 'admins', info: 'admins', addMembers: 'admins', joinApproval: true } },
      { label: 'Add participantes', method: 'POST', path: instancePath(config, `/communities/${encode(communityId)}/participants/add`), payload: { participants: [phone] } },
      { label: 'Remover participantes', method: 'POST', path: instancePath(config, `/communities/${encode(communityId)}/participants/remove`), payload: { participants: [phone] } },
      { label: 'Promover admin', method: 'POST', path: instancePath(config, `/communities/${encode(communityId)}/admins/promote`), payload: { participants: [phone] } },
      { label: 'Remover admin', method: 'POST', path: instancePath(config, `/communities/${encode(communityId)}/admins/demote`), payload: { participants: [phone] } },
      { label: 'Vincular grupos', method: 'POST', path: instancePath(config, `/communities/${encode(communityId)}/groups/link`), payload: { groups: [group?.remoteJid ?? 'GROUP_JID'] } },
      { label: 'Desvincular grupos', method: 'POST', path: instancePath(config, `/communities/${encode(communityId)}/groups/unlink`), payload: { groups: [group?.remoteJid ?? 'GROUP_JID'] } },
      { label: 'Convite comunidade', method: 'GET', path: instancePath(config, `/communities/${encode(communityId)}/invite-link`) },
      { label: 'Renovar convite comunidade', method: 'POST', path: instancePath(config, `/communities/${encode(communityId)}/invite-link/revoke`), payload: {} },
    ],
    newsletters: [
      { label: 'Listar canais', method: 'GET', path: instancePath(config, '/newsletters') },
      { label: 'Criar canal', method: 'POST', path: instancePath(config, '/newsletters'), payload: { name: 'Canal', description: 'Descricao' } },
      { label: 'Busca publica de canais', method: 'POST', path: instancePath(config, '/newsletters/search'), blocked: 'Busca publica de canais nao e suportada com seguranca pelo adapter atual.' },
      { label: 'Metadata canal', method: 'GET', path: instancePath(config, `/newsletters/${encode(newsletterId)}`) },
      { label: 'Seguir canal', method: 'POST', path: instancePath(config, `/newsletters/${encode(newsletterId)}/follow`), payload: {} },
      { label: 'Deixar de seguir', method: 'POST', path: instancePath(config, `/newsletters/${encode(newsletterId)}/unfollow`), payload: {} },
      { label: 'Mutar canal', method: 'POST', path: instancePath(config, `/newsletters/${encode(newsletterId)}/mute`), payload: {} },
      { label: 'Desmutar canal', method: 'POST', path: instancePath(config, `/newsletters/${encode(newsletterId)}/unmute`), payload: {} },
      { label: 'Atualizar nome canal', method: 'POST', path: instancePath(config, `/newsletters/${encode(newsletterId)}/name`), payload: { name: 'Novo nome' } },
      { label: 'Atualizar descricao canal', method: 'POST', path: instancePath(config, `/newsletters/${encode(newsletterId)}/description`), payload: { description: 'Descricao' } },
      { label: 'Atualizar foto canal', method: 'POST', path: instancePath(config, `/newsletters/${encode(newsletterId)}/picture`), payload: { image: 'https://example.com/photo.jpg' } },
      { label: 'Aceitar convite admin', method: 'POST', path: instancePath(config, `/newsletters/${encode(newsletterId)}/admin-invite/accept`), blocked: 'Exige payload de mensagem de convite e fica bloqueado na UI.' },
      { label: 'Revogar convite admin', method: 'POST', path: instancePath(config, `/newsletters/${encode(newsletterId)}/admin-invite/revoke`), payload: { phone } },
      { label: 'Remover admin', method: 'POST', path: instancePath(config, `/newsletters/${encode(newsletterId)}/admins/remove`), payload: { phone } },
      { label: 'Transferir propriedade', method: 'POST', path: instancePath(config, `/newsletters/${encode(newsletterId)}/transfer-ownership`), payload: { phone } },
      { label: 'Reagir mensagem canal', method: 'POST', path: instancePath(config, `/newsletters/${encode(newsletterId)}/messages/react`), payload: { serverId: 'MESSAGE_ID', reaction: '👍' } },
      { label: 'Buscar mensagens canal', method: 'GET', path: instancePath(config, `/newsletters/${encode(newsletterId)}/messages?count=20`) },
    ],
    business: [
      { label: 'Perfil business', method: 'GET', path: instancePath(config, `/business/profile?phone=${phone}`) },
      { label: 'Atualizar perfil business', method: 'PATCH', path: instancePath(config, '/business/profile'), payload: { updates: {} } },
      { label: 'Listar produtos', method: 'GET', path: instancePath(config, `/business/products?phone=${phone}&limit=20`) },
      { label: 'Buscar produto', method: 'GET', path: instancePath(config, '/business/products/PRODUCT_ID') },
      { label: 'Criar produto', method: 'POST', path: instancePath(config, '/business/products'), payload: { product: {} } },
      { label: 'Editar produto', method: 'PATCH', path: instancePath(config, '/business/products/PRODUCT_ID'), payload: { product: {} } },
      { label: 'Deletar produto', method: 'DELETE', path: instancePath(config, '/business/products/PRODUCT_ID') },
      { label: 'Listar colecoes', method: 'GET', path: instancePath(config, `/business/collections?phone=${phone}&limit=20`) },
      { label: 'Criar etiqueta', method: 'POST', path: instancePath(config, '/business/tags'), payload: { name: 'Etiqueta' } },
      { label: 'Editar etiqueta', method: 'PATCH', path: instancePath(config, '/business/tags/TAG_ID'), payload: { name: 'Etiqueta' } },
      { label: 'Deletar etiqueta', method: 'DELETE', path: instancePath(config, '/business/tags/TAG_ID') },
      { label: 'Atribuir etiqueta em chat', method: 'POST', path: instancePath(config, '/business/tags/TAG_ID/chats/add'), payload: { to: target } },
      { label: 'Remover etiqueta de chat', method: 'POST', path: instancePath(config, '/business/tags/TAG_ID/chats/remove'), payload: { to: target } },
    ],
  };
  return section === 'contacts' || section === 'queue' || section === 'operations' ? [] : bySection[section];
}

function ContactsConsole({ config, contacts, selected, run, onSaveContact, onRemoveContact }: ConsoleProps) {
  const [phone, setPhone] = useState(jidToPhone(selected?.remoteJid ?? '') || '5585999999999');
  const [name, setName] = useState(selected?.title ?? '');
  const [batch, setBatch] = useState('');
  const remoteJid = phone ? `${phone.replace(/\D/g, '')}@s.whatsapp.net` : '';
  return (
    <>
      <Card title="Contato local">
        <TextInput value={name} onChange={event => setName(event.target.value)} placeholder="Nome" />
        <TextInput value={phone} onChange={event => setPhone(event.target.value)} placeholder="Telefone" />
        <div className="grid grid-cols-2 gap-2">
          <PrimaryButton type="button" onClick={() => remoteJid && name.trim() && onSaveContact({ name: name.trim(), phone: phone.replace(/\D/g, ''), remoteJid })}>Salvar local</PrimaryButton>
          <SecondaryButton type="button" onClick={() => remoteJid && onRemoveContact(remoteJid)}>Remover local</SecondaryButton>
        </div>
      </Card>
      <EndpointAction action={{ label: 'Verificar numero', method: 'POST', path: instancePath(config, '/contacts/check'), payload: { phone } }} run={run} />
      <EndpointAction action={{ label: 'Verificar lote', method: 'POST', path: instancePath(config, '/contacts/check-batch'), payload: { phones: batch.split('\n').map(item => item.trim()).filter(Boolean) } }} run={run} />
      <Field label="Lote de telefones"><TextInput value={batch} onChange={event => setBatch(event.target.value)} placeholder="5585... 5581..." /></Field>
      {[
        { label: 'Buscar metadata', method: 'GET', path: instancePath(config, `/contacts/${encode(phone)}/metadata`) },
        { label: 'Buscar foto', method: 'GET', path: instancePath(config, `/contacts/${encode(phone)}/profile-picture`) },
        { label: 'Adicionar na agenda WhatsApp', method: 'POST', path: instancePath(config, '/contacts'), payload: { phone, name } },
        { label: 'Remover da agenda WhatsApp', method: 'DELETE', path: instancePath(config, `/contacts/${encode(phone)}`) },
        { label: 'Bloquear contato', method: 'POST', path: instancePath(config, `/contacts/${encode(phone)}/block`), payload: {} },
        { label: 'Desbloquear contato', method: 'POST', path: instancePath(config, `/contacts/${encode(phone)}/unblock`), payload: {} },
      ].map(action => <EndpointAction key={action.label} action={action} run={run} />)}
      <BlockedAction title="Denunciar contato" reason="Denuncia nao e suportada com seguranca pelo adapter atual." />
      <Card title={`${contacts.length} contatos locais`}>
        {contacts.map(contact => <p key={contact.remoteJid} className="rounded-lg bg-[#181b20] p-2 text-sm">{contact.name} · {contact.phone}</p>)}
      </Card>
    </>
  );
}

function QueueConsole({ config }: ConsoleProps) {
  const queryClient = useQueryClient();
  const queue = useQuery({ queryKey: ['queue', config.apiBaseUrl, config.instanceId], queryFn: () => publicClient.queue(config), refetchInterval: 10000 });
  const settings = useQuery({ queryKey: ['queue-settings', config.apiBaseUrl, config.instanceId], queryFn: () => publicClient.queueSettings(config) });
  const items = queue.data ?? [];
  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['queue', config.apiBaseUrl, config.instanceId] });
    await queryClient.invalidateQueries({ queryKey: ['queue-settings', config.apiBaseUrl, config.instanceId] });
  }
  async function remove(item: QueueItem) {
    if (!item.id) return;
    await publicClient.queueRemove(config, item.id);
    await refresh();
  }
  async function clear() {
    await publicClient.queueClear(config);
    await refresh();
  }
  return (
    <>
      <Card title="Fila">
        <div className="grid grid-cols-2 gap-2">
          <SecondaryButton type="button" onClick={() => void refresh()}>Atualizar</SecondaryButton>
          <SecondaryButton type="button" onClick={() => void clear()}>Limpar fila</SecondaryButton>
        </div>
        {settings.data && <JsonResult value={settings.data} />}
      </Card>
      <Card title={`${items.length} itens`}>
        {items.length === 0 ? <p className="text-sm text-gray-500">Fila vazia.</p> : items.map(item => (
          <div key={`${item.queue}-${item.id}`} className="rounded-lg bg-[#181b20] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <strong className="truncate text-sm">{item.name}</strong>
              <SecondaryButton type="button" className="h-8 px-2 text-xs" onClick={() => void remove(item)}>Remover</SecondaryButton>
            </div>
            <p className="truncate font-mono text-xs text-gray-500">{item.queue} · {item.id}</p>
            <JsonResult value={item.data} />
          </div>
        ))}
      </Card>
    </>
  );
}
