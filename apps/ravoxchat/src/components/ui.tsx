import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { Check, File as FileIcon, Pause, Play, Users, X, type LucideIcon } from 'lucide-react';
import { type ComponentProps, type FormEvent, type MouseEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import type { InboxRow, Message, RavoxChatConfig } from '../types';
import { cleanBaseUrl, formatMessageTime, initials } from '../lib/utils';

export function IconButton({ icon: Icon, label, active = false, disabled = false, danger = false, onClick }: { icon: LucideIcon; label: string; active?: boolean; disabled?: boolean; danger?: boolean; onClick?: () => void }) {
  return (
    <button type="button" className={`flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-45 ${active ? 'bg-[#123d24] text-[#2edb5c]' : danger ? 'text-red-300 hover:bg-red-500/10' : 'text-gray-300 hover:bg-[#202221] hover:text-white'}`} disabled={disabled} onClick={onClick} title={label} aria-label={label}>
      <Icon size={19} />
    </button>
  );
}

export function MenuButton({ icon: Icon, label, detail, danger = false, disabled = false, onClick }: { icon: LucideIcon; label: string; detail?: string; danger?: boolean; disabled?: boolean; onClick?: () => void }) {
  return (
    <button type="button" className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-[#2a2d2b] disabled:cursor-not-allowed disabled:opacity-45 ${danger ? 'text-red-300' : 'text-gray-100'}`} onClick={onClick} disabled={disabled} title={detail}>
      <Icon size={17} />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {detail && <span className="block truncate text-xs text-gray-500">{detail}</span>}
      </span>
    </button>
  );
}

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;

export function PopoverContent({
  className = '',
  align = 'end',
  sideOffset = 8,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={`z-[70] w-72 overflow-hidden rounded-xl border border-[#2d3036] bg-[#1f2128] p-2 text-gray-100 shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1 ${className}`}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export function Switch({ className = '', ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={`peer inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-[#20242b] p-0.5 shadow-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#2edb5c]/45 disabled:cursor-not-allowed disabled:opacity-55 data-[state=checked]:border-[#2edb5c] data-[state=checked]:bg-[#123d24] data-[state=unchecked]:border-[#454b54] ${className}`}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block h-5.5 w-5.5 rounded-full bg-gray-400 shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=checked]:bg-[#2edb5c] data-[state=unchecked]:translate-x-0" />
    </SwitchPrimitive.Root>
  );
}

export const RadioGroup = RadioGroupPrimitive.Root;

export function RadioGroupItem({ className = '', ...props }: ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      className={`grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded-full border border-[#454b54] bg-[#111318] outline-none transition focus-visible:ring-2 focus-visible:ring-[#2edb5c]/45 data-[state=checked]:border-[#d9dde2] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="h-2.5 w-2.5 rounded-full bg-[#d9dde2]" />
    </RadioGroupPrimitive.Item>
  );
}

export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className={`max-h-[92dvh] w-full overflow-auto rounded-2xl border border-[#2d3036] bg-[#181a21] p-5 shadow-2xl ${wide ? 'max-w-3xl' : 'max-w-md'}`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="min-w-0 truncate text-lg font-semibold">{title}</h2>
          <button type="button" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-gray-400 transition hover:bg-[#202221] hover:text-white" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Sheet({ title, subtitle, children, onClose }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/45">
      <button type="button" className="min-w-0 flex-1 cursor-default" aria-label="Fechar painel" onClick={onClose} />
      <aside className="flex h-full w-full max-w-[480px] min-w-0 flex-col border-l border-[#2d3036] bg-[#111318] shadow-2xl">
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-[#2d3036] px-5">
          <button type="button" className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full text-gray-200 transition hover:bg-[#202221]" onClick={onClose} aria-label="Fechar">
            <X size={20} />
          </button>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{title}</h2>
            {subtitle && <p className="truncate text-xs text-gray-500">{subtitle}</p>}
          </div>
        </header>
        <div className="ravox-scrollbar min-h-0 flex-1 overflow-auto">{children}</div>
      </aside>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-gray-300">{label}</span>
      {children}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`h-11 w-full rounded-lg border border-[#2d3036] bg-[#0b0f0f] px-3 text-gray-100 outline-none transition placeholder:text-gray-500 focus:border-[#2edb5c] ${props.className ?? ''}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`min-h-28 w-full resize-y rounded-lg border border-[#2d3036] bg-[#0b0f0f] px-3 py-3 text-gray-100 outline-none transition placeholder:text-gray-500 focus:border-[#2edb5c] ${props.className ?? ''}`} />;
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`h-11 w-full rounded-lg border border-[#2d3036] bg-[#0b0f0f] px-3 text-gray-100 outline-none transition focus:border-[#2edb5c] ${props.className ?? ''}`} />;
}

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`h-11 cursor-pointer rounded-lg bg-[#2edb5c] px-4 font-medium text-[#0b0c11] transition hover:bg-[#25c452] disabled:cursor-not-allowed disabled:opacity-50 ${props.className ?? ''}`} />;
}

export function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`h-11 cursor-pointer rounded-lg border border-[#2d3036] px-4 font-medium text-gray-100 transition hover:bg-[#202221] disabled:cursor-not-allowed disabled:opacity-50 ${props.className ?? ''}`} />;
}

export function Avatar({ title, kind }: { title: InboxRow['kind'] | string; kind: InboxRow['kind'] | 'newsletter' | 'business' }) {
  return (
    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#2a2f38] text-sm font-semibold text-gray-100">
      {kind === 'group' || kind === 'newsletter' ? <Users size={19} /> : initials(title)}
      <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#111318] bg-[#2edb5c]" />
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-[#2d3036] p-6 text-center">
      <strong className="text-gray-200">{title}</strong>
      {children && <p className="mt-2 max-w-md text-sm text-gray-500">{children}</p>}
    </div>
  );
}

export function JsonEditor({ value, onChange, minHeight = 180 }: { value: string; onChange: (value: string) => void; minHeight?: number }) {
  return <textarea value={value} onChange={event => onChange(event.target.value)} spellCheck={false} className="w-full resize-y rounded-lg border border-[#2d3036] bg-[#080a0d] px-3 py-3 font-mono text-xs text-gray-100 outline-none focus:border-[#2edb5c]" style={{ minHeight }} />;
}

export function ActionForm({ title, description, children, submitLabel = 'Executar', disabled = false, onSubmit }: { title: string; description?: string; children?: ReactNode; submitLabel?: string; disabled?: boolean; onSubmit: () => void }) {
  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }
  return (
    <form onSubmit={submit} className="rounded-xl border border-[#2d3036] bg-[#151820] p-4">
      <div className="mb-4">
        <h3 className="font-semibold">{title}</h3>
        {description && <p className="mt-1 text-sm leading-5 text-gray-500">{description}</p>}
      </div>
      <div className="space-y-3">{children}</div>
      <PrimaryButton type="submit" className="mt-4 w-full" disabled={disabled}>{submitLabel}</PrimaryButton>
    </form>
  );
}

export function BlockedAction({ title, reason }: { title: string; reason: string }) {
  return (
    <div className="rounded-xl border border-[#2d3036] bg-[#151820] p-4 opacity-75">
      <h3 className="font-semibold text-gray-300">{title}</h3>
      <p className="mt-1 text-sm leading-5 text-gray-500">{reason}</p>
      <button type="button" className="mt-4 h-10 w-full cursor-not-allowed rounded-lg border border-[#2d3036] text-sm text-gray-500" disabled>Nao suportado agora</button>
    </div>
  );
}

export function MediaPreview({ file }: { file: File }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  if (file.type.startsWith('image/')) return <img src={url} alt="" className="h-20 max-w-40 rounded-xl object-cover" />;
  if (file.type.startsWith('video/')) return <video src={url} className="h-20 max-w-48 rounded-xl" controls />;
  if (file.type.startsWith('audio/')) return <audio src={url} controls className="max-w-full" />;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <FileIcon size={24} className="text-[#2edb5c]" />
      <span className="truncate text-sm">{file.name}</span>
    </div>
  );
}

const waveformBars = [8, 18, 14, 24, 11, 28, 16, 22, 10, 30, 18, 25, 13, 20, 27, 12, 22, 16, 30, 18, 24, 14, 21, 10, 26, 16, 20, 13, 18, 11];
const playbackRates = [1, 1.5, 2];

export function AudioPlayer({ src, fromMe = false, className = '', onLoaded }: { src: string; fromMe?: boolean; className?: string; onLoaded?: () => void }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const activeBars = duration > 0 ? Math.max(0, Math.floor((currentTime / duration) * waveformBars.length)) : 0;
  const displayTime = isPlaying || currentTime > 0 ? currentTime : duration;

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }
    await audio.play().catch(() => undefined);
    setIsPlaying(true);
  }

  function seekFromPointer(event: MouseEvent<HTMLButtonElement>) {
    const audio = audioRef.current;
    if (!audio) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const next = (duration || 0) * ratio;
    audio.currentTime = next;
    setCurrentTime(next);
  }

  function cyclePlaybackRate() {
    const currentIndex = playbackRates.indexOf(playbackRate);
    const nextRate = playbackRates[(currentIndex + 1) % playbackRates.length] ?? 1;
    setPlaybackRate(nextRate);
    if (audioRef.current) audioRef.current.playbackRate = nextRate;
  }

  function formatAudioTime(seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const rest = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${rest}`;
  }

  return (
    <div className={`ravox-audio-player ${fromMe ? 'ravox-audio-player-out' : 'ravox-audio-player-in'} ${className}`}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={event => {
          setDuration(event.currentTarget.duration || 0);
          event.currentTarget.playbackRate = playbackRate;
          onLoaded?.();
        }}
        onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime || 0)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />
      <button type="button" onClick={() => void togglePlayback()} className="ravox-audio-play" aria-label={isPlaying ? 'Pausar audio' : 'Reproduzir audio'}>
        {isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
      </button>
      <div className="ravox-audio-main">
        <button type="button" className="ravox-audio-waveform" onClick={seekFromPointer} aria-label="Buscar no audio">
          {waveformBars.map((height, index) => (
            <span key={`${height}-${index}`} className={index <= activeBars ? 'is-active' : undefined} style={{ height }} />
          ))}
        </button>
        <span className="ravox-audio-time">{formatAudioTime(displayTime)}</span>
      </div>
      <button type="button" className="ravox-audio-speed" onClick={cyclePlaybackRate} aria-label="Velocidade do audio">
        {playbackRate.toFixed(1).replace('.', ',')}x
      </button>
    </div>
  );
}

export function MessageBubble({ message, config, onMediaLoad }: { message: Message; config: RavoxChatConfig; onMediaLoad?: () => void }) {
  const type = message.type ?? 'TEXT';
  const mediaUrl = message.mediaUrl ? (message.mediaUrl.startsWith('http') ? message.mediaUrl : `${cleanBaseUrl(config.apiBaseUrl)}${message.mediaUrl}`) : null;
  return (
    <div className={`flex ${message.fromMe ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow ${message.fromMe ? 'bg-[#0f3d22]' : 'bg-[#20252b]'} ${type === 'AUDIO' ? 'ravox-audio-bubble' : ''}`}>
        {type === 'IMAGE' && mediaUrl && <img src={mediaUrl} alt="" className="max-h-96 rounded-xl object-contain" onLoad={onMediaLoad} />}
        {type === 'VIDEO' && mediaUrl && <video src={mediaUrl} className="max-h-96 rounded-xl" controls onLoadedMetadata={onMediaLoad} />}
        {type === 'AUDIO' && mediaUrl && <AudioPlayer src={mediaUrl} fromMe={message.fromMe} className="w-full" onLoaded={onMediaLoad} />}
        {type === 'DOCUMENT' && mediaUrl && <a href={mediaUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl bg-black/20 p-3 text-gray-100"><FileIcon size={18} />Abrir documento</a>}
        {(!mediaUrl || type === 'TEXT') && message.body && <p className="whitespace-pre-wrap">{message.body}</p>}
        {mediaUrl && message.body && type !== 'TEXT' && <p className="mt-2 whitespace-pre-wrap">{message.body}</p>}
        <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-gray-300">{formatMessageTime(message.createdAt)}{message.fromMe && <Check size={14} />}</div>
      </div>
    </div>
  );
}

export function Pill({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'good' | 'bad' | 'warn' }) {
  const cls = tone === 'good' ? 'bg-[#123d24] text-[#2edb5c]' : tone === 'bad' ? 'bg-red-500/10 text-red-300' : tone === 'warn' ? 'bg-amber-500/10 text-amber-200' : 'bg-[#202221] text-gray-300';
  return <span className={`rounded-full px-2 py-1 text-xs ${cls}`}>{children}</span>;
}

export function JsonResult({ value }: { value: unknown }) {
  return <pre className="ravox-scrollbar max-h-72 overflow-auto rounded-lg bg-[#080a0d] p-3 text-xs leading-5 text-gray-300">{JSON.stringify(value, null, 2)}</pre>;
}
