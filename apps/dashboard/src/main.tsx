import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Archive,
  ArrowLeft,
  Bell,
  BarChart3,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  Copy,
  Crown,
  DoorOpen,
  Eraser,
  FileText,
  KeyRound,
  LogOut,
  Menu,
  MessageCircle,
  MessageSquareText,
  Mic,
  MoreVertical,
  Paperclip,
  Pin,
  Power,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Send,
  Smile,
  Smartphone,
  Square,
  Trash2,
  UserPlus,
  Users,
  VolumeX,
  Webhook,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import './styles.css';
import {
  absoluteApiUrl,
  apiClient,
  clearToken,
  getToken,
  setToken,
  type Chat,
  type Contact,
  type DashboardSummary,
  type InstanceStatus,
  type Message,
  type Organization,
  type WebhookEndpoint,
  type WhatsAppGroup,
  type WhatsAppInstance,
} from './lib/api';

const queryClient = new QueryClient();
const SELECTED_INSTANCE_STORAGE_KEY = 'ravoxzap.selectedInstanceId';

const statusConfig: Record<InstanceStatus, { label: string; color: string }> = {
  CREATED: { label: 'Criada', color: 'bg-gray-500' },
  WAITING_QR: { label: 'Aguardando QR', color: 'bg-amber-500' },
  CONNECTING: { label: 'Conectando', color: 'bg-blue-400' },
  CONNECTED: { label: 'Conectada', color: 'bg-[#2edb5c]' },
  DISCONNECTED: { label: 'Desconectada', color: 'bg-gray-600' },
  RECONNECTING: { label: 'Reconectando', color: 'bg-[#3a86ff]' },
  ERROR: { label: 'Erro', color: 'bg-red-500' },
  BANNED: { label: 'Banida', color: 'bg-red-700' },
  LOGGED_OUT: { label: 'Sessão removida', color: 'bg-gray-700' },
};

type DashboardView = 'dashboard' | 'instances' | 'api-keys' | 'docs';
type InstanceTab = 'details' | 'webhooks';

type DashboardRoute = {
  view: DashboardView;
  instanceId?: string;
  instanceTab: InstanceTab;
};

type ComposerDraft = {
  body: string;
  selectedFile: File | null;
};

const emptyComposerDraft: ComposerDraft = {
  body: '',
  selectedFile: null,
};

const viewPaths: Record<DashboardView, string> = {
  dashboard: '/dashboard',
  instances: '/dashboard/instances',
  'api-keys': '/dashboard/api-keys',
  docs: '/docs',
};

function parseDashboardRoute(pathname = window.location.pathname): DashboardRoute {
  const segments = pathname.split('/').filter(Boolean);

  if (segments[0] === 'dashboard') {
    if (segments[1] === 'instances') {
      const tab = segments[3];
      return {
        view: 'instances',
        instanceId: segments[2],
        instanceTab: tab === 'webhooks' ? 'webhooks' : 'details',
      };
    }

    if (segments[1] === 'api-keys') return { view: 'api-keys', instanceTab: 'details' };
    if (segments[1] === 'docs' || segments[1] === 'settings') return { view: 'docs', instanceTab: 'details' };
  }

  return { view: 'dashboard', instanceTab: 'details' };
}

function instanceRoutePath(instanceId: string, tab: InstanceTab) {
  if (tab === 'details') return `/dashboard/instances/${instanceId}`;
  return `/dashboard/instances/${instanceId}/${tab}`;
}

const countryCallingCodes = [
  { code: '93', label: '+93 Afeganistão' },
  { code: '27', label: '+27 África do Sul' },
  { code: '355', label: '+355 Albânia' },
  { code: '49', label: '+49 Alemanha' },
  { code: '376', label: '+376 Andorra' },
  { code: '244', label: '+244 Angola' },
  { code: '1264', label: '+1 264 Anguilla' },
  { code: '672', label: '+672 Antártida' },
  { code: '1268', label: '+1 268 Antígua e Barbuda' },
  { code: '599', label: '+599 Antilhas Holandesas' },
  { code: '966', label: '+966 Arábia Saudita' },
  { code: '213', label: '+213 Argélia' },
  { code: '54', label: '+54 Argentina' },
  { code: '374', label: '+374 Armênia' },
  { code: '297', label: '+297 Aruba' },
  { code: '61', label: '+61 Austrália' },
  { code: '43', label: '+43 Áustria' },
  { code: '994', label: '+994 Azerbaijão' },
  { code: '1242', label: '+1 242 Bahamas' },
  { code: '973', label: '+973 Bahrein' },
  { code: '880', label: '+880 Bangladesh' },
  { code: '1246', label: '+1 246 Barbados' },
  { code: '32', label: '+32 Bélgica' },
  { code: '501', label: '+501 Belize' },
  { code: '229', label: '+229 Benim' },
  { code: '1441', label: '+1 441 Bermudas' },
  { code: '375', label: '+375 Bielorrússia' },
  { code: '591', label: '+591 Bolívia' },
  { code: '387', label: '+387 Bósnia e Herzegovina' },
  { code: '267', label: '+267 Botsuana' },
  { code: '55', label: '+55 Brasil' },
  { code: '673', label: '+673 Brunei' },
  { code: '359', label: '+359 Bulgária' },
  { code: '226', label: '+226 Burkina Faso' },
  { code: '257', label: '+257 Burundi' },
  { code: '975', label: '+975 Butão' },
  { code: '238', label: '+238 Cabo Verde' },
  { code: '237', label: '+237 Camarões' },
  { code: '855', label: '+855 Camboja' },
  { code: '1', label: '+1 Canadá' },
  { code: '974', label: '+974 Catar' },
  { code: '7', label: '+7 Cazaquistão' },
  { code: '235', label: '+235 Chade' },
  { code: '56', label: '+56 Chile' },
  { code: '86', label: '+86 China' },
  { code: '357', label: '+357 Chipre' },
  { code: '61', label: '+61 Ilhas Cocos' },
  { code: '57', label: '+57 Colômbia' },
  { code: '269', label: '+269 Comores' },
  { code: '242', label: '+242 Congo' },
  { code: '243', label: '+243 Congo, Rep. Democrática' },
  { code: '850', label: '+850 Coreia do Norte' },
  { code: '82', label: '+82 Coreia do Sul' },
  { code: '225', label: '+225 Costa do Marfim' },
  { code: '506', label: '+506 Costa Rica' },
  { code: '385', label: '+385 Croácia' },
  { code: '53', label: '+53 Cuba' },
  { code: '599', label: '+599 Curaçao' },
  { code: '45', label: '+45 Dinamarca' },
  { code: '253', label: '+253 Djibuti' },
  { code: '1767', label: '+1 767 Dominica' },
  { code: '20', label: '+20 Egito' },
  { code: '503', label: '+503 El Salvador' },
  { code: '971', label: '+971 Emirados Árabes Unidos' },
  { code: '593', label: '+593 Equador' },
  { code: '291', label: '+291 Eritreia' },
  { code: '421', label: '+421 Eslováquia' },
  { code: '386', label: '+386 Eslovênia' },
  { code: '34', label: '+34 Espanha' },
  { code: '1', label: '+1 Estados Unidos' },
  { code: '372', label: '+372 Estônia' },
  { code: '251', label: '+251 Etiópia' },
  { code: '679', label: '+679 Fiji' },
  { code: '63', label: '+63 Filipinas' },
  { code: '358', label: '+358 Finlândia' },
  { code: '33', label: '+33 França' },
  { code: '241', label: '+241 Gabão' },
  { code: '220', label: '+220 Gâmbia' },
  { code: '233', label: '+233 Gana' },
  { code: '995', label: '+995 Geórgia' },
  { code: '350', label: '+350 Gibraltar' },
  { code: '1473', label: '+1 473 Granada' },
  { code: '30', label: '+30 Grécia' },
  { code: '299', label: '+299 Groenlândia' },
  { code: '590', label: '+590 Guadalupe' },
  { code: '1671', label: '+1 671 Guam' },
  { code: '502', label: '+502 Guatemala' },
  { code: '44', label: '+44 Guernsey' },
  { code: '592', label: '+592 Guiana' },
  { code: '594', label: '+594 Guiana Francesa' },
  { code: '224', label: '+224 Guiné' },
  { code: '240', label: '+240 Guiné Equatorial' },
  { code: '245', label: '+245 Guiné-Bissau' },
  { code: '509', label: '+509 Haiti' },
  { code: '504', label: '+504 Honduras' },
  { code: '852', label: '+852 Hong Kong' },
  { code: '36', label: '+36 Hungria' },
  { code: '967', label: '+967 Iêmen' },
  { code: '61', label: '+61 Ilha Christmas' },
  { code: '672', label: '+672 Ilha Norfolk' },
  { code: '1345', label: '+1 345 Ilhas Cayman' },
  { code: '682', label: '+682 Ilhas Cook' },
  { code: '298', label: '+298 Ilhas Faroe' },
  { code: '500', label: '+500 Ilhas Malvinas' },
  { code: '1670', label: '+1 670 Ilhas Marianas do Norte' },
  { code: '692', label: '+692 Ilhas Marshall' },
  { code: '677', label: '+677 Ilhas Salomão' },
  { code: '1649', label: '+1 649 Ilhas Turks e Caicos' },
  { code: '1284', label: '+1 284 Ilhas Virgens Britânicas' },
  { code: '1340', label: '+1 340 Ilhas Virgens Americanas' },
  { code: '91', label: '+91 Índia' },
  { code: '62', label: '+62 Indonésia' },
  { code: '98', label: '+98 Irã' },
  { code: '964', label: '+964 Iraque' },
  { code: '353', label: '+353 Irlanda' },
  { code: '354', label: '+354 Islândia' },
  { code: '972', label: '+972 Israel' },
  { code: '39', label: '+39 Itália' },
  { code: '1876', label: '+1 876 Jamaica' },
  { code: '81', label: '+81 Japão' },
  { code: '44', label: '+44 Jersey' },
  { code: '962', label: '+962 Jordânia' },
  { code: '686', label: '+686 Kiribati' },
  { code: '965', label: '+965 Kuwait' },
  { code: '856', label: '+856 Laos' },
  { code: '266', label: '+266 Lesoto' },
  { code: '371', label: '+371 Letônia' },
  { code: '961', label: '+961 Líbano' },
  { code: '231', label: '+231 Libéria' },
  { code: '218', label: '+218 Líbia' },
  { code: '423', label: '+423 Liechtenstein' },
  { code: '370', label: '+370 Lituânia' },
  { code: '352', label: '+352 Luxemburgo' },
  { code: '853', label: '+853 Macau' },
  { code: '389', label: '+389 Macedônia do Norte' },
  { code: '261', label: '+261 Madagascar' },
  { code: '60', label: '+60 Malásia' },
  { code: '265', label: '+265 Malawi' },
  { code: '960', label: '+960 Maldivas' },
  { code: '223', label: '+223 Mali' },
  { code: '356', label: '+356 Malta' },
  { code: '212', label: '+212 Marrocos' },
  { code: '596', label: '+596 Martinica' },
  { code: '230', label: '+230 Maurício' },
  { code: '222', label: '+222 Mauritânia' },
  { code: '262', label: '+262 Mayotte' },
  { code: '52', label: '+52 México' },
  { code: '691', label: '+691 Micronésia' },
  { code: '258', label: '+258 Moçambique' },
  { code: '373', label: '+373 Moldávia' },
  { code: '377', label: '+377 Mônaco' },
  { code: '976', label: '+976 Mongólia' },
  { code: '382', label: '+382 Montenegro' },
  { code: '1664', label: '+1 664 Montserrat' },
  { code: '95', label: '+95 Myanmar' },
  { code: '264', label: '+264 Namíbia' },
  { code: '674', label: '+674 Nauru' },
  { code: '977', label: '+977 Nepal' },
  { code: '505', label: '+505 Nicarágua' },
  { code: '227', label: '+227 Níger' },
  { code: '234', label: '+234 Nigéria' },
  { code: '683', label: '+683 Niue' },
  { code: '47', label: '+47 Noruega' },
  { code: '687', label: '+687 Nova Caledônia' },
  { code: '64', label: '+64 Nova Zelândia' },
  { code: '968', label: '+968 Omã' },
  { code: '31', label: '+31 Países Baixos' },
  { code: '92', label: '+92 Paquistão' },
  { code: '680', label: '+680 Palau' },
  { code: '970', label: '+970 Palestina' },
  { code: '507', label: '+507 Panamá' },
  { code: '675', label: '+675 Papua-Nova Guiné' },
  { code: '595', label: '+595 Paraguai' },
  { code: '51', label: '+51 Peru' },
  { code: '689', label: '+689 Polinésia Francesa' },
  { code: '48', label: '+48 Polônia' },
  { code: '1787', label: '+1 787 Porto Rico' },
  { code: '1939', label: '+1 939 Porto Rico' },
  { code: '351', label: '+351 Portugal' },
  { code: '254', label: '+254 Quênia' },
  { code: '996', label: '+996 Quirguistão' },
  { code: '44', label: '+44 Reino Unido' },
  { code: '236', label: '+236 República Centro-Africana' },
  { code: '420', label: '+420 República Tcheca' },
  { code: '1809', label: '+1 809 República Dominicana' },
  { code: '1829', label: '+1 829 República Dominicana' },
  { code: '1849', label: '+1 849 República Dominicana' },
  { code: '262', label: '+262 Reunião' },
  { code: '40', label: '+40 Romênia' },
  { code: '250', label: '+250 Ruanda' },
  { code: '7', label: '+7 Rússia' },
  { code: '212', label: '+212 Saara Ocidental' },
  { code: '590', label: '+590 Saint Barthélemy' },
  { code: '1869', label: '+1 869 Saint Kitts e Nevis' },
  { code: '1758', label: '+1 758 Santa Lúcia' },
  { code: '590', label: '+590 Saint Martin' },
  { code: '508', label: '+508 Saint Pierre e Miquelon' },
  { code: '1784', label: '+1 784 São Vicente e Granadinas' },
  { code: '685', label: '+685 Samoa' },
  { code: '1684', label: '+1 684 Samoa Americana' },
  { code: '378', label: '+378 San Marino' },
  { code: '290', label: '+290 Santa Helena' },
  { code: '239', label: '+239 São Tomé e Príncipe' },
  { code: '221', label: '+221 Senegal' },
  { code: '232', label: '+232 Serra Leoa' },
  { code: '381', label: '+381 Sérvia' },
  { code: '248', label: '+248 Seychelles' },
  { code: '963', label: '+963 Síria' },
  { code: '65', label: '+65 Singapura' },
  { code: '252', label: '+252 Somália' },
  { code: '94', label: '+94 Sri Lanka' },
  { code: '268', label: '+268 Suazilândia' },
  { code: '249', label: '+249 Sudão' },
  { code: '211', label: '+211 Sudão do Sul' },
  { code: '46', label: '+46 Suécia' },
  { code: '41', label: '+41 Suíça' },
  { code: '597', label: '+597 Suriname' },
  { code: '47', label: '+47 Svalbard e Jan Mayen' },
  { code: '66', label: '+66 Tailândia' },
  { code: '886', label: '+886 Taiwan' },
  { code: '992', label: '+992 Tajiquistão' },
  { code: '255', label: '+255 Tanzânia' },
  { code: '246', label: '+246 Território Britânico do Oceano Índico' },
  { code: '670', label: '+670 Timor-Leste' },
  { code: '228', label: '+228 Togo' },
  { code: '690', label: '+690 Tokelau' },
  { code: '676', label: '+676 Tonga' },
  { code: '1868', label: '+1 868 Trinidad e Tobago' },
  { code: '216', label: '+216 Tunísia' },
  { code: '993', label: '+993 Turcomenistão' },
  { code: '90', label: '+90 Turquia' },
  { code: '688', label: '+688 Tuvalu' },
  { code: '380', label: '+380 Ucrânia' },
  { code: '256', label: '+256 Uganda' },
  { code: '598', label: '+598 Uruguai' },
  { code: '998', label: '+998 Uzbequistão' },
  { code: '678', label: '+678 Vanuatu' },
  { code: '379', label: '+379 Vaticano' },
  { code: '58', label: '+58 Venezuela' },
  { code: '84', label: '+84 Vietnã' },
  { code: '681', label: '+681 Wallis e Futuna' },
  { code: '260', label: '+260 Zâmbia' },
  { code: '263', label: '+263 Zimbábue' },
] as const;

function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const { className = '', variant = 'primary', ...rest } = props;
  const variants = {
    primary: 'bg-[#2edb5c] text-[#0b0c11] shadow-[0_0_0_1px_rgba(46,219,92,0.18)] hover:bg-[#3ff06d] hover:shadow-[0_0_0_1px_rgba(46,219,92,0.35),0_8px_24px_rgba(46,219,92,0.12)] active:bg-[#24a84f]',
    ghost: 'border border-[#2d3036] bg-[#181a21] text-gray-100 hover:border-[#3c424c] hover:bg-[#23262e] hover:text-white active:bg-[#111318]',
    danger: 'bg-red-600 text-white hover:bg-red-500 active:bg-red-700',
  };

  return (
    <button
      {...rest}
      className={`inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2edb5c]/60 disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
    />
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-10 w-full rounded-md border border-[#2d3036] bg-[#111318] px-3 text-sm text-gray-100 outline-none transition placeholder:text-gray-600 hover:border-gray-600 focus:border-[#2edb5c] ${props.className ?? ''}`}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`h-10 w-full cursor-pointer rounded-md border border-[#2d3036] bg-[#111318] px-3 text-sm text-gray-100 outline-none transition hover:border-[#3c424c] hover:bg-[#181a21] focus:border-[#2edb5c] ${props.className ?? ''}`}
    />
  );
}

function StatusPill({ status }: { status: InstanceStatus }) {
  const config = statusConfig[status];
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[#2d3036] bg-[#111318] px-2.5 py-1 text-xs font-medium text-gray-200">
      <span className={`status-dot ${config.color}`} />
      {config.label}
    </span>
  );
}

function MessageStatusIcon({ status }: { status?: string | null }) {
  if (status === 'QUEUED') {
    return <Clock3 aria-label="Aguardando envio" className="text-gray-400" size={14} />;
  }

  if (status === 'SENT') {
    return <Check aria-label="Enviada" className="text-gray-400" size={15} />;
  }

  if (status === 'DELIVERED') {
    return <CheckCheck aria-label="Entregue" className="text-gray-400" size={15} />;
  }

  if (status === 'READ') {
    return <CheckCheck aria-label="Lida" className="text-[#53bdeb]" size={15} />;
  }

  if (status === 'FAILED') {
    return <CircleAlert aria-label="Falhou" className="text-red-400" size={14} />;
  }

  return null;
}

function getInitials(value: string) {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = parts[0];
  const last = parts.at(-1);

  if (!first) return '?';
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  return `${first[0]}${last?.[0] ?? ''}`.toUpperCase();
}

function formatRelativeChatTime(value?: string | null) {
  if (!value) return '';

  const date = new Date(value);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60_000));
  if (diffMinutes < 1) return 'agora';
  if (diffMinutes < 60) return `${diffMinutes} min`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} h`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'ontem';
  if (diffDays < 7) return `${diffDays} dias`;

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  }).format(date);
}

function formatMessageTime(value?: string | null) {
  if (!value) return '';

  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function playMessageSound() {
  try {
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const gain = context.createGain();
    const oscillator = context.createOscillator();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(740, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(520, context.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
    setTimeout(() => void context.close().catch(() => undefined), 260);
  } catch {
    // Browsers can block audio before a user gesture; receiving messages should never break the UI.
  }
}

function formatPhoneByDdi(value: string, ddi: string) {
  const digits = value.replace(/\D/g, '');

  if (ddi === '55') {
    const limited = digits.slice(0, 11);
    const ddd = limited.slice(0, 2);
    const first = limited.length > 10 ? limited.slice(2, 7) : limited.slice(2, 6);
    const second = limited.length > 10 ? limited.slice(7, 11) : limited.slice(6, 10);
    if (limited.length <= 2) return ddd ? `(${ddd}` : '';
    if (!second) return `(${ddd}) ${first}`;
    return `(${ddd}) ${first}-${second}`;
  }

  if (ddi === '1') {
    const limited = digits.slice(0, 10);
    const area = limited.slice(0, 3);
    const first = limited.slice(3, 6);
    const second = limited.slice(6, 10);
    if (limited.length <= 3) return area ? `(${area}` : '';
    if (!second) return `(${area}) ${first}`;
    return `(${area}) ${first}-${second}`;
  }

  const limited = digits.slice(0, 15);
  return limited.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
}

function phonePlaceholderByDdi(ddi: string) {
  if (ddi === '55') return '(85) 98853-2761';
  if (ddi === '1') return '(305) 555-0199';
  return 'Telefone';
}

function mediaKindFromMime(mimeType: string) {
  if (mimeType.startsWith('image/')) return 'IMAGE';
  if (mimeType.startsWith('audio/')) return 'AUDIO';
  if (mimeType.startsWith('video/')) return 'VIDEO';
  return 'DOCUMENT';
}

function mediaKindLabel(kind?: string) {
  if (kind === 'IMAGE') return 'Imagem';
  if (kind === 'AUDIO') return 'Áudio';
  if (kind === 'VIDEO') return 'Vídeo';
  if (kind === 'DOCUMENT') return 'Documento';
  return 'Arquivo';
}

function mediaDownloadMissingLabel(kind?: string | null) {
  return `${mediaKindLabel(kind ?? undefined)} não baixado`;
}

function shouldShowMediaDownloadWarning(message: Message) {
  return Boolean(
    !message.mediaUrl &&
      message.type &&
      ['IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT'].includes(message.type),
  );
}

function chatPreviewFromMessage(message?: NonNullable<Chat['messages']>[number]) {
  if (!message) return 'Sem mensagens ainda';
  const prefix = message.fromMe ? 'Você: ' : '';
  if (message.body) return `${prefix}${message.body}`;
  if (message.type === 'IMAGE') return `${prefix}Imagem`;
  if (message.type === 'AUDIO') return `${prefix}Áudio`;
  if (message.type === 'VIDEO') return `${prefix}Vídeo`;
  if (message.type === 'DOCUMENT') return `${prefix}Documento`;
  return `${prefix}Mensagem`;
}

function splitPhoneForContact(value: string) {
  const digits = value.replace(/\D/g, '');
  const country = [...countryCallingCodes]
    .sort((a, b) => b.code.length - a.code.length)
    .find(item => digits.startsWith(item.code));
  const ddi = country?.code ?? '55';
  const phone = country ? digits.slice(country.code.length) : digits;

  return {
    ddi,
    phone: formatPhoneByDdi(phone, ddi),
  };
}

function getDefaultApiKeyName(index: number) {
  const timestamp = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());

  return `Chave ${index + 1} - ${timestamp}`;
}

function AuthScreen({ onAuth }: { onAuth: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [organizationName, setOrganizationName] = useState('Ravox Labs');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    try {
      const response =
        mode === 'login'
          ? await apiClient.login(email, password)
          : await apiClient.register(name, email, password, organizationName);
      setToken(response.token);
      onAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na autenticação');
    }
  }

  return (
    <main className="grid min-h-screen grid-cols-1 bg-[#0b0c11] text-gray-100 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="flex min-h-[42vh] flex-col justify-between gap-10 border-r border-[#2d3036] bg-[#111318] p-5 text-white sm:p-8 lg:min-h-screen lg:p-10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#2edb5c] text-[#0b0c11]">
            <MessageSquareText size={22} />
          </div>
          <strong className="text-lg">RavoxZap</strong>
        </div>
        <div className="max-w-2xl">
          <h1 className="text-3xl font-semibold leading-tight sm:text-4xl md:text-5xl">Painel e API de WhatsApp para operações reais</h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-gray-300">
            Instâncias por organização, QR Code, fila de mensagens, webhooks e tokens para integrações externas.
          </p>
        </div>
        <div className="grid gap-3 text-sm text-gray-300 sm:grid-cols-3">
          <span>Worker 24h</span>
          <span>API pública</span>
          <span>Webhooks assinados</span>
        </div>
      </section>

      <section className="flex items-center justify-center p-4 sm:p-6">
        <form onSubmit={submit} className="w-full max-w-md rounded-lg border border-[#2d3036] bg-[#181a21] p-4 shadow-[0_20px_80px_rgba(0,0,0,0.35)] sm:p-6">
          <div className="mb-6 flex rounded-md border border-[#2d3036] bg-[#111318] p-1">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`h-9 flex-1 cursor-pointer rounded text-sm font-medium transition ${
                mode === 'login'
                  ? 'bg-[#2edb5c] text-[#0b0c11]'
                  : 'text-gray-400 hover:bg-[#181a21] hover:text-gray-100'
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`h-9 flex-1 cursor-pointer rounded text-sm font-medium transition ${
                mode === 'register'
                  ? 'bg-[#2edb5c] text-[#0b0c11]'
                  : 'text-gray-400 hover:bg-[#181a21] hover:text-gray-100'
              }`}
            >
              Cadastro
            </button>
          </div>

          <div className="space-y-3">
            {mode === 'register' && (
              <>
                <Input placeholder="Nome" value={name} onChange={event => setName(event.target.value)} />
                <Input
                  placeholder="Organização"
                  value={organizationName}
                  onChange={event => setOrganizationName(event.target.value)}
                />
              </>
            )}
            <Input placeholder="E-mail" type="email" value={email} onChange={event => setEmail(event.target.value)} />
            <Input
              placeholder="Senha"
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
            />
          </div>

          {error && <p className="mt-4 rounded-md border border-red-900/50 bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</p>}

          <Button className="mt-5 w-full" type="submit">
            {mode === 'login' ? 'Entrar' : 'Criar conta'}
          </Button>
        </form>
      </section>
    </main>
  );
}

function Sidebar({
  view,
  setView,
  onLogout,
  onNavigate,
  className = '',
  showClose = false,
}: {
  view: DashboardView;
  setView: (view: DashboardView) => void;
  onLogout: () => void;
  onNavigate?: () => void;
  className?: string;
  showClose?: boolean;
}) {
  const items: Array<{ id: DashboardView; label: string; icon: typeof Activity }> = [
    { id: 'dashboard', label: 'Dashboard', icon: Activity },
    { id: 'instances', label: 'Instâncias', icon: Smartphone },
    { id: 'api-keys', label: 'API Keys', icon: KeyRound },
    { id: 'docs', label: 'Docs', icon: FileText },
  ];

  return (
    <aside className={`flex h-dvh w-72 max-w-[calc(100vw-2rem)] shrink-0 flex-col border-r border-[#2d3036] bg-[#0b0c11] text-gray-100 md:sticky md:top-0 md:w-64 ${className}`}>
      <div className="flex h-16 items-center justify-between gap-3 border-b border-[#2d3036] px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#2edb5c] text-[#0b0c11]">
            <MessageSquareText size={20} />
          </div>
          <strong className="truncate">RavoxZap</strong>
        </div>
        {showClose && (
          <button
            type="button"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-gray-400 transition hover:bg-[#181a21] hover:text-white"
            onClick={onNavigate}
            aria-label="Fechar menu"
          >
            <X size={18} />
          </button>
        )}
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {items.map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.id === 'docs') {
                  window.open('/docs', '_blank', 'noopener,noreferrer');
                  onNavigate?.();
                  return;
                }
                setView(item.id);
                onNavigate?.();
              }}
              className={`flex h-10 w-full cursor-pointer items-center gap-3 rounded-md px-3 text-left text-sm font-medium transition ${
                view === item.id
                  ? 'bg-[#2edb5c] text-[#0b0c11] shadow-[0_0_0_1px_rgba(46,219,92,0.22)]'
                  : 'text-gray-300 hover:bg-[#181a21] hover:text-white'
              }`}
            >
              <Icon size={18} />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="border-t border-[#2d3036] p-3">
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={() => {
            onNavigate?.();
            onLogout();
          }}
        >
          <LogOut size={18} />
          Sair
        </Button>
      </div>
    </aside>
  );
}

function InstancesView({
  organizations,
  selectedInstance,
  setSelectedInstance,
  routeInstanceId,
  routeInstanceTab,
  navigate,
}: {
  organizations: Organization[];
  selectedInstance?: WhatsAppInstance;
  setSelectedInstance: (instance: WhatsAppInstance) => void;
  routeInstanceId?: string;
  routeInstanceTab: InstanceTab;
  navigate: (path: string) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'CONNECTED' | 'DISCONNECTED'>('ALL');
  const [openMenuInstanceId, setOpenMenuInstanceId] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [deleteInstanceTarget, setDeleteInstanceTarget] = useState<WhatsAppInstance | null>(null);
  const instanceMenuRef = useRef<HTMLDivElement | null>(null);
  const organizationId = organizations[0]?.id ?? '';
  const instances = useQuery({ queryKey: ['instances'], queryFn: apiClient.instances });
  const instanceList = instances.data ?? [];
  const connectedCount = instanceList.filter(instance => instance.status === 'CONNECTED').length;
  const disconnectedCount = instanceList.filter(instance => instance.status !== 'CONNECTED').length;
  const filteredInstances = instanceList.filter(instance => {
    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'CONNECTED' ? instance.status === 'CONNECTED' : instance.status !== 'CONNECTED');
    const normalizedSearch = search.trim().toLowerCase();
    const matchesSearch = normalizedSearch
      ? [instance.name, instance.phoneNumber ?? '', instance.id].some(value => value.toLowerCase().includes(normalizedSearch))
      : true;

    return matchesStatus && matchesSearch;
  });
  const create = useMutation({
    mutationFn: () => apiClient.createInstance(organizationId, name),
    onSuccess: instance => {
      setName('');
      setCreateModalOpen(false);
      setSelectedInstance(instance);
      navigate(instanceRoutePath(instance.id, 'details'));
      void queryClient.invalidateQueries({ queryKey: ['instances'] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiClient.deleteInstance(id),
    onSuccess: () => {
      setOpenMenuInstanceId(null);
      setDeleteInstanceTarget(null);
      if (deleteInstanceTarget?.id === routeInstanceId) navigate('/dashboard/instances');
      void queryClient.invalidateQueries({ queryKey: ['instances'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });
  const activeDetailInstance = routeInstanceId
    ? instanceList.find(instance => instance.id === routeInstanceId)
    : null;

  useEffect(() => {
    if (!openMenuInstanceId) return;

    function closeOnOutsideClick(event: PointerEvent) {
      if (instanceMenuRef.current?.contains(event.target as Node)) return;
      setOpenMenuInstanceId(null);
    }

    window.addEventListener('pointerdown', closeOnOutsideClick);
    return () => window.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [openMenuInstanceId]);

  if (routeInstanceId) {
    if (!activeDetailInstance) {
      return (
        <EmptyState
          icon={Smartphone}
          title={instances.isLoading ? 'Carregando instância...' : 'Instância não encontrada.'}
        />
      );
    }

    return (
      <InstanceDetailPanel
        instance={activeDetailInstance}
        tab={routeInstanceTab}
        setTab={tab => navigate(instanceRoutePath(activeDetailInstance.id, tab))}
        onBack={() => navigate('/dashboard/instances')}
        organization={organizations[0]}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <DashboardMetricCard icon={Smartphone} title="Total de instâncias" value={instanceList.length} description="Instâncias cadastradas" tone="blue" />
        <DashboardMetricCard icon={CheckCircle2} title="Conectadas" value={connectedCount} description="Prontas para envio" />
        <DashboardMetricCard icon={Power} title="Desconectadas" value={disconnectedCount} description="Requerem atenção" tone="red" />
      </div>

      <section className="overflow-visible rounded-lg border border-[#2d3036] bg-[#181a21]">
        <div className="flex flex-col gap-4 border-b border-[#2d3036] p-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Instâncias</h2>
            <p className="text-sm text-gray-400">Listagem das conexões WhatsApp e suas configurações.</p>
          </div>
          <div className="grid gap-3 xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:items-center">
            <div className="flex rounded-full bg-[#111318] p-1">
              {[
                ['ALL', 'Todas'],
                ['CONNECTED', 'Conectadas'],
                ['DISCONNECTED', 'Desconectadas'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`h-8 cursor-pointer rounded-full px-3 text-xs font-medium transition ${
                    statusFilter === value ? 'bg-[#2edb5c] text-[#0b0c11]' : 'text-gray-400 hover:text-white'
                  }`}
                  onClick={() => setStatusFilter(value as typeof statusFilter)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
              <Input className="pl-9" placeholder="Busque por nome, número ou ID" value={search} onChange={event => setSearch(event.target.value)} />
            </div>
            <Button
              type="button"
              className="w-full sm:w-fit xl:justify-self-end"
              disabled={!organizationId}
              onClick={() => setCreateModalOpen(true)}
            >
              <Plus size={18} />
              Nova instância
            </Button>
          </div>
        </div>

        <div className="divide-y divide-[#2d3036]">
          {filteredInstances.map(instance => (
            <div
              key={instance.id}
              role="button"
              tabIndex={0}
              className={`group relative grid cursor-pointer gap-4 px-4 py-4 text-sm transition hover:bg-[#1c1f26] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#2edb5c]/50 md:grid-cols-[minmax(0,1fr)_auto] md:items-center ${
                selectedInstance?.id === instance.id
                  ? 'bg-[#20232b]'
                  : 'bg-transparent'
              }`}
              onClick={() => {
                setOpenMenuInstanceId(null);
                setSelectedInstance(instance);
                navigate(instanceRoutePath(instance.id, 'details'));
              }}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setSelectedInstance(instance);
                  navigate(instanceRoutePath(instance.id, 'details'));
                }
              }}
            >
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="truncate font-semibold text-white">{instance.name}</span>
                  <StatusPill status={instance.status} />
                </div>
                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
                  <span className="truncate">{instance.phoneNumber ?? 'Sem número conectado'}</span>
                  <span className="hidden h-1 w-1 rounded-full bg-gray-700 sm:block" />
                  <code className="min-w-0 truncate text-xs">{instance.id}</code>
                </div>
              </div>

              <div
                ref={openMenuInstanceId === instance.id ? instanceMenuRef : undefined}
                className="flex justify-start md:justify-end"
              >
                <button
                  type="button"
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-[#2d3036] bg-[#111318] text-gray-400 transition hover:border-[#3c424c] hover:bg-[#1f2229] hover:text-white"
                  onClick={event => {
                    event.stopPropagation();
                    setOpenMenuInstanceId(current => (current === instance.id ? null : instance.id));
                  }}
                  aria-label={`Abrir menu da instância ${instance.name}`}
                >
                  <MoreVertical size={16} />
                </button>
                {openMenuInstanceId === instance.id && (
                  <div
                    className="absolute right-3 top-14 z-20 w-44 overflow-hidden rounded-lg border border-[#2d3036] bg-[#111318] p-1 shadow-[0_18px_60px_rgba(0,0,0,0.36)]"
                    onClick={event => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-300 transition hover:bg-red-500/10 hover:text-red-200"
                      onClick={() => {
                        setDeleteInstanceTarget(instance);
                        setOpenMenuInstanceId(null);
                      }}
                    >
                      <Trash2 size={15} />
                      Excluir
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {filteredInstances.length === 0 && (
            <div className="rounded-lg border border-dashed border-[#2d3036] px-4 py-8 text-sm text-gray-500">
              Nenhuma instância encontrada.
            </div>
          )}
        </div>
      </section>

      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            className="w-full max-w-md rounded-lg border border-[#2d3036] bg-[#181a21] shadow-[0_24px_90px_rgba(0,0,0,0.55)]"
            onSubmit={event => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[#2d3036] p-4">
              <div>
                <h2 className="text-lg font-semibold">Nova instância</h2>
                <p className="mt-1 text-sm text-gray-400">Crie uma conexão WhatsApp e leia o QR Code em seguida.</p>
              </div>
              <button
                type="button"
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-gray-400 transition hover:bg-[#23262e] hover:text-white"
                onClick={() => {
                  setCreateModalOpen(false);
                  setName('');
                }}
                aria-label="Fechar modal"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500" htmlFor="instance-name">
                Nome da instância
              </label>
              <Input
                id="instance-name"
                autoFocus
                placeholder="Ex: Suporte RavoxZap"
                value={name}
                onChange={event => setName(event.target.value)}
              />
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-[#2d3036] p-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                className="w-full sm:w-auto"
                onClick={() => {
                  setCreateModalOpen(false);
                  setName('');
                }}
                disabled={create.isPending}
              >
                Cancelar
              </Button>
              <Button className="w-full sm:w-auto" disabled={!organizationId || !name.trim() || create.isPending}>
                <Plus size={18} />
                Criar instância
              </Button>
            </div>
          </form>
        </div>
      )}

      {deleteInstanceTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-lg border border-[#2d3036] bg-[#181a21] shadow-[0_24px_90px_rgba(0,0,0,0.55)]">
            <div className="border-b border-[#2d3036] p-4">
              <h2 className="text-lg font-semibold">Excluir instância</h2>
              <p className="mt-1 text-sm text-gray-400">
                Essa ação remove a instância {deleteInstanceTarget.name} e limpa a sessão local do WhatsApp.
              </p>
            </div>
            <div className="flex flex-col-reverse gap-2 p-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                className="w-full sm:w-auto"
                onClick={() => setDeleteInstanceTarget(null)}
                disabled={remove.isPending}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="danger"
                className="w-full sm:w-auto"
                onClick={() => remove.mutate(deleteInstanceTarget.id)}
                disabled={remove.isPending}
              >
                <Trash2 size={16} />
                Excluir
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InstanceDetailPanel({
  instance,
  tab,
  setTab,
  onBack,
  organization,
}: {
  instance: WhatsAppInstance;
  tab: InstanceTab;
  setTab: (tab: InstanceTab) => void;
  onBack: () => void;
  organization?: Organization;
}) {
  const tabs = [
    { id: 'details', label: 'Dados da instância' },
    { id: 'webhooks', label: 'Webhooks' },
  ] as const;

  return (
    <section className="min-h-[calc(100dvh-7rem)] overflow-hidden rounded-lg border border-[#2d3036] bg-[#181a21]">
      <div className="flex flex-col gap-3 border-b border-[#2d3036] p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-[#2d3036] bg-[#111318] text-gray-300 transition hover:bg-[#23262e] hover:text-white"
            onClick={onBack}
            aria-label="Voltar para lista"
          >
            <ArrowLeft size={17} />
          </button>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">Visualização da instância</h2>
            <p className="truncate text-sm text-gray-400">
              {instance.name}
              {instance.phoneNumber ? ` - ${instance.phoneNumber}` : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-[#2d3036] bg-[#111318] px-4 pt-3">
        {tabs.map(item => (
          <button
            key={item.id}
            type="button"
            className={`shrink-0 cursor-pointer rounded-t-md border px-4 py-3 text-sm font-medium transition ${
              tab === item.id
                ? 'border-[#2edb5c] border-b-[#181a21] bg-[#181a21] text-[#2edb5c]'
                : 'border-transparent text-gray-400 hover:bg-[#181a21] hover:text-white'
            }`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="p-4 md:p-6">
        {tab === 'details' && (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-lg border border-[#2d3036] bg-[#111318] p-5">
              <h3 className="text-lg font-semibold">{instance.name}</h3>
              <p className="mt-1 text-sm text-gray-500">{organization?.name ?? 'Organização'}</p>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">ID da instância</p>
                  <code className="mt-1 block break-all text-sm text-gray-300">{instance.id}</code>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Telefone conectado</p>
                  <p className="mt-1 text-sm text-gray-300">{instance.phoneNumber ?? 'Nenhum número conectado'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Perfil</p>
                  <p className="mt-1 text-sm text-gray-300">{instance.profileName ?? 'Sem nome de perfil'}</p>
                </div>
              </div>
            </div>
            <InstanceConnectionCard instance={instance} />
          </div>
        )}
        {tab === 'webhooks' && (
          <WebhooksView
            organizations={organization ? [organization] : []}
            instances={[instance]}
            lockedInstance={instance}
          />
        )}
      </div>
    </section>
  );
}

function InstanceConnectionCard({ instance }: { instance: WhatsAppInstance }) {
  const queryClient = useQueryClient();
  const autoResetQrKey = useRef<string | null>(null);
  const qr = useQuery({
    queryKey: ['instance-qr', instance.id],
    queryFn: () => apiClient.instanceQr(instance.id),
    enabled: Boolean(instance.id && instance.status !== 'CONNECTED'),
    refetchInterval: 2500,
  });
  const resetSession = useMutation({
    mutationFn: () => apiClient.resetInstanceQr(instance.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['instances'] });
      void queryClient.invalidateQueries({ queryKey: ['instance-qr', instance.id] });
    },
  });
  const current = qr.data;
  const currentStatus = current?.status ?? instance.status;
  const hasQr = Boolean(current?.qrCode);
  const isConnected = currentStatus === 'CONNECTED';
  const isWaitingQr = currentStatus === 'WAITING_QR' || hasQr;
  const isProblem = ['DISCONNECTED', 'ERROR', 'BANNED', 'LOGGED_OUT'].includes(currentStatus);

  useEffect(() => {
    if (!current?.qrCode || !current.qrUpdatedAt || currentStatus === 'CONNECTED') return;

    const updatedAt = new Date(current.qrUpdatedAt).getTime();
    if (!Number.isFinite(updatedAt)) return;

    const qrKey = `${instance.id}:${current.qrUpdatedAt}`;
    const staleIn = Math.max(60_000 - (Date.now() - updatedAt), 0);
    const timer = window.setTimeout(() => {
      if (autoResetQrKey.current === qrKey || resetSession.isPending) return;
      autoResetQrKey.current = qrKey;
      resetSession.mutate();
    }, staleIn);

    return () => window.clearTimeout(timer);
  }, [current?.qrCode, current?.qrUpdatedAt, currentStatus, instance.id, resetSession]);

  return (
    <div className="rounded-lg border border-[#2d3036] bg-[#111318] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">Conexão</h3>
        <StatusPill status={currentStatus} />
      </div>

      {isConnected && (
        <div className="flex min-h-72 flex-col items-center justify-center text-center">
          <div className="flex h-28 w-28 items-center justify-center rounded-full bg-[#2b3038] text-[#2edb5c]">
            <Check size={46} />
          </div>
          <h3 className="mt-5 text-xl font-semibold">Conectada</h3>
          <p className="mt-2 text-sm text-gray-400">Sua instância está pronta para enviar e receber mensagens.</p>
        </div>
      )}

      {!isConnected && isWaitingQr && (
        <div>
          <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed border-gray-700 bg-[#0d0f14]">
            {current?.qrCode ? (
              <img src={current.qrCode} alt="QR Code WhatsApp" className="h-full max-h-80 w-full max-w-80 object-contain p-5" />
            ) : (
              <div className="text-center text-sm text-gray-400">
                <QrCode className="mx-auto mb-2" />
                Gerando QR Code
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-gray-400">
            Escaneie pelo WhatsApp. O painel verifica o status a cada 2,5 segundos e gera outro QR se este expirar.
          </p>
        </div>
      )}

      {!isConnected && !isWaitingQr && (
        <div className="flex min-h-72 flex-col items-center justify-center text-center">
          <div className={`flex h-24 w-24 items-center justify-center rounded-full ${
            isProblem ? 'bg-red-500/10 text-red-300' : 'bg-amber-500/10 text-amber-300'
          }`}>
            {isProblem ? <CircleAlert size={38} /> : <Clock3 size={38} />}
          </div>
          <h3 className="mt-5 text-xl font-semibold">{statusConfig[currentStatus].label}</h3>
          <p className="mt-2 text-sm text-gray-400">
            {isProblem
              ? 'A conexão precisa ser reiniciada para gerar um novo QR Code.'
              : 'Aguardando o worker gerar um QR Code para esta instância.'}
          </p>
        </div>
      )}

      <Button
        type="button"
        variant="ghost"
        className="mt-4 w-full"
        disabled={resetSession.isPending}
        onClick={() => resetSession.mutate()}
      >
        <LogOut size={16} />
        {isConnected ? 'Desconectar e gerar QR novo' : 'Limpar sessão e gerar QR novo'}
      </Button>
    </div>
  );
}

function splitParticipants(value: string) {
  return value
    .split(/[\n,; ]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function _GroupsView({
  instances,
  selectedInstance,
  setSelectedInstanceId,
}: {
  instances: WhatsAppInstance[];
  selectedInstance?: WhatsAppInstance;
  setSelectedInstanceId: (id: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const connectedInstances = instances.filter(instance => instance.status === 'CONNECTED');
  const groupInstance = connectedInstances.find(instance => instance.id === selectedInstance?.id) ?? connectedInstances[0] ?? instances[0];
  const [search, setSearch] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [participants, setParticipants] = useState('');
  const [autoInvite, setAutoInvite] = useState(true);
  const [participantAction, setParticipantAction] = useState('');
  const [mentionText, setMentionText] = useState('');
  const [groupPhotoInput, setGroupPhotoInput] = useState('');

  const groups = useQuery({
    queryKey: ['groups', groupInstance?.id],
    queryFn: () => apiClient.groups(groupInstance!.id),
    enabled: Boolean(groupInstance?.id),
    refetchInterval: 5000,
  });
  const groupList = groups.data ?? [];
  const filteredGroups = groupList.filter(group => {
    const value = `${group.subject} ${group.remoteJid}`.toLowerCase();
    return value.includes(search.toLowerCase());
  });
  const selectedGroup = groupList.find(group => group.id === selectedGroupId) ?? filteredGroups[0];

  const invalidateGroups = () => {
    void queryClient.invalidateQueries({ queryKey: ['groups', groupInstance?.id] });
  };
  const syncGroups = useMutation({
    mutationFn: () => apiClient.syncGroups(groupInstance!.id),
    onSuccess: invalidateGroups,
  });
  const createGroup = useMutation({
    mutationFn: () => apiClient.createGroup(groupInstance!.id, {
      name: groupName,
      participants: splitParticipants(participants),
      autoInvite,
    }),
    onSuccess: () => {
      setGroupName('');
      setParticipants('');
      setAutoInvite(true);
      setNewGroupOpen(false);
      invalidateGroups();
    },
  });
  const groupOperation = useMutation({
    mutationFn: (input: { action: Parameters<typeof apiClient.groupOperation>[2]; body?: Record<string, unknown> }) =>
      apiClient.groupOperation(groupInstance!.id, selectedGroup!.id, input.action, input.body),
    onSuccess: invalidateGroups,
  });

  if (!groupInstance) {
    return (
      <section className="rounded-lg border border-[#2d3036] bg-[#181a21] p-8 text-center text-gray-400">
        Crie e conecte uma instância para operar grupos.
      </section>
    );
  }

  return (
    <section className="grid min-h-[calc(100dvh-8rem)] gap-4 lg:grid-cols-[360px_1fr]">
      <aside className="rounded-lg border border-[#2d3036] bg-[#181a21]">
        <div className="space-y-4 border-b border-[#2d3036] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Grupos</h2>
              <p className="text-sm text-gray-400">{groupList.length} grupos sincronizados</p>
            </div>
            <Button type="button" variant="ghost" className="h-10 w-10 px-0" onClick={() => setNewGroupOpen(true)}>
              <Plus size={16} />
            </Button>
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Instância conectada</label>
            <Select
              value={groupInstance.id}
              onChange={event => setSelectedInstanceId(event.target.value)}
            >
              {connectedInstances.map(instance => (
                <option key={instance.id} value={instance.id}>
                  {instance.name} - {instance.phoneNumber ?? 'sem número'}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" size={17} />
              <Input className="pl-9" placeholder="Buscar grupo..." value={search} onChange={event => setSearch(event.target.value)} />
            </div>
            <Button type="button" variant="ghost" className="h-10 w-10 px-0" disabled={syncGroups.isPending} onClick={() => syncGroups.mutate()}>
              <RefreshCw size={16} className={syncGroups.isPending ? 'animate-spin' : ''} />
            </Button>
          </div>
        </div>

        <div className="max-h-[calc(100dvh-21rem)] overflow-y-auto">
          {filteredGroups.map(group => {
            const selected = selectedGroup?.id === group.id;
            return (
              <button
                key={group.id}
                type="button"
                className={`flex w-full cursor-pointer items-center gap-3 border-b border-[#2d3036] p-4 text-left transition ${selected ? 'bg-[#23262e]' : 'hover:bg-[#1d2027]'}`}
                onClick={() => setSelectedGroupId(group.id)}
              >
                {group.pictureUrl ? (
                  <img src={group.pictureUrl} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#2b3038] text-sm font-semibold">
                    {group.subject.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{group.subject}</p>
                  <p className="truncate text-sm text-gray-400">{group.size ?? group.participants?.length ?? 0} participantes</p>
                </div>
              </button>
            );
          })}
          {filteredGroups.length === 0 && (
            <div className="p-6 text-sm text-gray-500">Nenhum grupo sincronizado para esta instância.</div>
          )}
        </div>
      </aside>

      <article className="rounded-lg border border-[#2d3036] bg-[#181a21]">
        {selectedGroup ? (
          <>
            <div className="flex flex-col gap-3 border-b border-[#2d3036] p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold">{selectedGroup.subject}</h2>
                <p className="truncate text-sm text-gray-400">{selectedGroup.remoteJid}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={groupOperation.isPending}
                  onClick={() => groupOperation.mutate({ action: 'invite-link' })}
                >
                  Convite
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  disabled={groupOperation.isPending}
                  onClick={() => groupOperation.mutate({ action: 'leave' })}
                >
                  <DoorOpen size={16} />
                  Sair
                </Button>
              </div>
            </div>

            <div className="grid gap-4 p-5 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4">
                <div className="rounded-lg border border-[#2d3036] bg-[#111318] p-4">
                  <h3 className="font-semibold">Dados do grupo</h3>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Assunto</p>
                      <p className="mt-1 text-sm text-gray-200">{selectedGroup.subject}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Participantes</p>
                      <p className="mt-1 text-sm text-gray-200">{selectedGroup.size ?? selectedGroup.participants?.length ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Mensagens</p>
                      <p className="mt-1 text-sm text-gray-200">{selectedGroup.announce ? 'Só admins' : 'Todos'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Aprovação</p>
                      <p className="mt-1 text-sm text-gray-200">{selectedGroup.joinApprovalMode ? 'Ativa' : 'Inativa'}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Descrição</p>
                      <p className="mt-1 text-sm text-gray-300">{selectedGroup.description || 'Sem descrição'}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-[#2d3036] bg-[#111318] p-4">
                  <h3 className="font-semibold">Administração</h3>
                  <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                    <Input
                      placeholder="URL ou base64 da foto"
                      value={groupPhotoInput}
                      onChange={event => setGroupPhotoInput(event.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={!groupPhotoInput.trim() || groupOperation.isPending}
                      onClick={() => groupOperation.mutate({ action: 'photo', body: { image: groupPhotoInput } })}
                    >
                      Foto
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={groupOperation.isPending}
                      onClick={() => groupOperation.mutate({ action: 'metadata/sync' })}
                    >
                      Metadata
                    </Button>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={groupOperation.isPending}
                      onClick={() => groupOperation.mutate({ action: 'settings', body: { messages: selectedGroup.announce ? 'all' : 'admins' } })}
                    >
                      {selectedGroup.announce ? 'Liberar mensagens' : 'Só admins'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={groupOperation.isPending}
                      onClick={() => groupOperation.mutate({ action: 'settings', body: { joinApproval: !selectedGroup.joinApprovalMode } })}
                    >
                      {selectedGroup.joinApprovalMode ? 'Desativar aprovação' : 'Exigir aprovação'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={groupOperation.isPending}
                      onClick={() => groupOperation.mutate({ action: 'requests/list' })}
                    >
                      Solicitações
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border border-[#2d3036] bg-[#111318] p-4">
                  <h3 className="font-semibold">Operações rápidas</h3>
                  <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
                    <Input
                      placeholder="Telefones separados por vírgula"
                      value={participantAction}
                      onChange={event => setParticipantAction(event.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={!participantAction.trim() || groupOperation.isPending}
                      onClick={() => groupOperation.mutate({ action: 'participants/add', body: { participants: splitParticipants(participantAction), autoInvite: true } })}
                    >
                      <UserPlus size={16} />
                      Adicionar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={!participantAction.trim() || groupOperation.isPending}
                      onClick={() => groupOperation.mutate({ action: 'admins/promote', body: { participants: splitParticipants(participantAction) } })}
                    >
                      <Crown size={16} />
                      Admin
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={!participantAction.trim() || groupOperation.isPending}
                      onClick={() => groupOperation.mutate({ action: 'requests/approve', body: { participants: splitParticipants(participantAction) } })}
                    >
                      Aprovar
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      disabled={!participantAction.trim() || groupOperation.isPending}
                      onClick={() => groupOperation.mutate({ action: 'participants/remove', body: { participants: splitParticipants(participantAction) } })}
                    >
                      Remover
                    </Button>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                    <Input
                      placeholder="Mensagem com menção"
                      value={mentionText}
                      onChange={event => setMentionText(event.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={!mentionText.trim() || !participantAction.trim() || groupOperation.isPending}
                      onClick={() => groupOperation.mutate({
                        action: 'mention',
                        body: { text: mentionText, participants: splitParticipants(participantAction) },
                      })}
                    >
                      Mencionar
                    </Button>
                    <Button
                      type="button"
                      disabled={!mentionText.trim() || groupOperation.isPending}
                      onClick={() => groupOperation.mutate({ action: 'mention-all', body: { text: mentionText } })}
                    >
                      Todos
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-[#2d3036] bg-[#111318]">
                <div className="border-b border-[#2d3036] p-4">
                  <h3 className="font-semibold">Participantes</h3>
                  <p className="text-sm text-gray-400">Admins e membros sincronizados do cache.</p>
                </div>
                <div className="max-h-[520px] overflow-y-auto">
                  {(selectedGroup.participants ?? []).map(participant => (
                    <div key={participant.id} className="flex items-center justify-between gap-3 border-b border-[#2d3036] p-4">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{participant.name || participant.jid}</p>
                        <p className="truncate text-sm text-gray-500">{participant.jid}</p>
                      </div>
                      {participant.isAdmin && (
                        <span className="rounded-full border border-[#2d3036] px-2 py-1 text-xs text-[#2edb5c]">
                          {participant.isSuperAdmin ? 'super admin' : 'admin'}
                        </span>
                      )}
                    </div>
                  ))}
                  {(!selectedGroup.participants || selectedGroup.participants.length === 0) && (
                    <div className="p-6 text-sm text-gray-500">Sincronize grupos para carregar participantes.</div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex min-h-[520px] items-center justify-center text-sm text-gray-500">
            Selecione ou sincronize um grupo.
          </div>
        )}
      </article>

      {newGroupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            className="w-full max-w-lg rounded-lg border border-[#2d3036] bg-[#181a21] shadow-[0_24px_90px_rgba(0,0,0,0.55)]"
            onSubmit={event => {
              event.preventDefault();
              createGroup.mutate();
            }}
          >
            <div className="flex items-center justify-between border-b border-[#2d3036] p-4">
              <div>
                <h2 className="text-lg font-semibold">Novo grupo</h2>
                <p className="text-sm text-gray-400">A criação roda pelo worker e pode levar alguns segundos.</p>
              </div>
              <button
                type="button"
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-gray-400 transition hover:bg-[#23262e] hover:text-white"
                onClick={() => setNewGroupOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid gap-3 p-4">
              <Input placeholder="Nome do grupo" value={groupName} onChange={event => setGroupName(event.target.value)} />
              <textarea
                className="min-h-28 rounded-md border border-[#2d3036] bg-[#111318] p-3 text-sm text-gray-100 outline-none transition placeholder:text-gray-600 hover:border-gray-600 focus:border-[#2edb5c]"
                placeholder="Participantes separados por vírgula ou linha"
                value={participants}
                onChange={event => setParticipants(event.target.value)}
              />
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-[#2d3036] bg-[#111318] p-3 text-sm text-gray-300">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-[#2edb5c]"
                  checked={autoInvite}
                  onChange={event => setAutoInvite(event.target.checked)}
                />
                <span>
                  <span className="block font-medium text-gray-100">Enviar convite automaticamente</span>
                  <span className="mt-1 block text-gray-500">Se alguém não puder ser adicionado direto, o worker envia o link do grupo no privado.</span>
                </span>
              </label>
            </div>
            <div className="grid gap-2 border-t border-[#2d3036] p-4 sm:flex sm:justify-end">
              <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={() => setNewGroupOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="w-full sm:w-auto" disabled={!groupName.trim() || splitParticipants(participants).length === 0 || createGroup.isPending}>
                <Users size={16} />
                Criar grupo
              </Button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function _ChatsView({
  organizationId,
  instances,
  selectedInstance,
  setSelectedInstanceId,
}: {
  organizationId: string;
  instances: WhatsAppInstance[];
  selectedInstance?: WhatsAppInstance;
  setSelectedInstanceId: (id: string) => void;
}) {
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<WhatsAppGroup | null>(null);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactDdi, setContactDdi] = useState('55');
  const [contactPhone, setContactPhone] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [chatFilter, setChatFilter] = useState<'all' | 'private' | 'groups' | 'archived' | 'pinned' | 'unread'>('all');
  const [openChatMenuId, setOpenChatMenuId] = useState<string | null>(null);
  const [newEntryMenuOpen, setNewEntryMenuOpen] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupParticipants, setNewGroupParticipants] = useState('');
  const [newGroupAutoInvite, setNewGroupAutoInvite] = useState(true);
  const [groupActionsOpen, setGroupActionsOpen] = useState(false);
  const [groupParticipantInput, setGroupParticipantInput] = useState('');
  const [groupMentionText, setGroupMentionText] = useState('');
  const [composerDrafts, setComposerDrafts] = useState<Record<string, ComposerDraft>>({});
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingLevel, setRecordingLevel] = useState(0);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingError, setRecordingError] = useState('');
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string; time: string } | null>(null);
  const knownIncomingMessageIds = useRef(new Set<string>());
  const hasLoadedMessages = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingAudioContextRef = useRef<AudioContext | null>(null);
  const recordingAnimationRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingDraftKeyRef = useRef<string | null>(null);
  const discardRecordingRef = useRef(false);
  const pendingSendDraftKeyRef = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const connectedInstances = useMemo(
    () => instances.filter(instance => instance.status === 'CONNECTED'),
    [instances],
  );
  const chatInstance =
    selectedInstance?.status === 'CONNECTED'
      ? selectedInstance
      : connectedInstances[0];
  const activeDraftKey =
    chatInstance && (selectedContact?.remoteJid ?? selectedGroup?.remoteJid ?? selectedChat?.remoteJid)
      ? `${chatInstance.id}:${selectedContact?.remoteJid ?? selectedGroup?.remoteJid ?? selectedChat?.remoteJid}`
      : null;
  const activeDraft = activeDraftKey ? (composerDrafts[activeDraftKey] ?? emptyComposerDraft) : emptyComposerDraft;
  const body = activeDraft.body;
  const selectedFile = activeDraft.selectedFile;
  const selectedFileKind = selectedFile ? mediaKindFromMime(selectedFile.type) : null;
  const selectedFilePreviewUrl = useMemo(
    () => selectedFile && selectedFileKind !== 'DOCUMENT' ? URL.createObjectURL(selectedFile) : null,
    [selectedFile, selectedFileKind],
  );

  const updateDraft = (key: string | null, patch: Partial<ComposerDraft>) => {
    if (!key) return;

    setComposerDrafts(current => ({
      ...current,
      [key]: {
        ...(current[key] ?? emptyComposerDraft),
        ...patch,
      },
    }));
  };

  const setBody = (value: string) => updateDraft(activeDraftKey, { body: value });
  const setSelectedFile = (file: File | null) => updateDraft(activeDraftKey, { selectedFile: file });
  const openFilePicker = (accept: string) => {
    setAttachmentMenuOpen(false);
    if (!fileInputRef.current) return;

    fileInputRef.current.accept = accept;
    fileInputRef.current.click();
  };
  const clearDraft = (key: string | null) => {
    if (!key) return;
    setComposerDrafts(current => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  useEffect(() => {
    setSelectedChat(null);
    setSelectedContact(null);
    setSelectedGroup(null);
    setGroupActionsOpen(false);
    setNewEntryMenuOpen(false);
    setAttachmentMenuOpen(false);
  }, [chatInstance?.id]);

  useEffect(() => {
    const closeMenus = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-chat-popover-root]')) return;

      setNewEntryMenuOpen(false);
      setAttachmentMenuOpen(false);
      setOpenChatMenuId(null);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      setNewEntryMenuOpen(false);
      setAttachmentMenuOpen(false);
      setOpenChatMenuId(null);
    };

    document.addEventListener('pointerdown', closeMenus);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('pointerdown', closeMenus);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  useEffect(() => () => {
    if (selectedFilePreviewUrl) URL.revokeObjectURL(selectedFilePreviewUrl);
  }, [selectedFilePreviewUrl]);

  const stopRecordingAudio = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    else {
      stopRecordingMeter();
      stopRecordingTimer();
      recordingStreamRef.current?.getTracks().forEach(track => track.stop());
      recordingStreamRef.current = null;
      mediaRecorderRef.current = null;
      setIsRecordingAudio(false);
    }
  };

  const cancelRecordingAudio = () => {
    discardRecordingRef.current = true;
    stopRecordingAudio();
  };

  const stopRecordingMeter = () => {
    if (recordingAnimationRef.current) {
      window.cancelAnimationFrame(recordingAnimationRef.current);
      recordingAnimationRef.current = null;
    }

    void recordingAudioContextRef.current?.close().catch(() => undefined);
    recordingAudioContextRef.current = null;
    setRecordingLevel(0);
  };

  const stopRecordingTimer = () => {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  const startRecordingMeter = (stream: MediaStream) => {
    const BrowserAudioContext =
      window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!BrowserAudioContext) return;

    const context = new BrowserAudioContext();
    const analyser = context.createAnalyser();
    const source = context.createMediaStreamSource(stream);

    analyser.fftSize = 256;
    const samples = new Uint8Array(analyser.fftSize);
    source.connect(analyser);
    recordingAudioContextRef.current = context;

    const tick = () => {
      analyser.getByteTimeDomainData(samples);

      let sum = 0;
      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        sum += normalized * normalized;
      }

      const rms = Math.sqrt(sum / samples.length);
      setRecordingLevel(Math.min(1, rms * 6));
      recordingAnimationRef.current = window.requestAnimationFrame(tick);
    };

    tick();
  };

  const startRecordingAudio = async () => {
    setRecordingError('');

    if (!activeDraftKey) {
      setRecordingError('Selecione uma conversa antes de gravar áudio.');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setRecordingError('Gravação de áudio não é suportada neste navegador.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = [
        'audio/ogg;codecs=opus',
        'audio/webm;codecs=opus',
        'audio/webm',
      ].find(type => MediaRecorder.isTypeSupported(type)) ?? 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      recordingDraftKeyRef.current = activeDraftKey;
      discardRecordingRef.current = false;
      recordingStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      startRecordingMeter(stream);
      setRecordingSeconds(0);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds(seconds => seconds + 1);
      }, 1000);

      recorder.ondataavailable = event => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const draftKey = recordingDraftKeyRef.current;

        if (!discardRecordingRef.current && blob.size > 0 && draftKey) {
          const extension = blob.type.includes('ogg') ? 'ogg' : 'webm';
          const file = new File([blob], `audio-${Date.now()}.${extension}`, { type: blob.type || 'audio/webm' });
          updateDraft(draftKey, { selectedFile: file });
        }

        discardRecordingRef.current = false;
        recordingDraftKeyRef.current = null;
        setIsRecordingAudio(false);
        stopRecordingMeter();
        stopRecordingTimer();
        stream.getTracks().forEach(track => track.stop());
        recordingStreamRef.current = null;
        mediaRecorderRef.current = null;
      };

      updateDraft(activeDraftKey, { selectedFile: null });
      recorder.start();
      setIsRecordingAudio(true);
    } catch {
      setRecordingError('Não foi possível acessar o microfone.');
      stopRecordingMeter();
      stopRecordingTimer();
      recordingStreamRef.current?.getTracks().forEach(track => track.stop());
      recordingStreamRef.current = null;
      mediaRecorderRef.current = null;
      recordingDraftKeyRef.current = null;
      discardRecordingRef.current = false;
      setIsRecordingAudio(false);
    }
  };

  useEffect(() => () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    stopRecordingMeter();
    stopRecordingTimer();
    recordingStreamRef.current?.getTracks().forEach(track => track.stop());
  }, []);

  useEffect(() => {
    if (chatInstance?.id && selectedInstance?.id !== chatInstance.id) {
      setSelectedInstanceId(chatInstance.id);
    }
  }, [chatInstance?.id, selectedInstance?.id, setSelectedInstanceId]);

  const chats = useQuery({
    queryKey: ['chats', chatInstance?.id],
    queryFn: () => apiClient.chats(chatInstance!.id),
    enabled: Boolean(chatInstance?.id),
    refetchInterval: 3000,
  });
  const groups = useQuery({
    queryKey: ['groups', chatInstance?.id],
    queryFn: () => apiClient.groups(chatInstance!.id),
    enabled: Boolean(chatInstance?.id),
    refetchInterval: 5000,
  });
  const contacts = useQuery({
    queryKey: ['contacts', organizationId],
    queryFn: () => apiClient.contacts(organizationId),
    enabled: Boolean(organizationId),
  });
  const messages = useQuery({
    queryKey: ['messages', chatInstance?.id, selectedChat?.id],
    queryFn: () => apiClient.messages(chatInstance!.id, selectedChat!.id),
    enabled: Boolean(chatInstance?.id && selectedChat?.id),
    refetchInterval: 2500,
  });
  useEffect(() => {
    const incomingMessages = (messages.data ?? []).filter(message => !message.fromMe);
    const newIncomingMessages = incomingMessages.filter(message => !knownIncomingMessageIds.current.has(message.id));

    for (const message of incomingMessages) {
      knownIncomingMessageIds.current.add(message.id);
    }

    if (hasLoadedMessages.current && newIncomingMessages.length > 0) {
      playMessageSound();
    }

    if (messages.data) {
      hasLoadedMessages.current = true;
    }
  }, [messages.data]);
  useEffect(() => {
    knownIncomingMessageIds.current = new Set();
    hasLoadedMessages.current = false;
  }, [selectedChat?.id]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const scrollElement = messagesScrollRef.current;
      if (!scrollElement) return;

      scrollElement.scrollTop = scrollElement.scrollHeight;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [messages.data, selectedChat?.id]);
  useEffect(() => {
    if (!selectedContact || selectedChat || !chats.data) return;

    const matchingChat = chats.data.find(chat => chat.remoteJid === selectedContact.remoteJid);
    if (matchingChat) setSelectedChat(matchingChat);
  }, [chats.data, selectedChat, selectedContact]);
  useEffect(() => {
    if (!selectedGroup || selectedChat || !chats.data) return;

    const matchingChat = chats.data.find(chat => chat.remoteJid === selectedGroup.remoteJid);
    if (matchingChat) setSelectedChat(matchingChat);
  }, [chats.data, selectedChat, selectedGroup]);
  const createContact = useMutation({
    mutationFn: () =>
      apiClient.createContact({
        organizationId,
        name: contactName,
        ddi: contactDdi,
        phone: contactPhone,
      }),
    onSuccess: contact => {
      setContactModalOpen(false);
      setContactName('');
      setContactDdi('55');
      setContactPhone('');
      setSelectedContact(contact);
      setSelectedChat(null);
      setSelectedGroup(null);
      void queryClient.invalidateQueries({ queryKey: ['contacts', organizationId] });
    },
  });
  const send = useMutation({
    mutationFn: () => {
      const recipient = selectedContact?.phoneE164 ?? selectedGroup?.remoteJid ?? selectedChat?.remoteJid;
      if (!recipient) throw new Error('Selecione uma conversa para enviar');

      pendingSendDraftKeyRef.current = activeDraftKey;

      return selectedFile
        ? apiClient.sendFile({
            instanceId: chatInstance!.id,
            to: recipient,
            body: body.trim() || undefined,
            file: selectedFile,
          })
        : apiClient.sendText(chatInstance!.id, recipient, body.trim());
    },
    onSuccess: async message => {
      clearDraft(pendingSendDraftKeyRef.current);
      pendingSendDraftKeyRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = '';
      await queryClient.invalidateQueries({ queryKey: ['chats', chatInstance?.id] });
      const refreshedChats = await queryClient.fetchQuery({
        queryKey: ['chats', chatInstance!.id],
        queryFn: () => apiClient.chats(chatInstance!.id),
      });
      const refreshedChat =
        refreshedChats.find(chat => chat.id === message.chatId) ??
        refreshedChats.find(chat => chat.id === selectedChat?.id) ??
        refreshedChats.find(chat => chat.remoteJid === selectedGroup?.remoteJid) ??
        refreshedChats.find(chat => chat.remoteJid === selectedContact?.remoteJid) ??
        refreshedChats.find(chat => chat.remoteJid === selectedChat?.remoteJid) ??
        refreshedChats.find(chat => chat.remoteJid.replace(/\D/g, '') === selectedContact?.phoneE164);

      if (refreshedChat) {
        setSelectedChat(refreshedChat);
        queryClient.setQueryData(['messages', chatInstance?.id, refreshedChat.id], (current: unknown) => {
          const currentMessages = Array.isArray(current) ? current : [];
          if (currentMessages.some(item => typeof item === 'object' && item !== null && 'id' in item && item.id === message.id)) {
            return currentMessages;
          }

          return [...currentMessages, message];
        });
        void queryClient.invalidateQueries({ queryKey: ['messages', chatInstance?.id, refreshedChat.id] });
      }
    },
    onError: () => {
      pendingSendDraftKeyRef.current = null;
    },
  });
  const chatOperation = useMutation({
    mutationFn: ({ chatId, action, body }: { chatId: string; action: Parameters<typeof apiClient.chatOperation>[2]; body?: Record<string, unknown> }) =>
      apiClient.chatOperation(chatInstance!.id, chatId, action, body),
    onSuccess: () => {
      setOpenChatMenuId(null);
      void queryClient.invalidateQueries({ queryKey: ['chats', chatInstance?.id] });
      if (selectedChat?.id) {
        void queryClient.invalidateQueries({ queryKey: ['messages', chatInstance?.id, selectedChat.id] });
      }
    },
  });
  const syncGroups = useMutation({
    mutationFn: () => apiClient.syncGroups(chatInstance!.id),
    onSuccess: () => {
      setNewEntryMenuOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['groups', chatInstance?.id] });
    },
  });
  const createGroup = useMutation({
    mutationFn: () => apiClient.createGroup(chatInstance!.id, {
      name: newGroupName,
      participants: splitParticipants(newGroupParticipants),
      autoInvite: newGroupAutoInvite,
    }),
    onSuccess: () => {
      setNewGroupName('');
      setNewGroupParticipants('');
      setNewGroupAutoInvite(true);
      setNewGroupOpen(false);
      setNewEntryMenuOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['groups', chatInstance?.id] });
    },
  });
  const groupOperation = useMutation({
    mutationFn: ({ group, action, body }: { group: WhatsAppGroup; action: Parameters<typeof apiClient.groupOperation>[2]; body?: Record<string, unknown> }) =>
      apiClient.groupOperation(chatInstance!.id, group.id, action, body),
    onSuccess: () => {
      setOpenChatMenuId(null);
      setGroupActionsOpen(false);
      setGroupParticipantInput('');
      setGroupMentionText('');
      void queryClient.invalidateQueries({ queryKey: ['groups', chatInstance?.id] });
      void queryClient.invalidateQueries({ queryKey: ['chats', chatInstance?.id] });
    },
  });

  if (!chatInstance) {
    return <EmptyState icon={MessageSquareText} title="Conecte uma instância para conversar" />;
  }

  const contactList = contacts.data ?? [];
  const chatList = chats.data ?? [];
  const groupList = groups.data ?? [];
  const normalizedSearch = contactSearch.trim().toLowerCase();
  const contactByRemoteJid = new Map(contactList.map(contact => [contact.remoteJid, contact]));
  const contactByPhone = new Map(contactList.map(contact => [contact.phoneE164, contact]));
  const groupByRemoteJid = new Map(groupList.map(group => [group.remoteJid, group]));
  const chatByRemoteJid = new Map(chatList.map(chat => [chat.remoteJid, chat]));
  type ChatInboxRow = {
    id: string;
    kind: 'private' | 'group' | 'contact';
    contact: Contact | null;
    chat: Chat | null;
    group: WhatsAppGroup | null;
    title: string;
    subtitle: string;
    preview: string;
    time: string;
    searchable: string;
  };
  const baseChatRows: ChatInboxRow[] = [
    ...groupList.map(group => {
      const chat = chatByRemoteJid.get(group.remoteJid) ?? null;
      const lastMessage = chat?.messages?.[0];
      const participantCount = group.size ?? group.participants?.length ?? 0;

      return {
        id: `group:${group.id}`,
        kind: 'group' as const,
        contact: null,
        chat,
        group,
        title: group.subject,
        subtitle: participantCount > 0 ? `${participantCount} participantes` : group.remoteJid,
        preview: chatPreviewFromMessage(lastMessage),
        time: formatRelativeChatTime(chat?.updatedAt ?? group.lastSyncedAt),
        searchable: [group.subject, group.remoteJid, participantCount ? String(participantCount) : ''].filter(Boolean).join(' ').toLowerCase(),
      };
    }),
    ...chatList.filter(chat => !chat.remoteJid.endsWith('@g.us') || !groupByRemoteJid.has(chat.remoteJid)).map(chat => {
      const chatPhone = chat.remoteJid.replace(/\D/g, '');
      const contact = contactByRemoteJid.get(chat.remoteJid) ?? contactByPhone.get(chatPhone) ?? null;
      const isGroupChat = chat.remoteJid.endsWith('@g.us');
      const title = contact?.name ?? chat.name ?? (isGroupChat ? chat.remoteJid : (chatPhone || chat.remoteJid));
      const lastMessage = chat.messages?.[0];

      return {
        id: `chat:${chat.id}`,
        kind: isGroupChat ? 'group' as const : 'private' as const,
        contact,
        chat,
        group: null,
        title,
        subtitle: isGroupChat ? 'Grupo' : contact?.phoneE164 ?? (chatPhone || chat.remoteJid),
        preview: chatPreviewFromMessage(lastMessage),
        time: formatRelativeChatTime(chat.updatedAt),
        searchable: [title, contact?.phoneE164, chat.remoteJid, chatPhone].filter(Boolean).join(' ').toLowerCase(),
      };
    }),
    ...contactList
      .filter(contact => !chatList.some(chat => chat.remoteJid === contact.remoteJid || chat.remoteJid.replace(/\D/g, '') === contact.phoneE164))
      .map(contact => ({
        id: `contact:${contact.id}`,
        kind: 'contact' as const,
        contact,
        chat: null,
        group: null,
        title: contact.name,
        subtitle: contact.phoneE164,
        preview: 'Sem mensagens ainda',
        time: '',
        searchable: [contact.name, contact.phoneE164, contact.remoteJid].join(' ').toLowerCase(),
    })),
  ];
  const filterCounts = {
    all: baseChatRows.length,
    private: baseChatRows.filter(row => row.kind === 'private' || row.kind === 'contact').length,
    groups: baseChatRows.filter(row => row.kind === 'group').length,
    pinned: baseChatRows.filter(row => row.chat?.pinnedAt).length,
    unread: baseChatRows.filter(row => !(row.chat?.isRead ?? true) || Boolean(row.chat?.unreadCount && row.chat.unreadCount > 0)).length,
    archived: baseChatRows.filter(row => row.chat?.archivedAt).length,
  };
  const allChatRows = baseChatRows
    .filter(row => {
      if (chatFilter === 'private' && row.kind !== 'private' && row.kind !== 'contact') return false;
      if (chatFilter === 'groups' && row.kind !== 'group') return false;
      if (chatFilter === 'archived' && !row.chat?.archivedAt) return false;
      if (chatFilter === 'pinned' && !row.chat?.pinnedAt) return false;
      if (chatFilter === 'unread' && (row.chat?.isRead ?? true) && !(row.chat?.unreadCount && row.chat.unreadCount > 0)) return false;
      if (!['all', 'private', 'groups'].includes(chatFilter) && !row.chat) return false;
      return !normalizedSearch || row.searchable.includes(normalizedSearch);
    })
    .sort((a, b) => {
      if (a.chat?.pinnedAt && !b.chat?.pinnedAt) return -1;
      if (!a.chat?.pinnedAt && b.chat?.pinnedAt) return 1;
      if (a.chat?.updatedAt && b.chat?.updatedAt) {
        return new Date(b.chat.updatedAt).getTime() - new Date(a.chat.updatedAt).getTime();
      }
      if (a.chat?.updatedAt) return -1;
      if (b.chat?.updatedAt) return 1;
      return a.title.localeCompare(b.title);
    });
  const chatRows = allChatRows;
  const selectedIsGroup = Boolean(selectedGroup || selectedChat?.remoteJid.endsWith('@g.us'));
  const selectedChatPhone = !selectedIsGroup ? selectedChat?.remoteJid.replace(/\D/g, '') : '';
  const selectedGroupParticipants = selectedGroup?.size ?? selectedGroup?.participants?.length ?? 0;
  const selectedTitle = selectedContact?.name ?? selectedGroup?.subject ?? selectedChat?.name ?? selectedChatPhone ?? '';
  const selectedSubtitle = selectedGroup
    ? selectedGroupParticipants > 0
      ? `${selectedGroupParticipants} participantes`
      : selectedGroup.remoteJid
    : selectedIsGroup
      ? selectedChat?.remoteJid ?? 'Grupo'
      : selectedContact?.phoneE164 ?? selectedChatPhone ?? 'Selecione uma conversa para enviar';
  const selectedRecipient = selectedContact?.phoneE164 ?? selectedGroup?.remoteJid ?? selectedChat?.remoteJid;
  const selectedChatCanBeSaved = Boolean(selectedChat && !selectedContact && !selectedIsGroup);
  const openSaveSelectedChatContact = () => {
    if (!selectedChatPhone) return;
    const phoneParts = splitPhoneForContact(selectedChatPhone);
    setContactName(selectedChat?.name ?? '');
    setContactDdi(phoneParts.ddi);
    setContactPhone(phoneParts.phone);
    setContactModalOpen(true);
  };

  const isRecordingVisibleForActiveChat = isRecordingAudio && recordingDraftKeyRef.current === activeDraftKey;

  return (
    <div className="chat-shell grid h-[calc(100dvh-5rem)] min-h-0 gap-0 overflow-hidden rounded-none border border-[#2d3036] bg-[#111318] md:h-[calc(100dvh-6rem)] xl:grid-cols-[370px_minmax(0,1fr)]">
      <section className={`${selectedRecipient ? 'hidden xl:flex' : 'flex'} min-h-0 flex-col overflow-hidden border-r border-[#2d3036] bg-[#111318]`}>
        <div className="space-y-3 border-b border-[#242832] bg-[#181a21] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Chat</h2>
              <p className="text-sm text-gray-400">{chatRows.length} conversas · {contactList.length} contatos</p>
            </div>
            <div className="relative" data-chat-popover-root>
              <Button
                type="button"
                variant="ghost"
                className="h-11 w-11 rounded-full border-0 bg-[#2edb5c] px-0 text-[#05130a] hover:bg-[#25c653] hover:text-[#05130a]"
                onClick={() => setNewEntryMenuOpen(open => !open)}
                aria-label="Novo chat"
              >
                <Plus size={22} />
              </Button>
              {newEntryMenuOpen && (
                <div className="absolute right-0 top-12 z-20 w-64 overflow-hidden rounded-2xl border border-[#2d3036] bg-[#202221] p-2 shadow-[0_18px_70px_rgba(0,0,0,0.45)]">
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-gray-300 transition hover:bg-[#1f2128] hover:text-white"
                    onClick={() => {
                      setNewEntryMenuOpen(false);
                      setContactModalOpen(true);
                    }}
                  >
                    <UserPlus size={15} />
                    Novo contato
                  </button>
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-gray-300 transition hover:bg-[#1f2128] hover:text-white"
                    onClick={() => {
                      setNewEntryMenuOpen(false);
                      setNewGroupOpen(true);
                    }}
                  >
                    <Users size={15} />
                    Novo grupo
                  </button>
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-gray-300 transition hover:bg-[#1f2128] hover:text-white"
                    disabled={syncGroups.isPending}
                    onClick={() => syncGroups.mutate()}
                  >
                    <RefreshCw size={15} className={syncGroups.isPending ? 'animate-spin' : ''} />
                    Sincronizar grupos
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-gray-500" htmlFor="chat-instance">
              Instância conectada
            </label>
            <Select
              id="chat-instance"
              value={chatInstance.id}
              onChange={event => {
                setSelectedChat(null);
                setSelectedContact(null);
                setSelectedGroup(null);
                setSelectedInstanceId(event.target.value);
              }}
            >
              {connectedInstances.map(instance => (
                <option key={instance.id} value={instance.id}>
                  {instance.name}
                  {instance.phoneNumber ? ` - ${instance.phoneNumber}` : ''}
                </option>
              ))}
            </Select>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <Input
              className="pl-9"
              placeholder="Pesquisar ou começar uma nova conversa"
              value={contactSearch}
              onChange={event => setContactSearch(event.target.value)}
            />
          </div>

          <div className="hide-scrollbar flex gap-2 overflow-x-auto pb-0.5 text-sm">
            {[
              ['all', 'Tudo'],
              ['private', 'Pessoas'],
              ['groups', 'Grupos'],
              ['pinned', 'Fixadas'],
              ['unread', 'Não lidas'],
              ['archived', 'Arquivadas'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium transition ${
                  chatFilter === value
                    ? 'border-[#2edb5c] bg-[#12351f] text-[#2edb5c]'
                    : 'border-[#343840] bg-[#202329] text-gray-300 hover:bg-[#2a2e35]'
                }`}
                onClick={() => setChatFilter(value as typeof chatFilter)}
              >
                {label}
                <span className="rounded-full bg-black/30 px-1.5 py-0.5 text-[11px] leading-none text-gray-300">
                  {filterCounts[value as keyof typeof filterCounts]}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[#111318]">
          {chatRows.map(({ id, kind, contact, chat, group, title, preview, time }) => {
            const isSelected =
              (chat && selectedChat?.id === chat.id) ||
              (group && selectedGroup?.id === group.id) ||
              (!chat && !group && contact && selectedContact?.id === contact.id);
            const isArchived = Boolean(chat?.archivedAt);
            const isPinned = Boolean(chat?.pinnedAt);
            const isMuted = chat?.mutedUntil ? new Date(chat.mutedUntil).getTime() > Date.now() : false;
            const menuId = group ? `group:${group.id}` : chat ? `chat:${chat.id}` : null;

            return (
              <div key={id} className={`group relative transition ${isSelected ? 'bg-[#2a2d2b]' : 'hover:bg-[#202221]'}`}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedContact(contact);
                    setSelectedGroup(group);
                    setSelectedChat(chat);
                    setOpenChatMenuId(null);
                    setGroupActionsOpen(false);
                  }}
                  className="grid w-full cursor-pointer grid-cols-[48px_1fr_auto] gap-3 px-4 py-3 pr-12 text-left"
                >
                  <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-[#2f343b] text-sm font-semibold text-gray-100">
                    {kind === 'group' ? <Users size={17} /> : getInitials(title)}
                    {chat && (
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#111318] bg-[#2edb5c]" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <strong className="min-w-0 flex-1 truncate text-[15px]">{title}</strong>
                      {kind === 'group' && <Users className="shrink-0 text-gray-500" size={13} />}
                      {isPinned && <Pin className="shrink-0 text-[#2edb5c]" size={13} />}
                      {isArchived && <Archive className="shrink-0 text-gray-500" size={13} />}
                    </span>
                    <span className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-gray-400">
                      {chat && <CheckCheck className="shrink-0 text-[#2edb5c]" size={14} />}
                      <span className="truncate">{preview}</span>
                    </span>
                  </span>
                  <span className="pt-0.5 text-xs text-gray-400">{time}</span>
                </button>

                {menuId && (
                  <div className="absolute right-2 top-3" data-chat-popover-root>
                    <button
                      type="button"
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-gray-500 opacity-100 transition hover:bg-[#2b3038] hover:text-white sm:opacity-0 sm:group-hover:opacity-100"
                      onClick={event => {
                        event.stopPropagation();
                        setOpenChatMenuId(current => (current === menuId ? null : menuId));
                      }}
                      aria-label="Ações do chat"
                    >
                      <MoreVertical size={16} />
                    </button>

                    {openChatMenuId === menuId && (
                      <div className="absolute right-0 top-9 z-20 w-60 overflow-hidden rounded-2xl border border-[#2d3036] bg-[#202221] p-2 shadow-[0_18px_70px_rgba(0,0,0,0.45)]">
                        {group ? (
                          <>
                            {[
                              { label: 'Ver participantes', icon: Users, onClick: () => setGroupActionsOpen(true) },
                              { label: 'Sincronizar grupos', icon: RefreshCw, onClick: () => syncGroups.mutate() },
                              { label: 'Sair do grupo', icon: DoorOpen, danger: true, onClick: () => groupOperation.mutate({ group, action: 'leave' }) },
                            ].map(item => (
                              <button
                                key={item.label}
                                type="button"
                                className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition ${
                                  item.danger
                                    ? 'text-red-300 hover:bg-red-500/10 hover:text-red-200'
                                    : 'text-gray-300 hover:bg-[#1f2128] hover:text-white'
                                }`}
                                disabled={syncGroups.isPending || groupOperation.isPending}
                                onClick={event => {
                                  event.stopPropagation();
                                  setSelectedContact(null);
                                  setSelectedGroup(group);
                                  setSelectedChat(chat);
                                  item.onClick();
                                  setOpenChatMenuId(null);
                                }}
                              >
                                <item.icon size={15} />
                                {item.label}
                              </button>
                            ))}
                          </>
                        ) : chat ? [
                          { label: 'Marcar como lido', icon: CheckCheck, action: 'read' as const, body: { read: true } },
                          { label: isArchived ? 'Desarquivar' : 'Arquivar', icon: Archive, action: 'archive' as const, body: { archived: !isArchived } },
                          { label: isPinned ? 'Desafixar' : 'Fixar', icon: Pin, action: 'pin' as const, body: { pinned: !isPinned } },
                          {
                            label: isMuted ? 'Remover silêncio' : 'Mutar por 8h',
                            icon: VolumeX,
                            action: 'mute' as const,
                            body: { mutedUntil: isMuted ? null : new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString() },
                          },
                          { label: 'Limpar conversa', icon: Eraser, action: 'clear' as const, body: {} },
                          { label: 'Excluir conversa', icon: Trash2, action: 'delete' as const, body: {}, danger: true },
                        ].map(item => (
                          <button
                            key={item.label}
                            type="button"
                            className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition ${
                              item.danger
                                ? 'text-red-300 hover:bg-red-500/10 hover:text-red-200'
                                : 'text-gray-300 hover:bg-[#1f2128] hover:text-white'
                            }`}
                            disabled={chatOperation.isPending}
                            onClick={event => {
                              event.stopPropagation();
                              chatOperation.mutate({ chatId: chat.id, action: item.action, body: item.body });
                            }}
                          >
                            <item.icon size={15} />
                            {item.label}
                          </button>
                        )) : null}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {chatRows.length === 0 && (
            <div className="px-5 py-8 text-sm text-gray-500">
              {contactSearch ? 'Nenhum chat encontrado.' : 'Nenhuma conversa ainda.'}
            </div>
          )}
        </div>
      </section>

      <section className={`${selectedRecipient ? 'flex' : 'hidden xl:flex'} min-h-0 overflow-hidden bg-[#0b0f0f]`}>
        {!selectedRecipient ? (
          <div className="chat-wallpaper flex min-h-0 flex-1 items-center justify-center p-6 text-center">
            <div className="max-w-sm">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#202221] text-gray-400">
                <MessageSquareText size={22} />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-white">Selecione uma conversa</h2>
              <p className="mt-2 text-sm leading-6 text-gray-400">
                Escolha um chat na lista ao lado para ver o histórico, responder mensagens ou salvar o número como contato.
              </p>
            </div>
          </div>
        ) : (
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-[#2d3036] bg-[#181a21] px-3 py-3 sm:px-5">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-300 transition hover:bg-[#252930] xl:hidden"
                  onClick={() => {
                    setSelectedChat(null);
                    setSelectedContact(null);
                    setSelectedGroup(null);
                    setGroupActionsOpen(false);
                    setOpenChatMenuId(null);
                  }}
                  aria-label="Voltar para lista de chats"
                >
                  <ArrowLeft size={19} />
                </button>
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#2f343b] text-sm font-semibold text-gray-100">
                  {selectedIsGroup ? <Users size={18} /> : getInitials(selectedTitle)}
                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#181a21] bg-[#2edb5c]" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold">{selectedTitle}</h2>
                  <p className="truncate text-sm text-gray-400">{selectedSubtitle}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {selectedGroup && (
                  <Button type="button" variant="ghost" className="shrink-0" onClick={() => setGroupActionsOpen(true)}>
                    <Users size={16} />
                    <span className="hidden sm:inline">Grupo</span>
                  </Button>
                )}
                {selectedChatCanBeSaved && (
                  <Button type="button" variant="ghost" className="shrink-0" onClick={openSaveSelectedChatContact}>
                    <UserPlus size={16} />
                    <span className="hidden sm:inline">Salvar contato</span>
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div ref={messagesScrollRef} className="chat-wallpaper min-h-0 flex-1 overflow-auto p-3 sm:p-5">
            {(messages.data ?? []).length === 0 ? (
              <div className="flex h-full items-center justify-center text-center text-sm text-gray-500">
                {selectedRecipient ? 'Nenhuma mensagem nesta conversa ainda.' : 'Selecione uma conversa para começar.'}
              </div>
            ) : (
              <div className="space-y-3">
                {(messages.data ?? []).map(message => (
                  <div key={message.id} className={`flex ${message.fromMe ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className="max-w-[86%] rounded-2xl bg-[#20252b] px-3.5 py-2 text-sm text-gray-100 shadow-sm data-[has-image=true]:p-1.5 data-[from-me=true]:bg-[#0f3d22] sm:max-w-[74%]"
                      data-from-me={message.fromMe}
                      data-has-image={Boolean(message.mediaUrl && message.type === 'IMAGE')}
                    >
                      {message.mediaUrl && message.type === 'IMAGE' ? (
                        <div className="space-y-2">
                          <button
                            type="button"
                            className="group relative block cursor-pointer overflow-hidden rounded-xl text-left"
                            onClick={() =>
                              setPreviewImage({
                                src: absoluteApiUrl(message.mediaUrl!),
                                alt: message.body ?? 'Imagem recebida',
                                time: formatMessageTime(message.createdAt),
                              })
                            }
                            aria-label="Abrir imagem"
                          >
                            <img
                              src={absoluteApiUrl(message.mediaUrl)}
                              alt={message.body ?? 'Imagem recebida'}
                              onLoad={() => {
                                const scrollElement = messagesScrollRef.current;
                                if (!scrollElement) return;
                                scrollElement.scrollTop = scrollElement.scrollHeight;
                              }}
                              className="max-h-80 w-full max-w-[18rem] rounded-xl object-cover transition duration-200 group-hover:scale-[1.015] sm:max-w-sm"
                            />
                            <span className="absolute inset-x-0 bottom-0 flex items-end justify-end bg-gradient-to-t from-black/65 via-black/20 to-transparent p-2 pt-10">
                              <span className="inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-[11px] leading-none text-white/90 backdrop-blur">
                                {formatMessageTime(message.createdAt)}
                                {message.fromMe && <MessageStatusIcon status={message.status} />}
                              </span>
                            </span>
                          </button>
                          {message.body ? (
                            <p className="min-w-0 break-words leading-relaxed">{message.body}</p>
                          ) : null}
                        </div>
                      ) : (
                        <div className="flex items-end gap-2">
                          <div className="min-w-0 space-y-2">
                            {message.mediaUrl && message.type === 'VIDEO' && (
                              <video
                                controls
                                src={absoluteApiUrl(message.mediaUrl)}
                                className="max-h-80 w-full max-w-sm rounded-xl border border-[#2d3036] bg-black"
                                onLoadedMetadata={() => {
                                  const scrollElement = messagesScrollRef.current;
                                  if (!scrollElement) return;
                                  scrollElement.scrollTop = scrollElement.scrollHeight;
                                }}
                              />
                            )}
                            {message.mediaUrl && message.type === 'AUDIO' && (
                              <audio controls src={absoluteApiUrl(message.mediaUrl)} className="ravox-audio h-10 w-72 max-w-full" />
                            )}
                            {message.mediaUrl && !['IMAGE', 'VIDEO', 'AUDIO'].includes(message.type ?? '') && (
                              <a
                                href={absoluteApiUrl(message.mediaUrl)}
                                target="_blank"
                                rel="noreferrer"
                                className="flex min-w-0 items-center gap-3 rounded-xl border border-[#2d3036] bg-[#111318] p-3 transition hover:border-[#3c424c] hover:bg-[#1f2229]"
                              >
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#23262e] text-[#2edb5c]">
                                  <FileText size={20} />
                                </span>
                                <span className="min-w-0">
                                  <span className="block truncate font-medium">{message.body ?? 'Arquivo recebido'}</span>
                                  <span className="text-xs text-gray-500">{mediaKindLabel(message.type)}</span>
                                </span>
                              </a>
                            )}
                            {shouldShowMediaDownloadWarning(message) && (
                              <span
                                className="inline-flex items-center gap-2 rounded-full bg-[#111318] px-3 py-2 text-gray-400"
                                title={message.failureReason ?? undefined}
                              >
                                <CircleAlert size={14} className="text-amber-300" />
                                {mediaDownloadMissingLabel(message.type)}
                              </span>
                            )}
                            {message.body ? (
                              <p className="min-w-0 break-words leading-relaxed">{message.body}</p>
                            ) : !message.mediaUrl && !shouldShowMediaDownloadWarning(message) ? (
                              <p className="min-w-0 text-gray-400">{message.type ? `${mediaKindLabel(message.type)} recebido` : 'Mensagem recebida'}</p>
                            ) : null}
                          </div>
                          <span className="flex shrink-0 items-center gap-1 text-[11px] leading-none text-gray-400">
                            {formatMessageTime(message.createdAt)}
                            {message.fromMe && <MessageStatusIcon status={message.status} />}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {previewImage && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
              <button
                type="button"
                className="absolute inset-0 cursor-zoom-out"
                onClick={() => setPreviewImage(null)}
                aria-label="Fechar imagem"
              />
              <div className="relative z-10 max-h-full w-full max-w-5xl">
                <div className="mb-3 flex items-center justify-between gap-3 text-sm text-gray-200">
                  <span>{previewImage.time}</span>
                  <button
                    type="button"
                    className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md bg-white/10 text-white transition hover:bg-white/20"
                    onClick={() => setPreviewImage(null)}
                    aria-label="Fechar"
                  >
                    <X size={18} />
                  </button>
                </div>
                <img
                  src={previewImage.src}
                  alt={previewImage.alt}
                  className="mx-auto max-h-[82dvh] max-w-full rounded-xl object-contain shadow-2xl"
                />
              </div>
            </div>
                          )}

          <form
            className="border-t border-[#2d3036] bg-[#181a21] p-2 sm:p-3"
            onSubmit={event => {
              event.preventDefault();
              send.mutate();
            }}
          >
            {!isRecordingVisibleForActiveChat && selectedFile && (
              <div
                className={`mb-2 flex min-w-0 items-center gap-3 rounded-2xl border border-[#2d3036] bg-[#202221] p-2 text-sm text-gray-300 ${
                  selectedFileKind === 'AUDIO' ? 'rounded-full px-2' : ''
                }`}
              >
                {selectedFileKind === 'AUDIO' && selectedFilePreviewUrl ? (
                  <>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2edb5c] text-[#07110b]">
                      <Mic size={18} />
                    </span>
                    <audio controls src={selectedFilePreviewUrl} className="ravox-audio h-10 min-w-0 flex-1" />
                  </>
                ) : selectedFileKind === 'IMAGE' && selectedFilePreviewUrl ? (
                  <img src={selectedFilePreviewUrl} alt={selectedFile.name} className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                ) : selectedFileKind === 'VIDEO' && selectedFilePreviewUrl ? (
                  <video src={selectedFilePreviewUrl} className="h-14 w-20 shrink-0 rounded-lg bg-black object-cover" muted />
                ) : (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#111318] text-[#2edb5c]">
                    <FileText size={20} />
                  </span>
                )}
                {selectedFileKind !== 'AUDIO' && (
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-gray-100">{selectedFile.name}</span>
                    <span className="block truncate text-xs text-gray-500">{mediaKindLabel(selectedFileKind ?? undefined)}</span>
                  </div>
                )}
                <button
                  type="button"
                  className="ml-auto flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-500 transition hover:bg-[#2b3038] hover:text-white"
                  onClick={() => {
                    setSelectedFile(null);
                    setRecordingError('');
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  aria-label="Remover arquivo"
                >
                  <X size={16} />
                </button>
              </div>
            )}
            {isRecordingVisibleForActiveChat && (
              <div className="mb-2 flex min-w-0 items-center gap-3 rounded-full bg-[#202221] px-3 py-2 text-sm text-gray-100">
                <button
                  type="button"
                  className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-red-300 transition hover:bg-red-500/15 hover:text-red-100"
                  onClick={cancelRecordingAudio}
                  aria-label="Cancelar áudio"
                >
                  <Trash2 size={18} />
                </button>
                <span className="flex min-w-14 items-center gap-2 font-semibold tabular-nums text-white">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-400 shadow-[0_0_0_5px_rgba(248,113,113,0.12)]" />
                  {formatDuration(recordingSeconds)}
                </span>
                <div
                  className="grid h-9 min-w-0 flex-1 items-center gap-1 overflow-hidden rounded-full bg-[#161918] px-3"
                  style={{ gridTemplateColumns: 'repeat(96, minmax(2px, 1fr))' }}
                  aria-hidden="true"
                >
                  {Array.from({ length: 96 }).map((_, index) => {
                    const wave = Math.sin(index * 0.66) * 0.5 + 0.5;
                    const liveLevel = Math.max(0.08, recordingLevel);
                    const barStrength = 0.18 + liveLevel * (0.35 + wave * 0.65);

                    return (
                      <span
                        key={index}
                        className="mx-auto w-full max-w-1 rounded-full bg-[#2edb5c] transition-[height,opacity] duration-75"
                        style={{
                          height: `${5 + barStrength * 25}px`,
                          opacity: 0.35 + Math.min(1, barStrength) * 0.65,
                        }}
                      />
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-red-500/45 text-red-200 transition hover:bg-red-500/15"
                  onClick={stopRecordingAudio}
                  aria-label="Parar gravação"
                >
                  <Square size={14} />
                </button>
                <button
                  type="button"
                  className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#2edb5c] text-[#061208] transition hover:bg-[#25c653]"
                  onClick={stopRecordingAudio}
                  aria-label="Concluir áudio"
                >
                  <Send size={19} />
                </button>
              </div>
            )}
            {recordingError && (
              <div className="mb-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                {recordingError}
              </div>
            )}
            {!isRecordingVisibleForActiveChat && (
              <div className="flex items-center gap-2 rounded-full bg-[#202221] p-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={event => {
                    setRecordingError('');
                    setSelectedFile(event.target.files?.[0] ?? null);
                  }}
                />
                <div className="relative" data-chat-popover-root>
                  <button
                    type="button"
                    className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-200 transition hover:bg-[#2f343b]"
                    disabled={!selectedRecipient || send.isPending}
                    onClick={() => setAttachmentMenuOpen(open => !open)}
                    aria-label="Abrir anexos"
                  >
                    <Plus size={24} />
                  </button>
                  {attachmentMenuOpen && (
                    <div className="absolute bottom-12 left-0 z-20 w-64 overflow-hidden rounded-2xl border border-[#2d3036] bg-[#202221] p-2 shadow-[0_18px_70px_rgba(0,0,0,0.45)]">
                      {[
                        { label: 'Documento', icon: FileText, accept: '.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip' },
                        { label: 'Fotos e vídeos', icon: Paperclip, accept: 'image/*,video/*' },
                        { label: 'Áudio', icon: Mic, accept: 'audio/*' },
                      ].map(item => (
                        <button
                          key={item.label}
                          type="button"
                          className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-gray-200 transition hover:bg-[#2b3038]"
                          onClick={() => openFilePicker(item.accept)}
                        >
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#111318] text-[#2edb5c]">
                            <item.icon size={16} />
                          </span>
                          {item.label}
                        </button>
                      ))}
                      <div className="my-1 border-t border-[#2d3036]" />
                      <button
                        type="button"
                        className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-gray-200 transition hover:bg-[#2b3038]"
                        onClick={() => {
                          setAttachmentMenuOpen(false);
                          setContactModalOpen(true);
                        }}
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#111318] text-[#2edb5c]">
                          <UserPlus size={16} />
                        </span>
                        Novo contato
                      </button>
                      <button
                        type="button"
                        className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-gray-200 transition hover:bg-[#2b3038]"
                        onClick={() => {
                          setAttachmentMenuOpen(false);
                          setNewGroupOpen(true);
                        }}
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#111318] text-[#2edb5c]">
                          <Users size={16} />
                        </span>
                        Novo grupo
                      </button>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="hidden h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-300 transition hover:bg-[#2f343b] sm:flex"
                  disabled={!selectedRecipient || send.isPending}
                  aria-label="Emoji"
                >
                  <Smile size={21} />
                </button>
                <input
                  className="min-w-0 flex-1 border-0 bg-transparent px-1 text-sm text-gray-100 outline-none placeholder:text-gray-500"
                  placeholder={selectedFile ? 'Legenda opcional' : 'Digite uma mensagem'}
                  value={body}
                  onChange={event => setBody(event.target.value)}
                  disabled={!selectedRecipient}
                />
                {body.trim() || selectedFile ? (
                  <button
                    type="submit"
                    className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#2edb5c] text-[#061208] transition hover:bg-[#25c653] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!selectedRecipient || (!body.trim() && !selectedFile) || send.isPending}
                    aria-label="Enviar"
                  >
                    <Send size={20} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-200 transition hover:bg-[#2f343b] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!selectedRecipient || send.isPending}
                    onClick={() => void startRecordingAudio()}
                    aria-label="Gravar áudio"
                  >
                    <Mic size={20} />
                  </button>
                )}
              </div>
            )}
          </form>
        </div>
        )}
      </section>

      {newGroupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            className="w-full max-w-lg rounded-lg border border-[#2d3036] bg-[#181a21] shadow-[0_24px_90px_rgba(0,0,0,0.55)]"
            onSubmit={event => {
              event.preventDefault();
              createGroup.mutate();
            }}
          >
            <div className="flex items-center justify-between border-b border-[#2d3036] p-4">
              <div>
                <h2 className="text-lg font-semibold">Novo grupo</h2>
                <p className="text-sm text-gray-400">A criação roda pelo worker e aparece no Chat depois da sincronização.</p>
              </div>
              <button
                type="button"
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-gray-400 transition hover:bg-[#23262e] hover:text-white"
                onClick={() => setNewGroupOpen(false)}
                aria-label="Fechar modal"
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid gap-3 p-4">
              <Input
                placeholder="Nome do grupo"
                value={newGroupName}
                onChange={event => setNewGroupName(event.target.value)}
              />
              <textarea
                className="min-h-28 rounded-md border border-[#2d3036] bg-[#111318] p-3 text-sm text-gray-100 outline-none transition placeholder:text-gray-600 hover:border-gray-600 focus:border-[#2edb5c]"
                placeholder="Participantes separados por vírgula ou linha"
                value={newGroupParticipants}
                onChange={event => setNewGroupParticipants(event.target.value)}
              />
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-[#2d3036] bg-[#111318] p-3 text-sm text-gray-300">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-[#2edb5c]"
                  checked={newGroupAutoInvite}
                  onChange={event => setNewGroupAutoInvite(event.target.checked)}
                />
                <span>
                  <span className="block font-medium text-gray-100">Enviar convite automaticamente</span>
                  <span className="mt-1 block text-gray-500">Números que não entrarem direto recebem o link do grupo no privado.</span>
                </span>
              </label>
            </div>
            <div className="grid gap-2 border-t border-[#2d3036] p-4 sm:flex sm:justify-end">
              <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={() => setNewGroupOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={!newGroupName.trim() || splitParticipants(newGroupParticipants).length === 0 || createGroup.isPending}
              >
                <Users size={16} />
                Criar grupo
              </Button>
            </div>
          </form>
        </div>
      )}

      {groupActionsOpen && selectedGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-[#2d3036] bg-[#181a21] shadow-[0_24px_90px_rgba(0,0,0,0.55)]">
            <div className="flex items-center justify-between gap-3 border-b border-[#2d3036] p-4">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold">{selectedGroup.subject}</h2>
                <p className="truncate text-sm text-gray-400">
                  {selectedGroupParticipants > 0 ? `${selectedGroupParticipants} participantes` : selectedGroup.remoteJid}
                </p>
              </div>
              <button
                type="button"
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-gray-400 transition hover:bg-[#23262e] hover:text-white"
                onClick={() => setGroupActionsOpen(false)}
                aria-label="Fechar ações do grupo"
              >
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto p-4">
              <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                <section className="rounded-lg border border-[#2d3036] bg-[#111318] p-4">
                  <h3 className="font-semibold">Participantes</h3>
                  <p className="mt-1 text-sm text-gray-400">Use telefones com ou sem +55, separados por vírgula ou linha.</p>
                  <textarea
                    className="mt-4 min-h-24 w-full rounded-md border border-[#2d3036] bg-[#0d0f14] p-3 text-sm text-gray-100 outline-none transition placeholder:text-gray-600 hover:border-gray-600 focus:border-[#2edb5c]"
                    placeholder="5585999999999, +5585888888888"
                    value={groupParticipantInput}
                    onChange={event => setGroupParticipantInput(event.target.value)}
                  />
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={!groupParticipantInput.trim() || groupOperation.isPending}
                      onClick={() => groupOperation.mutate({
                        group: selectedGroup,
                        action: 'participants/add',
                        body: { participants: splitParticipants(groupParticipantInput), autoInvite: true },
                      })}
                    >
                      <UserPlus size={16} />
                      Adicionar
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      disabled={!groupParticipantInput.trim() || groupOperation.isPending}
                      onClick={() => groupOperation.mutate({
                        group: selectedGroup,
                        action: 'participants/remove',
                        body: { participants: splitParticipants(groupParticipantInput) },
                      })}
                    >
                      <Trash2 size={16} />
                      Remover
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={!groupParticipantInput.trim() || groupOperation.isPending}
                      onClick={() => groupOperation.mutate({
                        group: selectedGroup,
                        action: 'admins/promote',
                        body: { participants: splitParticipants(groupParticipantInput) },
                      })}
                    >
                      <Crown size={16} />
                      Promover admin
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={!groupParticipantInput.trim() || groupOperation.isPending}
                      onClick={() => groupOperation.mutate({
                        group: selectedGroup,
                        action: 'admins/demote',
                        body: { participants: splitParticipants(groupParticipantInput) },
                      })}
                    >
                      Remover admin
                    </Button>
                  </div>
                </section>

                <section className="rounded-lg border border-[#2d3036] bg-[#111318] p-4">
                  <h3 className="font-semibold">Mensagens com menção</h3>
                  <p className="mt-1 text-sm text-gray-400">Envie para participantes específicos ou mencione todos.</p>
                  <Input
                    className="mt-4"
                    placeholder="Mensagem para o grupo"
                    value={groupMentionText}
                    onChange={event => setGroupMentionText(event.target.value)}
                  />
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={!groupMentionText.trim() || !groupParticipantInput.trim() || groupOperation.isPending}
                      onClick={() => groupOperation.mutate({
                        group: selectedGroup,
                        action: 'mention',
                        body: {
                          text: groupMentionText,
                          participants: splitParticipants(groupParticipantInput),
                        },
                      })}
                    >
                      Mencionar pessoas
                    </Button>
                    <Button
                      type="button"
                      disabled={!groupMentionText.trim() || groupOperation.isPending}
                      onClick={() => groupOperation.mutate({
                        group: selectedGroup,
                        action: 'mention-all',
                        body: { text: groupMentionText },
                      })}
                    >
                      Mencionar todos
                    </Button>
                  </div>

                  <div className="mt-5 grid gap-2 border-t border-[#2d3036] pt-4 sm:grid-cols-2">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={groupOperation.isPending}
                      onClick={() => groupOperation.mutate({ group: selectedGroup, action: 'metadata/sync' })}
                    >
                      Metadata
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={groupOperation.isPending}
                      onClick={() => groupOperation.mutate({ group: selectedGroup, action: 'requests/list' })}
                    >
                      Solicitações
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={groupOperation.isPending}
                      onClick={() => groupOperation.mutate({
                        group: selectedGroup,
                        action: 'settings',
                        body: { messages: selectedGroup.announce ? 'all' : 'admins' },
                      })}
                    >
                      {selectedGroup.announce ? 'Liberar mensagens' : 'Só admins'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={syncGroups.isPending}
                      onClick={() => syncGroups.mutate()}
                    >
                      <RefreshCw size={16} className={syncGroups.isPending ? 'animate-spin' : ''} />
                      Sincronizar grupos
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      disabled={groupOperation.isPending}
                      onClick={() => groupOperation.mutate({ group: selectedGroup, action: 'leave' })}
                    >
                      <DoorOpen size={16} />
                      Sair do grupo
                    </Button>
                  </div>
                </section>
              </div>

              <section className="mt-4 rounded-lg border border-[#2d3036] bg-[#111318]">
                <div className="border-b border-[#2d3036] p-4">
                  <h3 className="font-semibold">Membros sincronizados</h3>
                  <p className="text-sm text-gray-400">Use “Sincronizar grupos” se esta lista estiver desatualizada.</p>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {(selectedGroup.participants ?? []).map(participant => (
                    <div key={participant.id} className="flex items-center justify-between gap-3 border-b border-[#2d3036] p-4 last:border-b-0">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{participant.name || participant.jid}</p>
                        <p className="truncate text-sm text-gray-500">{participant.jid}</p>
                      </div>
                      {participant.isAdmin && (
                        <span className="rounded-full border border-[#2d3036] px-2 py-1 text-xs text-[#2edb5c]">
                          {participant.isSuperAdmin ? 'super admin' : 'admin'}
                        </span>
                      )}
                    </div>
                  ))}
                  {(!selectedGroup.participants || selectedGroup.participants.length === 0) && (
                    <div className="p-6 text-sm text-gray-500">Nenhum participante carregado no cache.</div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {contactModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            className="w-full max-w-lg rounded-lg border border-[#2d3036] bg-[#181a21] shadow-[0_24px_90px_rgba(0,0,0,0.55)]"
            onSubmit={event => {
              event.preventDefault();
              createContact.mutate();
            }}
          >
            <div className="flex items-center justify-between border-b border-[#2d3036] p-4">
              <div>
                <h2 className="text-lg font-semibold">Novo contato</h2>
                <p className="text-sm text-gray-400">Disponível para todas as instâncias da organização.</p>
              </div>
              <button
                type="button"
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-gray-400 transition hover:bg-[#23262e] hover:text-white"
                onClick={() => setContactModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid gap-3 p-4">
              <Input placeholder="Nome do contato" value={contactName} onChange={event => setContactName(event.target.value)} />
              <div className="grid gap-3 sm:grid-cols-[190px_1fr]">
                <Select
                  value={contactDdi}
                  onChange={event => {
                    setContactDdi(event.target.value);
                    setContactPhone('');
                  }}
                >
                  {countryCallingCodes.map(country => (
                    <option key={`${country.code}-${country.label}`} value={country.code}>
                      {country.label}
                    </option>
                  ))}
                </Select>
                <Input
                  placeholder={phonePlaceholderByDdi(contactDdi)}
                  inputMode="tel"
                  value={contactPhone}
                  onChange={event => setContactPhone(formatPhoneByDdi(event.target.value, contactDdi))}
                />
              </div>
            </div>
            <div className="grid gap-2 border-t border-[#2d3036] p-4 sm:flex sm:justify-end">
              <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={() => setContactModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={!organizationId || !contactName || contactPhone.replace(/\D/g, '').length < 6 || createContact.isPending}
              >
                <UserPlus size={16} />
                Criar contato
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function ApiKeysView({ organizations }: { organizations: Organization[] }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [openMenuKeyId, setOpenMenuKeyId] = useState<string | null>(null);
  const [deleteKeyId, setDeleteKeyId] = useState<string | null>(null);
  const keyMenuRef = useRef<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();
  const organizationId = organizations[0]?.id ?? '';
  const keys = useQuery({ queryKey: ['api-keys'], queryFn: apiClient.apiKeys });
  const visibleKeys = (keys.data ?? []).filter(key => key.status === 'ACTIVE');
  const keyToDelete = visibleKeys.find(key => key.id === deleteKeyId) ?? null;
  const create = useMutation({
    mutationFn: () => {
      const apiKeyName = name.trim() || getDefaultApiKeyName(visibleKeys.length);
      return apiClient.createApiKey(organizationId, apiKeyName);
    },
    onSuccess: key => {
      setCreatedToken(key.token ?? null);
      setName('');
      void queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiClient.deleteApiKey(id),
    onSuccess: () => {
      setDeleteKeyId(null);
      setOpenMenuKeyId(null);
      void queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });
  const rotate = useMutation({
    mutationFn: (id: string) => apiClient.rotateApiKey(id),
    onSuccess: key => {
      setOpenMenuKeyId(null);
      setName('');
      setCopied(false);
      setCreatedToken(key.token ?? null);
      setModalOpen(true);
      void queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  function openModal() {
    setName('');
    setCreatedToken(null);
    setCopied(false);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setName('');
    setCreatedToken(null);
    setCopied(false);
  }

  async function copyToken() {
    if (!createdToken) return;
    await navigator.clipboard.writeText(createdToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  useEffect(() => {
    if (!openMenuKeyId) return;

    function closeOnOutsideClick(event: PointerEvent) {
      if (keyMenuRef.current?.contains(event.target as Node)) return;
      setOpenMenuKeyId(null);
    }

    window.addEventListener('pointerdown', closeOnOutsideClick);
    return () => window.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [openMenuKeyId]);

  return (
    <>
      <section className="rounded-lg border border-[#2d3036] bg-[#181a21]">
        <div className="flex flex-col gap-3 border-b border-[#2d3036] p-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">API Keys</h2>
            <p className="text-sm text-gray-400">Tokens para sistemas, automações e clientes externos.</p>
          </div>
          <Button className="w-full md:w-auto" disabled={!organizationId} onClick={openModal}>
            <KeyRound size={18} />
            Nova chave
          </Button>
        </div>
        <div className="divide-y divide-[#2d3036]">
          {visibleKeys.map(key => (
            <div key={key.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
              <div className="min-w-0">
                <strong className="block truncate">{key.name}</strong>
                <p className="mt-1 break-all font-mono text-sm text-gray-400">
                  {key.prefix}...{key.lastFour}
                </p>
              </div>
              <span className="w-fit rounded-full border border-[#2d3036] bg-[#111318] px-2.5 py-1 text-xs font-medium text-gray-300">
                {key.status === 'ACTIVE' ? 'Ativa' : 'Revogada'}
              </span>
              <div ref={openMenuKeyId === key.id ? keyMenuRef : undefined} className="relative">
                <button
                  type="button"
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-[#2d3036] bg-[#111318] text-gray-400 transition hover:bg-[#23262e] hover:text-white"
                  onClick={() => setOpenMenuKeyId(current => (current === key.id ? null : key.id))}
                  aria-label={`Ações para ${key.name}`}
                >
                  <MoreVertical size={17} />
                </button>
                {openMenuKeyId === key.id && (
                  <div className="absolute right-11 top-1/2 z-50 w-44 -translate-y-1/2 overflow-hidden rounded-md border border-[#2d3036] bg-[#111318] shadow-xl">
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 transition hover:bg-[#23262e] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={rotate.isPending}
                      onClick={() => rotate.mutate(key.id)}
                    >
                      <RefreshCw size={15} />
                      Renovar chave
                    </button>
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-red-300 transition hover:bg-red-500/10 hover:text-red-200"
                      onClick={() => {
                        setOpenMenuKeyId(null);
                        setDeleteKeyId(key.id);
                      }}
                    >
                      <Trash2 size={15} />
                      Remover chave
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {visibleKeys.length === 0 && (
            <div className="p-6 text-sm text-gray-500">Nenhuma chave criada ainda.</div>
          )}
        </div>
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-lg border border-[#2d3036] bg-[#181a21] shadow-[0_24px_90px_rgba(0,0,0,0.55)]">
            <div className="flex items-center justify-between gap-3 border-b border-[#2d3036] p-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">Nova API Key</h2>
                <p className="text-sm text-gray-400">O token será exibido apenas uma vez.</p>
              </div>
              <button
                type="button"
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-gray-400 transition hover:bg-[#23262e] hover:text-white"
                onClick={closeModal}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            {createdToken ? (
              <div className="space-y-4 p-4">
                <div className="rounded-md border border-amber-400/30 bg-amber-950/40 p-3 text-sm text-amber-100">
                  Guarde este token agora. Depois que fechar esta janela, ele não será mostrado novamente. Se você renovou uma chave, o token antigo deixou de funcionar.
                </div>
                <div className="rounded-md border border-[#2d3036] bg-[#111318] p-3">
                  <code className="block break-all font-mono text-sm text-gray-100">{createdToken}</code>
                </div>
                <div className="grid gap-2 sm:flex sm:justify-end">
                  <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={copyToken}>
                    <Copy size={16} />
                    {copied ? 'Copiado' : 'Copiar token'}
                  </Button>
                  <Button type="button" className="w-full sm:w-auto" onClick={closeModal}>
                    Concluir
                  </Button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={event => {
                  event.preventDefault();
                  create.mutate();
                }}
              >
                <div className="space-y-3 p-4">
                  <label className="block text-sm font-medium text-gray-300" htmlFor="api-key-name">
                    Nome da chave
                  </label>
                  <Input
                    id="api-key-name"
                    placeholder={getDefaultApiKeyName(visibleKeys.length)}
                    value={name}
                    onChange={event => setName(event.target.value)}
                  />
                  <p className="text-xs text-gray-500">
                    Pode deixar em branco que o RavoxZap cria um nome automático.
                  </p>
                </div>
                <div className="grid gap-2 border-t border-[#2d3036] p-4 sm:flex sm:justify-end">
                  <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={closeModal}>
                    Cancelar
                  </Button>
                  <Button type="submit" className="w-full sm:w-auto" disabled={!organizationId || create.isPending}>
                    <KeyRound size={16} />
                    Gerar chave
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {keyToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-lg border border-[#2d3036] bg-[#181a21] shadow-[0_24px_90px_rgba(0,0,0,0.55)]">
            <div className="border-b border-[#2d3036] p-4">
              <h2 className="text-lg font-semibold">Remover API Key?</h2>
              <p className="mt-1 text-sm text-gray-400">
                A chave <strong className="text-gray-200">{keyToDelete.name}</strong> será revogada e não poderá mais acessar a API.
              </p>
            </div>
            <div className="rounded-md border border-[#2d3036] bg-[#111318] p-3 m-4">
              <p className="break-all font-mono text-sm text-gray-400">
                {keyToDelete.prefix}...{keyToDelete.lastFour}
              </p>
            </div>
            <div className="grid gap-2 border-t border-[#2d3036] p-4 sm:flex sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                className="w-full sm:w-auto"
                onClick={() => setDeleteKeyId(null)}
                disabled={remove.isPending}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="danger"
                className="w-full sm:w-auto"
                onClick={() => remove.mutate(keyToDelete.id)}
                disabled={remove.isPending}
              >
                <Trash2 size={16} />
                Remover
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

type WebhookEventValue =
  | 'message.received'
  | 'message.sent'
  | 'message.delivered'
  | 'message.read'
  | 'message.failed'
  | 'chat.presence'
  | 'instance.connected'
  | 'instance.disconnected'
  | 'qr.updated';

const webhookHookFields: Array<{
  key: string;
  label: string;
  icon: typeof Bell;
  placeholder: string;
  events: WebhookEventValue[];
}> = [
  {
    key: 'sent',
    label: 'Ao enviar',
    icon: Send,
    placeholder: 'https://sua-api.com/webhooks/sent',
    events: ['message.sent'],
  },
  {
    key: 'presence',
    label: 'Presença do chat',
    icon: Activity,
    placeholder: 'https://sua-api.com/webhooks/presence',
    events: ['chat.presence'],
  },
  {
    key: 'disconnected',
    label: 'Ao desconectar',
    icon: LogOut,
    placeholder: 'https://sua-api.com/webhooks/disconnected',
    events: ['instance.disconnected'],
  },
  {
    key: 'status',
    label: 'Receber status da mensagem',
    icon: Activity,
    placeholder: 'https://sua-api.com/webhooks/status',
    events: ['message.delivered', 'message.read', 'message.failed'],
  },
  {
    key: 'received',
    label: 'Ao receber',
    icon: MessageCircle,
    placeholder: 'https://sua-api.com/webhooks/received',
    events: ['message.received'],
  },
  {
    key: 'connected',
    label: 'Ao conectar',
    icon: Check,
    placeholder: 'https://sua-api.com/webhooks/connected',
    events: ['instance.connected'],
  },
];

function haveSameWebhookEvents(a: string[], b: string[]) {
  return a.length === b.length && a.every(event => b.includes(event));
}

function WebhooksView({
  organizations,
  instances,
  lockedInstance,
}: {
  organizations: Organization[];
  instances: WhatsAppInstance[];
  lockedInstance?: WhatsAppInstance;
}) {
  const [hookUrls, setHookUrls] = useState<Record<string, string>>({});
  const [selectedInstanceId, setSelectedInstanceId] = useState('');
  const organizationId = organizations[0]?.id ?? '';
  const queryClient = useQueryClient();
  const effectiveInstanceId = lockedInstance?.id ?? selectedInstanceId;
  const selectedInstance = lockedInstance ?? instances.find(instance => instance.id === selectedInstanceId) ?? null;
  const webhooks = useQuery({
    queryKey: ['webhooks', effectiveInstanceId],
    queryFn: () => apiClient.webhooks(effectiveInstanceId || undefined),
    enabled: Boolean(organizationId),
  });
  const existingHooksByField = useMemo(() => {
    const entries = webhookHookFields.map(field => [
      field.key,
      webhooks.data?.find(webhook => haveSameWebhookEvents(webhook.events, field.events)) ?? null,
    ] as const);

    return Object.fromEntries(entries) as Record<string, WebhookEndpoint | null>;
  }, [webhooks.data]);

  useEffect(() => {
    if (!webhooks.data) return;

    const nextUrls = Object.fromEntries(
      webhookHookFields.map(field => [field.key, existingHooksByField[field.key]?.url ?? '']),
    );
    setHookUrls(nextUrls);
  }, [existingHooksByField, webhooks.data]);

  const create = useMutation({
    mutationFn: async () => {
      const hooksToSave = webhookHookFields
        .map(field => ({
          ...field,
          url: hookUrls[field.key]?.trim() ?? '',
          existing: existingHooksByField[field.key],
        }))
        .filter(field => field.url.length > 0 && field.url !== field.existing?.url);

      await Promise.all(
        hooksToSave.map(field =>
          field.existing
            ? apiClient.updateWebhook(field.existing.id, { url: field.url, events: field.events, active: true })
            : apiClient.createWebhook(organizationId, field.url, field.events, effectiveInstanceId || undefined),
        ),
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });
  const hasWebhookChange = webhookHookFields.some(field => {
    const url = hookUrls[field.key]?.trim() ?? '';
    return url.length > 0 && url !== existingHooksByField[field.key]?.url;
  });

  return (
    <div className={lockedInstance ? 'space-y-4' : 'grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]'}>
      {!lockedInstance && (
        <section className="rounded-lg border border-[#2d3036] bg-[#181a21]">
          <div className="border-b border-[#2d3036] p-4">
            <h2 className="text-lg font-semibold">Instância</h2>
            <p className="text-sm text-gray-400">Configure webhooks por conexão WhatsApp.</p>
          </div>
          <div className="space-y-3 p-4">
            <Select value={selectedInstanceId} onChange={event => setSelectedInstanceId(event.target.value)}>
              <option value="">Webhooks gerais da organização</option>
              {instances.map(instance => (
                <option key={instance.id} value={instance.id}>
                  {instance.name}
                  {instance.phoneNumber ? ` - ${instance.phoneNumber}` : ''}
                </option>
              ))}
            </Select>
            <div className="rounded-lg border border-[#2d3036] bg-[#111318] p-4">
              <p className="text-sm font-medium">{selectedInstance?.name ?? 'Geral da organização'}</p>
              <p className="mt-1 text-sm text-gray-500">
                {selectedInstance
                  ? 'Eventos disparados apenas por esta instância.'
                  : 'Eventos globais continuam funcionando para todas as instâncias.'}
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-lg border border-[#2d3036] bg-[#181a21]">
        <div className="border-b border-[#2d3036] p-4">
          <h2 className="text-lg font-semibold">{lockedInstance ? 'Webhooks da instância' : 'Webhooks e eventos'}</h2>
          <p className="text-sm text-gray-400">
            {selectedInstance
              ? `${selectedInstance.name}: eventos disparados apenas por esta instância.`
              : 'Eventos globais continuam funcionando para todas as instâncias.'}
          </p>
        </div>
        <form
          className="space-y-5 p-4"
          onSubmit={event => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Configure webhooks</p>
            <p className="mt-1 text-sm text-gray-400">
              Preencha apenas os eventos que deseja ativar. Cada campo pode apontar para uma URL diferente.
            </p>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {webhookHookFields.map(field => {
              const Icon = field.icon;
              return (
                <label key={field.key} className="block space-y-2">
                  <span className="text-sm font-medium text-gray-300">{field.label}</span>
                  <span className="relative block">
                    <Icon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                    <Input
                      className="pl-9"
                      placeholder={field.placeholder}
                      value={hookUrls[field.key] ?? ''}
                      onChange={event =>
                        setHookUrls(current => ({
                          ...current,
                          [field.key]: event.target.value,
                        }))
                      }
                    />
                  </span>
                </label>
              );
            })}
          </div>
          <div className="flex justify-end">
            <Button className="w-full sm:w-auto" disabled={!organizationId || !hasWebhookChange || create.isPending}>
              <Webhook size={18} />
              Salvar webhooks
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

function DashboardMetricCard({
  icon: Icon,
  title,
  value,
  description,
  tone = 'green',
}: {
  icon: typeof Bell;
  title: string;
  value: string | number;
  description: string;
  tone?: 'green' | 'blue' | 'red' | 'teal';
}) {
  const tones = {
    green: 'bg-[#12351f] text-[#2edb5c]',
    blue: 'bg-blue-500/15 text-blue-300',
    red: 'bg-red-500/15 text-red-300',
    teal: 'bg-cyan-500/15 text-cyan-300',
  };

  return (
    <section className="rounded-xl border border-[#2d3036] bg-[#181a21] p-4">
      <div className="flex items-center gap-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon size={22} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-400">{title}</p>
          <strong className="mt-1 block text-2xl">{value}</strong>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
      </div>
    </section>
  );
}

function ChartTooltipContent({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ color?: string; name?: string; value?: number | string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-[#2d3036] bg-[#0f1117] px-3 py-2 shadow-xl">
      <p className="mb-2 text-xs font-medium text-gray-400">{label}</p>
      <div className="space-y-1.5">
        {payload.map(item => (
          <div key={item.name} className="flex min-w-32 items-center justify-between gap-4 text-sm">
            <span className="flex items-center gap-2 text-gray-300">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              {item.name}
            </span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardHome({ summary }: { summary?: DashboardSummary }) {
  const typeLabels: Record<keyof DashboardSummary['byType'], string> = {
    TEXT: 'Textos',
    IMAGE: 'Imagens',
    AUDIO: 'Áudios',
    DOCUMENT: 'Documentos',
    VIDEO: 'Vídeos',
    STICKER: 'Figurinhas',
    UNKNOWN: 'Outros',
  };
  const timeline = summary?.timeline.map(item => ({
    ...item,
    label: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(`${item.date}T00:00:00`)),
  })) ?? [];
  const maxTypeCount = Math.max(1, ...Object.values(summary?.byType ?? { TEXT: 0, IMAGE: 0, AUDIO: 0, DOCUMENT: 0, VIDEO: 0, STICKER: 0, UNKNOWN: 0 }));

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">Visão geral</h2>
          <p className="text-sm text-gray-400">Instâncias, mensagens e integrações da operação.</p>
        </div>
        <p className="w-fit max-w-full rounded-full border border-[#2d3036] bg-[#181a21] px-3 py-1 text-xs text-gray-400">
          Atualizado em {summary ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(summary.generatedAt)) : 'carregando'}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <DashboardMetricCard icon={Smartphone} title="Total de instâncias" value={summary?.counts.instances ?? 0} description="Instâncias cadastradas" tone="blue" />
        <DashboardMetricCard icon={CheckCircle2} title="Instâncias conectadas" value={summary?.counts.connected ?? 0} description="Prontas para envio" />
        <DashboardMetricCard icon={Power} title="Instâncias desconectadas" value={summary?.counts.disconnected ?? 0} description="Requerem atenção" tone="red" />
        <DashboardMetricCard icon={MessageCircle} title="Enviadas" value={summary?.counts.sent ?? 0} description="Últimos 30 dias" tone="teal" />
        <DashboardMetricCard icon={MessageCircle} title="Recebidas" value={summary?.counts.received ?? 0} description="Últimos 30 dias" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="rounded-xl border border-[#2d3036] bg-[#181a21]">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="p-5 pb-0">
              <h2 className="font-semibold">Mensagens no último mês</h2>
              <p className="text-sm text-gray-400">Enviadas e recebidas por dia</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 px-5 pb-0 text-xs text-gray-400 sm:p-5 sm:pb-0">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#2edb5c]" /> Enviadas</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#ff8a1f]" /> Recebidas</span>
              <BarChart3 className="text-gray-500" size={18} />
            </div>
          </div>
          <div className="h-72 px-1 pb-4 sm:h-80 sm:px-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeline} margin={{ left: 8, right: 18, top: 12, bottom: 0 }}>
                <defs>
                  <linearGradient id="sentGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2edb5c" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#2edb5c" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="receivedGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ff8a1f" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#ff8a1f" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#252932" vertical={false} />
                <XAxis dataKey="label" stroke="#8a91a1" tickLine={false} axisLine={false} minTickGap={24} tickMargin={10} />
                <YAxis stroke="#8a91a1" tickLine={false} axisLine={false} allowDecimals={false} width={34} />
                <Tooltip
                  cursor={{ stroke: '#3b4250', strokeDasharray: '4 4' }}
                  content={<ChartTooltipContent />}
                />
                <Area type="monotone" dataKey="sent" name="Enviadas" stroke="#2edb5c" strokeWidth={2} fill="url(#sentGradient)" activeDot={{ r: 4 }} />
                <Area type="monotone" dataKey="received" name="Recebidas" stroke="#ff8a1f" strokeWidth={2} fill="url(#receivedGradient)" activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <div className="grid gap-4">
          <section className="rounded-xl border border-[#2d3036] bg-[#181a21] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Tipos de mensagem</h2>
                <p className="text-sm text-gray-400">Distribuição no período</p>
              </div>
              <MessageCircle className="text-gray-500" size={18} />
            </div>
            <div className="mt-4 space-y-3">
              {(Object.keys(typeLabels) as Array<keyof DashboardSummary['byType']>).map(type => {
                const value = summary?.byType[type] ?? 0;

                return (
                  <div key={type}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-gray-400">{typeLabels[type]}</span>
                      <strong className="text-[#2edb5c]">{value}</strong>
                    </div>
                    <div className="h-2 rounded-full bg-[#101218]">
                      <div className="h-2 rounded-full bg-[#2edb5c]" style={{ width: value ? `${Math.max(4, (value / maxTypeCount) * 100)}%` : '0%' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="grid gap-3 rounded-xl border border-[#2d3036] bg-[#181a21] p-5">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-[#111318] p-3">
                <strong className="block text-xl">{summary?.counts.contacts ?? 0}</strong>
                <span className="text-xs text-gray-500">Contatos</span>
              </div>
              <div className="rounded-lg bg-[#111318] p-3">
                <strong className="block text-xl">{summary?.counts.apiKeys ?? 0}</strong>
                <span className="text-xs text-gray-500">API keys</span>
              </div>
              <div className="rounded-lg bg-[#111318] p-3">
                <strong className="block text-xl">{summary?.counts.webhooks ?? 0}</strong>
                <span className="text-xs text-gray-500">Webhooks</span>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="overflow-hidden rounded-xl border border-[#2d3036] bg-[#181a21]">
          <div className="border-b border-[#2d3036] p-4">
            <h2 className="font-semibold">Instâncias</h2>
            <p className="text-sm text-gray-400">Status operacional das conexões</p>
          </div>
          <div className="divide-y divide-[#2d3036]">
            {(summary?.instances ?? []).map(instance => (
              <div key={instance.id} className="grid gap-3 p-4 text-sm md:grid-cols-[1fr_auto_auto] md:items-center">
                <div>
                  <strong>{instance.name}</strong>
                  <p className="text-gray-500">{instance.phoneNumber ?? 'Sem número conectado'}</p>
                </div>
                <StatusPill status={instance.status} />
                <span className="text-gray-500">{formatRelativeChatTime(instance.updatedAt)}</span>
              </div>
            ))}
            {(summary?.instances.length ?? 0) === 0 && <div className="p-4 text-sm text-gray-500">Nenhuma instância cadastrada.</div>}
          </div>
        </section>

        <section className="rounded-xl border border-[#2d3036] bg-[#181a21] p-5">
          <h2 className="font-semibold">Atividade recente</h2>
          <div className="mt-4 space-y-3">
            {(summary?.recentMessages ?? []).map(message => (
              <div key={message.id} className="rounded-lg bg-[#111318] p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <strong className="truncate">{message.fromMe ? 'Enviada' : 'Recebida'} · {message.instanceName}</strong>
                  <span className="text-xs text-gray-500">{formatRelativeChatTime(message.createdAt)}</span>
                </div>
                <p className="mt-1 truncate text-gray-400">{message.body ?? message.type}</p>
              </div>
            ))}
            {(summary?.recentMessages.length ?? 0) === 0 && <p className="text-sm text-gray-500">Nenhuma mensagem ainda.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title }: { icon: typeof Bell; title: string }) {
  return (
    <section className="rounded-lg border border-[#2d3036] bg-[#181a21] p-8 text-center text-gray-400">
      <Icon className="mx-auto mb-3" />
      {title}
    </section>
  );
}

function CodeSnippet({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-[#2d3036] bg-[#0d0f14] p-4 text-xs leading-relaxed text-gray-300">
      <code>{children}</code>
    </pre>
  );
}

function DocsCodeBlock({ title, code }: { title: string; code: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#2d3036] bg-[#0d0f14]">
      <div className="flex items-center justify-between border-b border-[#2d3036] px-4 py-3">
        <span className="text-xs font-semibold text-gray-400">{title}</span>
        <button
          type="button"
          className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-gray-400 transition hover:bg-[#23262e] hover:text-white"
          onClick={() => navigator.clipboard?.writeText(code)}
          aria-label={`Copiar ${title}`}
        >
          <Copy size={15} />
        </button>
      </div>
      <pre className="max-h-[420px] overflow-auto p-4 text-xs leading-relaxed text-gray-300">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function MethodBadge({ method }: { method: string }) {
  const color =
    method === 'GET'
      ? 'bg-emerald-500/15 text-emerald-300'
      : method === 'POST'
        ? 'bg-blue-500/15 text-blue-300'
        : method === 'PATCH'
          ? 'bg-amber-500/15 text-amber-300'
          : method === 'DELETE'
            ? 'bg-red-500/15 text-red-300'
        : 'bg-gray-500/15 text-gray-300';

  return (
    <span className={`inline-flex h-6 items-center rounded-md px-2 font-mono text-xs font-semibold ${color}`}>
      {method}
    </span>
  );
}

type DocsEndpoint = {
  id: string;
  group: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  title: string;
  path: string;
  description: string;
  requestBody?: string;
  responseBody: string;
  curl: string;
  notes: string[];
};

function DocsView({ selectedInstance }: { selectedInstance?: WhatsAppInstance }) {
  const exampleInstanceId = selectedInstance?.id ?? 'instancia_id';
  const exampleChatId = 'chat_123';
  const exampleGroupId = '120363000000000000@g.us';
  const examplePhone = '5585999999999';
  const exampleCommunityId = '120363111111111111@g.us';
  const exampleNewsletterId = '120363222222222222@newsletter';
  const exampleProductId = 'produto_123';
  const exampleTagId = 'tag_123';
  const exampleQueueItemId = 'job_123';
  const exampleOperationId = 'op_123';
  const publicBaseUrl = absoluteApiUrl('/v1');
  const [activeDocId, setActiveDocId] = useState('intro');
  const [referenceMenuOpen, setReferenceMenuOpen] = useState(false);
  const queuedResponse = `{
  "messageId": "msg_123",
  "status": "QUEUED"
}`;
  const operationResponse = `{
  "operationId": "${exampleOperationId}",
  "status": "QUEUED"
}`;
  function autoCurl(method: DocsEndpoint['method'], path: string, body?: string) {
    const url = `${publicBaseUrl}${path.replace('/v1', '')}`;
    const headers = `  -H "Authorization: Bearer ravox_live_xxxxx"`;

    if (body) {
      return `curl -X ${method} "${url}" \\
${headers} \\
  -H "Content-Type: application/json" \\
  -d '${body}'`;
    }

    return method === 'GET'
      ? `curl "${url}" \\
${headers}`
      : `curl -X ${method} "${url}" \\
${headers}`;
  }

  function autoDoc(input: Omit<DocsEndpoint, 'curl' | 'responseBody' | 'notes'> & Partial<Pick<DocsEndpoint, 'curl' | 'responseBody' | 'notes'>>) {
    return {
      responseBody: operationResponse,
      notes: [
        'Rotas que retornam operationId são assíncronas: consulte GET /operations/:operationId para obter SUCCESS, FAILED e result.',
        'A execução depende da instância conectada, das permissões reais no WhatsApp e dos recursos disponíveis na conta.',
      ],
      ...input,
      curl: input.curl ?? autoCurl(input.method, input.path, input.requestBody),
    };
  }

  const baseDocs: DocsEndpoint[] = [
    {
      id: 'send-text',
      group: 'Mensagens',
      method: 'POST',
      title: 'Enviar texto',
      path: `/v1/instances/${exampleInstanceId}/send-text`,
      description: 'Enfileira uma mensagem de texto para um contato usando uma instância conectada.',
      requestBody: `{
  "to": "+5585999999999",
  "body": "Olá, mensagem enviada pela RavoxZap"
}`,
      responseBody: queuedResponse,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/send-text" \\
  -H "Authorization: Bearer ravox_live_xxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "+5585999999999",
    "body": "Olá, mensagem enviada pela RavoxZap"
}'`,
      notes: ['O campo to deve usar formato internacional: +55 + DDD + número. Também aceitamos somente dígitos, como 5585999999999.', 'O envio é assíncrono: o worker processa a fila e atualiza o status da mensagem.'],
    },
    {
      id: 'send-image',
      group: 'Mensagens',
      method: 'POST',
      title: 'Enviar imagem',
      path: `/v1/instances/${exampleInstanceId}/send-image`,
      description: 'Envia uma imagem por URL pública ou data URL base64. O limite inicial é 15MB.',
      requestBody: `{
  "to": "+5585999999999",
  "image": "https://site.com/imagem.png",
  "caption": "Legenda opcional"
}`,
      responseBody: `{
  "messageId": "msg_123",
  "status": "QUEUED",
  "type": "IMAGE",
  "mediaUrl": "/media/${exampleInstanceId}/arquivo.png"
}`,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/send-image" \\
  -H "Authorization: Bearer ravox_live_xxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "+5585999999999",
    "image": "https://site.com/imagem.png",
    "caption": "Legenda opcional"
  }'`,
      notes: ['Aceita image/jpeg, image/png, image/webp e outros MIME types de imagem.', 'Também aceita data:image/png;base64,... para arquivos pequenos ou gerados em runtime.'],
    },
    {
      id: 'send-audio',
      group: 'Mensagens',
      method: 'POST',
      title: 'Enviar áudio',
      path: `/v1/instances/${exampleInstanceId}/send-audio`,
      description: 'Envia um áudio por URL pública ou data URL base64. O limite inicial é 20MB.',
      requestBody: `{
  "to": "+5585999999999",
  "audio": "https://site.com/audio.mp3"
}`,
      responseBody: `{
  "messageId": "msg_123",
  "status": "QUEUED",
  "type": "AUDIO",
  "mediaUrl": "/media/${exampleInstanceId}/audio.mp3"
}`,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/send-audio" \\
  -H "Authorization: Bearer ravox_live_xxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "+5585999999999",
    "audio": "https://site.com/audio.mp3"
  }'`,
      notes: ['A URL precisa responder com content-type de áudio.', 'O arquivo é salvo localmente antes de ser enviado pelo worker.'],
    },
    {
      id: 'send-video',
      group: 'Mensagens',
      method: 'POST',
      title: 'Enviar vídeo',
      path: `/v1/instances/${exampleInstanceId}/send-video`,
      description: 'Envia um vídeo por URL pública ou data URL base64. O limite inicial é 100MB.',
      requestBody: `{
  "to": "+5585999999999",
  "video": "https://site.com/video.mp4",
  "caption": "Legenda opcional"
}`,
      responseBody: `{
  "messageId": "msg_123",
  "status": "QUEUED",
  "type": "VIDEO",
  "mediaUrl": "/media/${exampleInstanceId}/video.mp4"
}`,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/send-video" \\
  -H "Authorization: Bearer ravox_live_xxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "+5585999999999",
    "video": "https://site.com/video.mp4",
    "caption": "Legenda opcional"
  }'`,
      notes: ['Use mp4 sempre que possível para melhor compatibilidade.', 'Arquivos grandes dependem da estabilidade da VPS e do tempo de download da URL.'],
    },
    {
      id: 'send-document',
      group: 'Mensagens',
      method: 'POST',
      title: 'Enviar documento',
      path: `/v1/instances/${exampleInstanceId}/send-document`,
      description: 'Envia um documento por URL pública ou data URL base64. O limite inicial é 50MB.',
      requestBody: `{
  "to": "+5585999999999",
  "document": "https://site.com/contrato.pdf",
  "fileName": "contrato.pdf",
  "caption": "Legenda opcional"
}`,
      responseBody: `{
  "messageId": "msg_123",
  "status": "QUEUED",
  "type": "DOCUMENT",
  "mediaUrl": "/media/${exampleInstanceId}/contrato.pdf"
}`,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/send-document" \\
  -H "Authorization: Bearer ravox_live_xxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "+5585999999999",
    "document": "https://site.com/contrato.pdf",
    "fileName": "contrato.pdf"
  }'`,
      notes: ['Use fileName para controlar o nome exibido no WhatsApp.', 'Documentos aceitam MIME types genéricos como application/pdf ou application/octet-stream.'],
    },
    {
      id: 'status',
      group: 'Instância',
      method: 'GET',
      title: 'Consultar status',
      path: `/v1/instances/${exampleInstanceId}/status`,
      description: 'Retorna o estado atual da conexão e os dados básicos do número conectado.',
      responseBody: `{
  "instanceId": "${exampleInstanceId}",
  "status": "CONNECTED",
  "phoneNumber": "5585999999999",
  "profileName": "RavoxZap"
}`,
      curl: `curl "${publicBaseUrl}/instances/${exampleInstanceId}/status" \\
  -H "Authorization: Bearer ravox_live_xxxxx"`,
      notes: ['Use esta rota antes de enviar mensagens para saber se a instância está pronta.', 'Status comuns: CONNECTED, WAITING_QR, CONNECTING, DISCONNECTED, LOGGED_OUT e ERROR.'],
    },
    {
      id: 'qrcode',
      group: 'Instância',
      method: 'GET',
      title: 'Buscar QR Code',
      path: `/v1/instances/${exampleInstanceId}/qrcode`,
      description: 'Retorna o QR Code atual da instância quando ela estiver aguardando leitura.',
      responseBody: `{
  "instanceId": "${exampleInstanceId}",
  "status": "WAITING_QR",
  "qrCode": "2@abc...",
  "qrUpdatedAt": "2026-05-27T20:00:00.000Z"
}`,
      curl: `curl "${publicBaseUrl}/instances/${exampleInstanceId}/qrcode" \\
  -H "Authorization: Bearer ravox_live_xxxxx"`,
      notes: ['O campo qrCode pode vir null se a instância já estiver conectada ou ainda estiver iniciando.', 'Se o QR falhar, gere outro pelo painel ou reinicie a instância.'],
    },
    {
      id: 'restart',
      group: 'Instância',
      method: 'POST',
      title: 'Reiniciar conexão',
      path: `/v1/instances/${exampleInstanceId}/restart`,
      description: 'Reinicia a conexão da instância mantendo a sessão local, quando possível.',
      responseBody: `{
  "queued": true,
  "instanceId": "${exampleInstanceId}"
}`,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/restart" \\
  -H "Authorization: Bearer ravox_live_xxxxx"`,
      notes: ['Use quando a instância ficar instável ou desconectada.', 'Esta ação não limpa a sessão; normalmente não exige nova leitura de QR Code.'],
    },
    {
      id: 'logout',
      group: 'Instância',
      method: 'POST',
      title: 'Desconectar e remover sessão',
      path: `/v1/instances/${exampleInstanceId}/logout`,
      description: 'Remove a sessão da instância e força uma nova autenticação por QR Code.',
      responseBody: `{
  "queued": true,
  "instanceId": "${exampleInstanceId}"
}`,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/logout" \\
  -H "Authorization: Bearer ravox_live_xxxxx"`,
      notes: ['Use quando quiser trocar o número conectado ou limpar uma sessão problemática.', 'Depois do logout, abra a instância e leia um novo QR Code.'],
    },
    {
      id: 'chats',
      group: 'Conversas',
      method: 'GET',
      title: 'Listar chats',
      path: `/v1/instances/${exampleInstanceId}/chats`,
      description: 'Lista as conversas salvas para a instância vinculada à API Key.',
      responseBody: `[
  {
    "id": "${exampleChatId}",
    "instanceId": "${exampleInstanceId}",
    "remoteJid": "5585999999999@s.whatsapp.net",
    "name": "Cliente",
    "createdAt": "2026-05-27T20:00:00.000Z",
    "updatedAt": "2026-05-27T20:10:00.000Z"
  }
]`,
      curl: `curl "${publicBaseUrl}/instances/${exampleInstanceId}/chats" \\
  -H "Authorization: Bearer ravox_live_xxxxx"`,
      notes: ['Retorna no máximo 100 conversas por chamada neste MVP.', 'A lista respeita o escopo da organização da API Key.'],
    },
    {
      id: 'messages',
      group: 'Conversas',
      method: 'GET',
      title: 'Listar mensagens',
      path: `/v1/instances/${exampleInstanceId}/chats/${exampleChatId}/messages`,
      description: 'Lista as mensagens salvas de uma conversa específica.',
      responseBody: `[
  {
    "id": "msg_123",
    "instanceId": "${exampleInstanceId}",
    "chatId": "${exampleChatId}",
    "remoteJid": "5585999999999@s.whatsapp.net",
    "fromMe": true,
    "type": "TEXT",
    "body": "Olá",
    "mediaUrl": null,
    "status": "SENT",
    "createdAt": "2026-05-27T20:00:00.000Z"
  }
]`,
      curl: `curl "${publicBaseUrl}/instances/${exampleInstanceId}/chats/${exampleChatId}/messages" \\
  -H "Authorization: Bearer ravox_live_xxxxx"`,
      notes: ['Retorna no máximo 200 mensagens por chamada neste MVP.', 'Use o chatId retornado pela listagem de chats.'],
    },
    {
      id: 'chat-detail',
      group: 'Conversas',
      method: 'GET',
      title: 'Metadata do chat',
      path: `/v1/instances/${exampleInstanceId}/chats/${exampleChatId}`,
      description: 'Retorna dados operacionais do chat, incluindo arquivamento, fixação, leitura e silenciamento.',
      responseBody: `{
  "id": "${exampleChatId}",
  "remoteJid": "5585999999999@s.whatsapp.net",
  "name": "Cliente",
  "archivedAt": null,
  "pinnedAt": null,
  "mutedUntil": null,
  "isRead": true,
  "unreadCount": 0,
  "ephemeralExpiration": null
}`,
      curl: `curl "${publicBaseUrl}/instances/${exampleInstanceId}/chats/${exampleChatId}" \\
  -H "Authorization: Bearer ravox_live_xxxxx"`,
      notes: ['Use esta rota para confirmar o estado local do chat depois de uma operação.', 'O cache é atualizado pelo worker após sucesso no WhatsApp.'],
    },
    {
      id: 'chat-read',
      group: 'Conversas',
      method: 'POST',
      title: 'Marcar chat como lido',
      path: `/v1/instances/${exampleInstanceId}/chats/${exampleChatId}/read`,
      description: 'Cria uma operação assíncrona para marcar o chat como lido ou não lido.',
      requestBody: `{
  "read": true
}`,
      responseBody: operationResponse,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/chats/${exampleChatId}/read" \\
  -H "Authorization: Bearer ravox_live_xxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"read":true}'`,
      notes: ['Retorna operationId porque a confirmação depende do socket WhatsApp.', 'Consulte a operação para ver SUCCESS ou FAILED.'],
    },
    {
      id: 'chat-archive',
      group: 'Conversas',
      method: 'POST',
      title: 'Arquivar chat',
      path: `/v1/instances/${exampleInstanceId}/chats/${exampleChatId}/archive`,
      description: 'Arquiva ou desarquiva uma conversa no WhatsApp e no cache local.',
      requestBody: `{
  "archived": true
}`,
      responseBody: operationResponse,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/chats/${exampleChatId}/archive" \\
  -H "Authorization: Bearer ravox_live_xxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"archived":true}'`,
      notes: ['Envie false para desarquivar.', 'A lista de chats pública não retorna chats com delete local.'],
    },
    {
      id: 'chat-pin',
      group: 'Conversas',
      method: 'POST',
      title: 'Fixar chat',
      path: `/v1/instances/${exampleInstanceId}/chats/${exampleChatId}/pin`,
      description: 'Fixa ou desafixa uma conversa.',
      requestBody: `{
  "pinned": true
}`,
      responseBody: operationResponse,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/chats/${exampleChatId}/pin" \\
  -H "Authorization: Bearer ravox_live_xxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"pinned":true}'`,
      notes: ['Envie false para desafixar.', 'O painel usa este campo para os filtros de chats fixados.'],
    },
    {
      id: 'chat-mute',
      group: 'Conversas',
      method: 'POST',
      title: 'Mutar chat',
      path: `/v1/instances/${exampleInstanceId}/chats/${exampleChatId}/mute`,
      description: 'Silencia o chat até uma data ou remove o silêncio enviando null.',
      requestBody: `{
  "mutedUntil": "2026-06-01T12:00:00.000Z"
}`,
      responseBody: operationResponse,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/chats/${exampleChatId}/mute" \\
  -H "Authorization: Bearer ravox_live_xxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"mutedUntil":"2026-06-01T12:00:00.000Z"}'`,
      notes: ['Use data ISO 8601.', 'Para remover silêncio, envie {"mutedUntil": null}.'],
    },
    {
      id: 'chat-clear',
      group: 'Conversas',
      method: 'POST',
      title: 'Limpar chat',
      path: `/v1/instances/${exampleInstanceId}/chats/${exampleChatId}/clear`,
      description: 'Limpa as mensagens da conversa após comando confirmado pelo WhatsApp.',
      responseBody: operationResponse,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/chats/${exampleChatId}/clear" \\
  -H "Authorization: Bearer ravox_live_xxxxx"`,
      notes: ['A limpeza local acontece somente depois do sucesso no worker.', 'Use com cuidado: a ação remove histórico local desse chat.'],
    },
    {
      id: 'chat-delete',
      group: 'Conversas',
      method: 'POST',
      title: 'Excluir chat',
      path: `/v1/instances/${exampleInstanceId}/chats/${exampleChatId}/delete`,
      description: 'Remove a conversa no WhatsApp e aplica soft delete no cache local.',
      responseBody: operationResponse,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/chats/${exampleChatId}/delete" \\
  -H "Authorization: Bearer ravox_live_xxxxx"`,
      notes: ['O chat deixa de aparecer em GET /chats.', 'Mensagens antigas permanecem no banco para auditoria enquanto o soft delete estiver ativo.'],
    },
    {
      id: 'chat-ephemeral',
      group: 'Conversas',
      method: 'POST',
      title: 'Expiração do chat',
      path: `/v1/instances/${exampleInstanceId}/chats/${exampleChatId}/ephemeral`,
      description: 'Configura mensagens temporárias em segundos.',
      requestBody: `{
  "expirationSeconds": 86400
}`,
      responseBody: operationResponse,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/chats/${exampleChatId}/ephemeral" \\
  -H "Authorization: Bearer ravox_live_xxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"expirationSeconds":86400}'`,
      notes: ['Use 0 para desativar quando o WhatsApp aceitar essa operação.', 'O limite atual é de até 1 ano em segundos.'],
    },
    {
      id: 'operations',
      group: 'Operações',
      method: 'GET',
      title: 'Consultar operação',
      path: `/v1/instances/${exampleInstanceId}/operations/${exampleOperationId}`,
      description: 'Consulta uma ação assíncrona de grupo ou chat enfileirada no worker.',
      responseBody: `{
  "operationId": "${exampleOperationId}",
  "instanceId": "${exampleInstanceId}",
  "type": "GROUP_CREATE",
  "status": "SUCCESS",
  "input": {},
  "result": {},
  "error": null,
  "createdAt": "2026-05-28T10:00:00.000Z",
  "updatedAt": "2026-05-28T10:00:05.000Z"
}`,
      curl: `curl "${publicBaseUrl}/instances/${exampleInstanceId}/operations/${exampleOperationId}" \\
  -H "Authorization: Bearer ravox_live_xxxxx"`,
      notes: ['Status possíveis: QUEUED, RUNNING, SUCCESS e FAILED.', 'Quando falhar, o campo error traz a mensagem legível do worker.'],
    },
    {
      id: 'groups',
      group: 'Grupos',
      method: 'GET',
      title: 'Listar grupos',
      path: `/v1/instances/${exampleInstanceId}/groups`,
      description: 'Retorna o cache local de grupos e participantes da instância.',
      responseBody: `[
  {
    "id": "grp_123",
    "remoteJid": "${exampleGroupId}",
    "subject": "Grupo suporte",
    "description": null,
    "size": 2,
    "inviteCode": null,
    "lastSyncedAt": "2026-05-28T10:00:00.000Z",
    "participants": []
  }
]`,
      curl: `curl "${publicBaseUrl}/instances/${exampleInstanceId}/groups" \\
  -H "Authorization: Bearer ravox_live_xxxxx"`,
      notes: ['Esta rota não chama o WhatsApp em tempo real.', 'Use sincronizar grupos para atualizar o cache via worker.'],
    },
    {
      id: 'groups-sync',
      group: 'Grupos',
      method: 'POST',
      title: 'Sincronizar grupos',
      path: `/v1/instances/${exampleInstanceId}/groups/sync`,
      description: 'Enfileira uma sincronização de grupos pelo socket WhatsApp.',
      responseBody: operationResponse,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/groups/sync" \\
  -H "Authorization: Bearer ravox_live_xxxxx"`,
      notes: ['Atualiza grupos e participantes no banco.', 'Depois consulte GET /groups ou a operação.'],
    },
    {
      id: 'groups-create',
      group: 'Grupos',
      method: 'POST',
      title: 'Criar grupo',
      path: `/v1/instances/${exampleInstanceId}/groups`,
      description: 'Cria um grupo com nome, participantes iniciais e convite automático opcional.',
      requestBody: `{
  "groupName": "Grupo suporte",
  "phones": ["+5585999999999", "5585888888888"],
  "autoInvite": true
}`,
      responseBody: operationResponse,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/groups" \\
  -H "Authorization: Bearer ravox_live_xxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"groupName":"Grupo suporte","phones":["+5585999999999"],"autoInvite":true}'`,
      notes: [
        'Também aceita o formato legado name + participants.',
        '@lid não é aceito na criação; esses itens aparecem em phonesNotAdded no resultado da operação.',
        'Quando autoInvite=true, números não adicionados diretamente recebem o link no privado quando possível.',
      ],
    },
    {
      id: 'group-detail',
      group: 'Grupos',
      method: 'GET',
      title: 'Metadata do grupo',
      path: `/v1/instances/${exampleInstanceId}/groups/${exampleGroupId}`,
      description: 'Retorna dados do grupo salvo no cache local.',
      responseBody: `{
  "id": "grp_123",
  "remoteJid": "${exampleGroupId}",
  "subject": "Grupo suporte",
  "participants": [
    { "jid": "5585999999999@s.whatsapp.net", "isAdmin": true, "isSuperAdmin": false }
  ]
}`,
      curl: `curl "${publicBaseUrl}/instances/${exampleInstanceId}/groups/${exampleGroupId}" \\
  -H "Authorization: Bearer ravox_live_xxxxx"`,
      notes: ['groupId pode ser o ID interno do banco ou o remoteJid terminado em @g.us.', 'Use sync para atualizar participantes.'],
    },
    {
      id: 'group-metadata-sync',
      group: 'Grupos',
      method: 'POST',
      title: 'Sincronizar metadata do grupo',
      path: `/v1/instances/${exampleInstanceId}/groups/${exampleGroupId}/metadata/sync`,
      description: 'Busca os dados atuais do grupo no WhatsApp e atualiza o cache local.',
      responseBody: operationResponse,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/groups/${exampleGroupId}/metadata/sync" \\
  -H "Authorization: Bearer ravox_live_xxxxx"`,
      notes: ['Útil depois de alterar foto, participantes ou configurações fora do RavoxZap.', 'A resposta final fica na operação.'],
    },
    {
      id: 'group-metadata-light',
      group: 'Grupos',
      method: 'GET',
      title: 'Metadata light',
      path: `/v1/instances/${exampleInstanceId}/groups/${exampleGroupId}/metadata/light`,
      description: 'Retorna metadata cacheada sem carregar a lista de participantes.',
      responseBody: `{
  "id": "grp_123",
  "remoteJid": "${exampleGroupId}",
  "subject": "Grupo suporte",
  "size": 42,
  "announce": false,
  "restrict": true,
  "pictureUrl": null
}`,
      curl: `curl "${publicBaseUrl}/instances/${exampleInstanceId}/groups/${exampleGroupId}/metadata/light" \\
  -H "Authorization: Bearer ravox_live_xxxxx"`,
      notes: ['Esta rota usa cache local.', 'Use metadata/sync quando precisar consultar o WhatsApp em tempo real.'],
    },
    {
      id: 'group-name',
      group: 'Grupos',
      method: 'POST',
      title: 'Atualizar nome do grupo',
      path: `/v1/instances/${exampleInstanceId}/groups/${exampleGroupId}/name`,
      description: 'Atualiza o assunto/nome do grupo.',
      requestBody: `{
  "name": "Novo nome"
}`,
      responseBody: operationResponse,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/groups/${exampleGroupId}/name" \\
  -H "Authorization: Bearer ravox_live_xxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Novo nome"}'`,
      notes: ['A instância precisa ter permissão para alterar dados do grupo.', 'O cache é atualizado após sucesso.'],
    },
    {
      id: 'group-description',
      group: 'Grupos',
      method: 'POST',
      title: 'Atualizar descrição',
      path: `/v1/instances/${exampleInstanceId}/groups/${exampleGroupId}/description`,
      description: 'Atualiza a descrição do grupo.',
      requestBody: `{
  "description": "Descrição do grupo"
}`,
      responseBody: operationResponse,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/groups/${exampleGroupId}/description" \\
  -H "Authorization: Bearer ravox_live_xxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"description":"Descrição do grupo"}'`,
      notes: ['Aceita string vazia para limpar a descrição.', 'Respeita permissões reais do WhatsApp.'],
    },
    {
      id: 'group-photo',
      group: 'Grupos',
      method: 'POST',
      title: 'Atualizar foto do grupo',
      path: `/v1/instances/${exampleInstanceId}/groups/${exampleGroupId}/photo`,
      description: 'Atualiza a imagem do grupo usando URL, data URL ou base64.',
      requestBody: `{
  "image": "https://example.com/grupo.jpg"
}`,
      responseBody: operationResponse,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/groups/${exampleGroupId}/photo" \\
  -H "Authorization: Bearer ravox_live_xxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"image":"https://example.com/grupo.jpg"}'`,
      notes: ['Também aceita imageUrl ou imageBase64.', 'A instância precisa ter permissão para alterar a foto.'],
    },
    {
      id: 'group-settings',
      group: 'Grupos',
      method: 'POST',
      title: 'Configurações do grupo',
      path: `/v1/instances/${exampleInstanceId}/groups/${exampleGroupId}/settings`,
      description: 'Atualiza permissões de envio, edição, entrada e mensagens temporárias.',
      requestBody: `{
  "messages": "admins",
  "info": "admins",
  "addMembers": "all",
  "joinApproval": true,
  "ephemeralSeconds": 86400
}`,
      responseBody: operationResponse,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/groups/${exampleGroupId}/settings" \\
  -H "Authorization: Bearer ravox_live_xxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"messages":"admins","info":"admins","joinApproval":true}'`,
      notes: ['Envie apenas os campos que deseja alterar.', 'Use 0 em ephemeralSeconds para desativar mensagens temporárias.'],
    },
    {
      id: 'group-participants-add',
      group: 'Grupos',
      method: 'POST',
      title: 'Adicionar participantes',
      path: `/v1/instances/${exampleInstanceId}/groups/${exampleGroupId}/participants/add`,
      description: 'Adiciona participantes ao grupo.',
      requestBody: `{
  "participants": ["+5585999999999"],
  "autoInvite": true
}`,
      responseBody: operationResponse,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/groups/${exampleGroupId}/participants/add" \\
  -H "Authorization: Bearer ravox_live_xxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"participants":["+5585999999999"],"autoInvite":true}'`,
      notes: ['Aceita até 256 participantes por chamada.', 'Quando autoInvite=true, números não adicionados recebem convite privado quando possível.'],
    },
    {
      id: 'group-requests-list',
      group: 'Grupos',
      method: 'POST',
      title: 'Listar solicitações pendentes',
      path: `/v1/instances/${exampleInstanceId}/groups/${exampleGroupId}/requests/list`,
      description: 'Lista pedidos pendentes de entrada no grupo.',
      responseBody: operationResponse,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/groups/${exampleGroupId}/requests/list" \\
  -H "Authorization: Bearer ravox_live_xxxxx"`,
      notes: ['A instância precisa ser admin quando o WhatsApp exigir.', 'O resultado vem no campo result.requests da operação.'],
    },
    {
      id: 'group-requests-approve',
      group: 'Grupos',
      method: 'POST',
      title: 'Aprovar solicitações',
      path: `/v1/instances/${exampleInstanceId}/groups/${exampleGroupId}/requests/approve`,
      description: 'Aprova participantes que solicitaram entrada no grupo.',
      requestBody: `{
  "participants": ["+5585999999999"]
}`,
      responseBody: operationResponse,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/groups/${exampleGroupId}/requests/approve" \\
  -H "Authorization: Bearer ravox_live_xxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"participants":["+5585999999999"]}'`,
      notes: ['Use requests/reject com o mesmo body para rejeitar.', 'Após sucesso, o cache do grupo é atualizado.'],
    },
    {
      id: 'group-participants-remove',
      group: 'Grupos',
      method: 'POST',
      title: 'Remover participantes',
      path: `/v1/instances/${exampleInstanceId}/groups/${exampleGroupId}/participants/remove`,
      description: 'Remove participantes do grupo.',
      requestBody: `{
  "participants": ["+5585999999999"]
}`,
      responseBody: operationResponse,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/groups/${exampleGroupId}/participants/remove" \\
  -H "Authorization: Bearer ravox_live_xxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"participants":["+5585999999999"]}'`,
      notes: ['A instância conectada precisa ser admin quando o WhatsApp exigir.', 'O participante deve pertencer ao grupo.'],
    },
    {
      id: 'group-admins-promote',
      group: 'Grupos',
      method: 'POST',
      title: 'Promover admin',
      path: `/v1/instances/${exampleInstanceId}/groups/${exampleGroupId}/admins/promote`,
      description: 'Promove participantes para admin do grupo.',
      requestBody: `{
  "participants": ["+5585999999999"]
}`,
      responseBody: operationResponse,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/groups/${exampleGroupId}/admins/promote" \\
  -H "Authorization: Bearer ravox_live_xxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"participants":["+5585999999999"]}'`,
      notes: ['A instância precisa ser admin.', 'Use demover admin para remover a permissão depois.'],
    },
    {
      id: 'group-admins-demote',
      group: 'Grupos',
      method: 'POST',
      title: 'Remover admin',
      path: `/v1/instances/${exampleInstanceId}/groups/${exampleGroupId}/admins/demote`,
      description: 'Remove permissão de admin de participantes.',
      requestBody: `{
  "participants": ["+5585999999999"]
}`,
      responseBody: operationResponse,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/groups/${exampleGroupId}/admins/demote" \\
  -H "Authorization: Bearer ravox_live_xxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"participants":["+5585999999999"]}'`,
      notes: ['A instância precisa ter permissão no grupo.', 'O WhatsApp pode bloquear remover o criador do grupo.'],
    },
    {
      id: 'group-mention',
      group: 'Grupos',
      method: 'POST',
      title: 'Mencionar membros',
      path: `/v1/instances/${exampleInstanceId}/groups/${exampleGroupId}/mention`,
      description: 'Envia mensagem no grupo mencionando participantes específicos.',
      requestBody: `{
  "text": "Atenção, pessoal",
  "participants": ["+5585999999999"]
}`,
      responseBody: operationResponse,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/groups/${exampleGroupId}/mention" \\
  -H "Authorization: Bearer ravox_live_xxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"text":"Atenção, pessoal","participants":["+5585999999999"]}'`,
      notes: ['O texto é enviado no grupo via worker.', 'Os JIDs mencionados são normalizados a partir dos telefones.'],
    },
    {
      id: 'group-mention-all',
      group: 'Grupos',
      method: 'POST',
      title: 'Mencionar todos',
      path: `/v1/instances/${exampleInstanceId}/groups/${exampleGroupId}/mention-all`,
      description: 'Envia mensagem mencionando todos os participantes do grupo.',
      requestBody: `{
  "text": "Aviso importante"
}`,
      responseBody: operationResponse,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/groups/${exampleGroupId}/mention-all" \\
  -H "Authorization: Bearer ravox_live_xxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"text":"Aviso importante"}'`,
      notes: ['Usa o suporte nativo de menção geral do WhatsApp quando disponível.', 'O envio depende do tamanho do grupo e limites do WhatsApp.'],
    },
    {
      id: 'group-mention-group',
      group: 'Grupos',
      method: 'POST',
      title: 'Mencionar grupo',
      path: `/v1/instances/${exampleInstanceId}/groups/${exampleGroupId}/mention-group`,
      description: 'Envia mensagem mencionando outro grupo pelo remoteJid.',
      requestBody: `{
  "text": "Veja também o grupo relacionado",
  "groups": ["120363000000000000@g.us"]
}`,
      responseBody: operationResponse,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/groups/${exampleGroupId}/mention-group" \\
  -H "Authorization: Bearer ravox_live_xxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"text":"Veja também o grupo relacionado","groups":["120363000000000000@g.us"]}'`,
      notes: ['Depende dos recursos disponíveis para menções de grupos na conta conectada.', 'A operação falha se o envio não for aceito pelo WhatsApp.'],
    },
    {
      id: 'group-leave',
      group: 'Grupos',
      method: 'POST',
      title: 'Sair do grupo',
      path: `/v1/instances/${exampleInstanceId}/groups/${exampleGroupId}/leave`,
      description: 'Faz a instância conectada sair do grupo.',
      responseBody: operationResponse,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/groups/${exampleGroupId}/leave" \\
  -H "Authorization: Bearer ravox_live_xxxxx"`,
      notes: ['Use com cuidado: o número conectado sai do grupo real.', 'O grupo permanece no cache até uma nova sincronização.'],
    },
    {
      id: 'group-invite-link',
      group: 'Grupos',
      method: 'GET',
      title: 'Gerar link de convite',
      path: `/v1/instances/${exampleInstanceId}/groups/${exampleGroupId}/invite-link`,
      description: 'Enfileira a geração do link de convite do grupo.',
      responseBody: operationResponse,
      curl: `curl "${publicBaseUrl}/instances/${exampleInstanceId}/groups/${exampleGroupId}/invite-link" \\
  -H "Authorization: Bearer ravox_live_xxxxx"`,
      notes: ['Consulte a operação para ler o inviteCode e o link final.', 'A instância precisa ter permissão para acessar o convite.'],
    },
    {
      id: 'group-invite-revoke',
      group: 'Grupos',
      method: 'POST',
      title: 'Revogar convite',
      path: `/v1/instances/${exampleInstanceId}/groups/${exampleGroupId}/invite-link/revoke`,
      description: 'Revoga o link de convite atual e gera um novo código no WhatsApp.',
      responseBody: operationResponse,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/groups/${exampleGroupId}/invite-link/revoke" \\
  -H "Authorization: Bearer ravox_live_xxxxx"`,
      notes: ['Links antigos deixam de funcionar após a revogação.', 'Consulte a operação para obter o novo código.'],
    },
    {
      id: 'group-invite-accept',
      group: 'Grupos',
      method: 'POST',
      title: 'Aceitar convite',
      path: `/v1/instances/${exampleInstanceId}/groups/invite/accept`,
      description: 'Faz a instância conectada entrar em um grupo usando o código de convite.',
      requestBody: `{
  "url": "https://chat.whatsapp.com/ABC123"
}`,
      responseBody: operationResponse,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/groups/invite/accept" \\
  -H "Authorization: Bearer ravox_live_xxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://chat.whatsapp.com/ABC123"}'`,
      notes: ['Também aceita code com apenas o código do convite.', 'Depois de aceitar, sincronize grupos para atualizar o cache.'],
    },
    {
      id: 'group-invite-metadata',
      group: 'Grupos',
      method: 'POST',
      title: 'Metadata do convite',
      path: `/v1/instances/${exampleInstanceId}/groups/invite/metadata`,
      description: 'Consulta dados de um convite por operação assíncrona.',
      requestBody: `{
  "code": "ABC123"
}`,
      responseBody: operationResponse,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/groups/invite/metadata" \\
  -H "Authorization: Bearer ravox_live_xxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"code":"ABC123"}'`,
      notes: ['Também existe GET /groups/invite/:code/metadata para código puro.', 'Útil para validar o grupo antes de aceitar o convite.'],
    },
  ];
  const additionalDocs: DocsEndpoint[] = [
    autoDoc({
      id: 'send-location',
      group: 'Mensagens avançadas',
      method: 'POST',
      title: 'Enviar localização',
      path: `/v1/instances/${exampleInstanceId}/send-location`,
      description: 'Envia uma localização com latitude, longitude, nome e endereço opcionais.',
      requestBody: `{
  "to": "+${examplePhone}",
  "latitude": -3.7319,
  "longitude": -38.5267,
  "name": "Fortaleza",
  "address": "CE, Brasil"
}`,
    }),
    autoDoc({
      id: 'send-contact',
      group: 'Mensagens avançadas',
      method: 'POST',
      title: 'Enviar contato',
      path: `/v1/instances/${exampleInstanceId}/send-contact`,
      description: 'Envia um cartão de contato para um chat.',
      requestBody: `{
  "to": "+${examplePhone}",
  "contact": {
    "displayName": "Contato teste",
    "phones": ["+5585888888888"]
  }
}`,
    }),
    autoDoc({
      id: 'send-contacts',
      group: 'Mensagens avançadas',
      method: 'POST',
      title: 'Enviar múltiplos contatos',
      path: `/v1/instances/${exampleInstanceId}/send-contacts`,
      description: 'Envia até 50 cartões de contato na mesma mensagem.',
      requestBody: `{
  "to": "+${examplePhone}",
  "contacts": [
    { "displayName": "Contato A", "phones": ["+5585888888888"] }
  ]
}`,
    }),
    autoDoc({
      id: 'send-sticker',
      group: 'Mensagens avançadas',
      method: 'POST',
      title: 'Enviar sticker',
      path: `/v1/instances/${exampleInstanceId}/send-sticker`,
      description: 'Envia figurinha por URL, data URL ou base64.',
      requestBody: `{
  "to": "+${examplePhone}",
  "sticker": "https://site.com/sticker.webp"
}`,
    }),
    autoDoc({
      id: 'send-gif',
      group: 'Mensagens avançadas',
      method: 'POST',
      title: 'Enviar GIF',
      path: `/v1/instances/${exampleInstanceId}/send-gif`,
      description: 'Envia um GIF a partir de URL, data URL ou base64.',
      requestBody: `{
  "to": "+${examplePhone}",
  "gif": "https://site.com/animacao.gif",
  "caption": "Legenda opcional"
}`,
    }),
    autoDoc({
      id: 'send-link',
      group: 'Mensagens avançadas',
      method: 'POST',
      title: 'Enviar link',
      path: `/v1/instances/${exampleInstanceId}/send-link`,
      description: 'Envia um link com texto opcional para o WhatsApp gerar prévia quando possível.',
      requestBody: `{
  "to": "+${examplePhone}",
  "url": "https://ravoxzap.local",
  "text": "Veja este link"
}`,
    }),
    autoDoc({
      id: 'send-reaction',
      group: 'Mensagens avançadas',
      method: 'POST',
      title: 'Enviar reação',
      path: `/v1/instances/${exampleInstanceId}/send-reaction`,
      description: 'Reage a uma mensagem existente por ID.',
      requestBody: `{
  "remoteJid": "${examplePhone}@s.whatsapp.net",
  "messageId": "MESSAGE_ID",
  "emoji": "👍"
}`,
    }),
    autoDoc({
      id: 'remove-reaction',
      group: 'Mensagens avançadas',
      method: 'POST',
      title: 'Remover reação',
      path: `/v1/instances/${exampleInstanceId}/remove-reaction`,
      description: 'Remove a reação enviada anteriormente em uma mensagem.',
      requestBody: `{
  "remoteJid": "${examplePhone}@s.whatsapp.net",
  "messageId": "MESSAGE_ID"
}`,
    }),
    autoDoc({
      id: 'send-poll',
      group: 'Mensagens avançadas',
      method: 'POST',
      title: 'Enviar enquete',
      path: `/v1/instances/${exampleInstanceId}/send-poll`,
      description: 'Cria e envia uma enquete com opções de voto.',
      requestBody: `{
  "to": "+${examplePhone}",
  "name": "Qual horário?",
  "options": ["Manhã", "Tarde"],
  "selectableCount": 1
}`,
    }),
    autoDoc({
      id: 'send-ptv',
      group: 'Mensagens avançadas',
      method: 'POST',
      title: 'Enviar PTV',
      path: `/v1/instances/${exampleInstanceId}/send-ptv`,
      description: 'Envia vídeo no formato de mensagem circular/PTV quando o WhatsApp aceitar.',
      requestBody: `{
  "to": "+${examplePhone}",
  "video": "https://site.com/video.mp4",
  "caption": "Opcional"
}`,
    }),
    autoDoc({
      id: 'message-reply',
      group: 'Mensagens avançadas',
      method: 'POST',
      title: 'Responder mensagem',
      path: `/v1/instances/${exampleInstanceId}/messages/reply`,
      description: 'Responde uma mensagem existente mantendo referência ao ID citado.',
      requestBody: `{
  "to": "+${examplePhone}",
  "text": "Resposta",
  "messageId": "MESSAGE_ID"
}`,
    }),
    autoDoc({
      id: 'message-forward',
      group: 'Mensagens avançadas',
      method: 'POST',
      title: 'Encaminhar mensagem',
      path: `/v1/instances/${exampleInstanceId}/messages/forward`,
      description: 'Encaminha um payload bruto de mensagem para outro chat.',
      requestBody: `{
  "to": "+${examplePhone}",
  "message": {}
}`,
    }),
    autoDoc({
      id: 'message-delete',
      group: 'Mensagens avançadas',
      method: 'POST',
      title: 'Apagar mensagem',
      path: `/v1/instances/${exampleInstanceId}/messages/delete`,
      description: 'Apaga uma mensagem pelo ID e JID remoto.',
      requestBody: `{
  "remoteJid": "${examplePhone}@s.whatsapp.net",
  "messageId": "MESSAGE_ID",
  "fromMe": true
}`,
    }),
    autoDoc({
      id: 'message-read',
      group: 'Mensagens avançadas',
      method: 'POST',
      title: 'Marcar mensagem como lida',
      path: `/v1/instances/${exampleInstanceId}/messages/read`,
      description: 'Envia recibo de leitura para uma mensagem específica.',
      requestBody: `{
  "remoteJid": "${examplePhone}@s.whatsapp.net",
  "messageId": "MESSAGE_ID"
}`,
    }),
    autoDoc({
      id: 'message-pin',
      group: 'Mensagens avançadas',
      method: 'POST',
      title: 'Fixar mensagem',
      path: `/v1/instances/${exampleInstanceId}/messages/pin`,
      description: 'Fixa ou desafixa uma mensagem por 24h, 7 dias ou 30 dias.',
      requestBody: `{
  "remoteJid": "${examplePhone}@s.whatsapp.net",
  "messageId": "MESSAGE_ID",
  "type": 1,
  "time": 86400
}`,
      notes: ['type=1 fixa; type=0 desafixa.', 'time aceita 86400, 604800 ou 2592000 segundos.'],
    }),
    autoDoc({
      id: 'contacts-check',
      group: 'Contatos',
      method: 'POST',
      title: 'Verificar número',
      path: `/v1/instances/${exampleInstanceId}/contacts/check`,
      description: 'Verifica se um telefone está disponível no WhatsApp.',
      requestBody: `{
  "phone": "+${examplePhone}"
}`,
    }),
    autoDoc({
      id: 'contacts-check-batch',
      group: 'Contatos',
      method: 'POST',
      title: 'Verificar números em lote',
      path: `/v1/instances/${exampleInstanceId}/contacts/check-batch`,
      description: 'Verifica múltiplos telefones no WhatsApp.',
      requestBody: `{
  "phones": ["+${examplePhone}", "+5585888888888"]
}`,
    }),
    autoDoc({
      id: 'contacts-list',
      group: 'Contatos',
      method: 'GET',
      title: 'Listar contatos',
      path: `/v1/instances/${exampleInstanceId}/contacts`,
      description: 'Lista contatos salvos no cache local da organização da API Key.',
      responseBody: `[
  {
    "id": "contact_123",
    "organizationId": "org_123",
    "name": "Cliente",
    "ddi": "55",
    "ddd": "85",
    "number": "999999999",
    "phoneE164": "${examplePhone}",
    "remoteJid": "${examplePhone}@s.whatsapp.net",
    "createdAt": "2026-05-29T13:00:00.000Z",
    "updatedAt": "2026-05-29T13:00:00.000Z"
  }
]`,
      notes: [
        'Esta rota lista os contatos conhecidos pela API.',
        'Para completar a base, use salvar contato, importe contatos pelo seu CRM ou capture contatos conforme eles interagem com a instância.',
      ],
    }),
    autoDoc({
      id: 'contacts-add',
      group: 'Contatos',
      method: 'POST',
      title: 'Salvar contato no WhatsApp',
      path: `/v1/instances/${exampleInstanceId}/contacts`,
      description: 'Adiciona um contato na agenda do WhatsApp conectado quando a conta permitir.',
      requestBody: `{
  "phone": "+${examplePhone}",
  "name": "Cliente"
}`,
    }),
    autoDoc({
      id: 'contacts-remove',
      group: 'Contatos',
      method: 'DELETE',
      title: 'Remover contato do WhatsApp',
      path: `/v1/instances/${exampleInstanceId}/contacts/${examplePhone}`,
      description: 'Remove um contato da agenda do WhatsApp conectado quando suportado.',
    }),
    autoDoc({
      id: 'contacts-metadata',
      group: 'Contatos',
      method: 'GET',
      title: 'Metadata do contato',
      path: `/v1/instances/${exampleInstanceId}/contacts/${examplePhone}/metadata`,
      description: 'Busca metadados disponíveis do contato no WhatsApp.',
    }),
    autoDoc({
      id: 'contacts-profile-picture',
      group: 'Contatos',
      method: 'GET',
      title: 'Foto do contato',
      path: `/v1/instances/${exampleInstanceId}/contacts/${examplePhone}/profile-picture`,
      description: 'Busca a URL da foto de perfil do contato quando visível para a instância.',
    }),
    autoDoc({
      id: 'contacts-block',
      group: 'Contatos',
      method: 'POST',
      title: 'Bloquear contato',
      path: `/v1/instances/${exampleInstanceId}/contacts/${examplePhone}/block`,
      description: 'Bloqueia um contato no WhatsApp conectado.',
    }),
    autoDoc({
      id: 'contacts-unblock',
      group: 'Contatos',
      method: 'POST',
      title: 'Desbloquear contato',
      path: `/v1/instances/${exampleInstanceId}/contacts/${examplePhone}/unblock`,
      description: 'Remove o bloqueio de um contato.',
    }),
    autoDoc({
      id: 'privacy-get',
      group: 'Privacidade',
      method: 'GET',
      title: 'Consultar privacidade',
      path: `/v1/instances/${exampleInstanceId}/privacy`,
      description: 'Consulta as configurações atuais de privacidade da instância.',
    }),
    autoDoc({
      id: 'privacy-blocklist',
      group: 'Privacidade',
      method: 'GET',
      title: 'Listar bloqueados',
      path: `/v1/instances/${exampleInstanceId}/privacy/blocklist`,
      description: 'Lista contatos bloqueados quando o WhatsApp retornar essa informação.',
    }),
    ...[
      ['privacy-last-seen', 'Visto por último', 'last-seen', '"all"'],
      ['privacy-online', 'Online', 'online', '"match_last_seen"'],
      ['privacy-profile-picture', 'Foto de perfil', 'profile-picture', '"contacts"'],
      ['privacy-status', 'Recado/status', 'status', '"contacts"'],
      ['privacy-read-receipts', 'Confirmação de leitura', 'read-receipts', '"all"'],
      ['privacy-group-add', 'Adicionar em grupos', 'group-add', '"contacts"'],
    ].map(([id, title, slug, value]) => autoDoc({
      id: id ?? '',
      group: 'Privacidade',
      method: 'POST',
      title: title ?? '',
      path: `/v1/instances/${exampleInstanceId}/privacy/${slug}`,
      description: `Atualiza a configuração de privacidade: ${title}.`,
      requestBody: `{
  "value": ${value}
}`,
    })),
    autoDoc({
      id: 'privacy-default-disappearing',
      group: 'Privacidade',
      method: 'POST',
      title: 'Temporárias padrão',
      path: `/v1/instances/${exampleInstanceId}/privacy/default-disappearing`,
      description: 'Define a duração padrão de mensagens temporárias para novas conversas.',
      requestBody: `{
  "duration": 86400
}`,
    }),
    autoDoc({
      id: 'instance-me',
      group: 'Perfil e instância',
      method: 'GET',
      title: 'Dados da conta',
      path: `/v1/instances/${exampleInstanceId}/me`,
      description: 'Retorna dados do usuário conectado no socket WhatsApp.',
    }),
    autoDoc({
      id: 'instance-device',
      group: 'Perfil e instância',
      method: 'GET',
      title: 'Dados do dispositivo',
      path: `/v1/instances/${exampleInstanceId}/device`,
      description: 'Retorna metadados do dispositivo/sessão conectada.',
    }),
    autoDoc({
      id: 'instance-pairing-code',
      group: 'Perfil e instância',
      method: 'POST',
      title: 'Gerar pairing code',
      path: `/v1/instances/${exampleInstanceId}/pairing-code`,
      description: 'Solicita código de pareamento por telefone, mantendo QR Code como fluxo principal.',
      requestBody: `{
  "phone": "+${examplePhone}"
}`,
    }),
    autoDoc({
      id: 'profile-name',
      group: 'Perfil e instância',
      method: 'POST',
      title: 'Atualizar nome do perfil',
      path: `/v1/instances/${exampleInstanceId}/profile/name`,
      description: 'Atualiza o nome público do perfil da instância.',
      requestBody: `{
  "name": "RavoxZap"
}`,
    }),
    autoDoc({
      id: 'profile-description',
      group: 'Perfil e instância',
      method: 'POST',
      title: 'Atualizar recado',
      path: `/v1/instances/${exampleInstanceId}/profile/description`,
      description: 'Atualiza o recado/sobre do perfil da instância.',
      requestBody: `{
  "description": "Atendimento online"
}`,
    }),
    autoDoc({
      id: 'profile-picture',
      group: 'Perfil e instância',
      method: 'POST',
      title: 'Atualizar foto do perfil',
      path: `/v1/instances/${exampleInstanceId}/profile/picture`,
      description: 'Atualiza a foto de perfil com URL, data URL ou base64.',
      requestBody: `{
  "image": "https://site.com/perfil.jpg"
}`,
    }),
    autoDoc({
      id: 'profile-picture-remove',
      group: 'Perfil e instância',
      method: 'POST',
      title: 'Remover foto do perfil',
      path: `/v1/instances/${exampleInstanceId}/profile/picture/remove`,
      description: 'Remove a foto de perfil da instância conectada.',
    }),
    autoDoc({
      id: 'status-send-text',
      group: 'Status',
      method: 'POST',
      title: 'Enviar status de texto',
      path: `/v1/instances/${exampleInstanceId}/status/send-text`,
      description: 'Publica texto no status da conta conectada.',
      requestBody: `{
  "text": "Olá pelo RavoxZap",
  "backgroundColor": "#111318",
  "font": 0
}`,
    }),
    autoDoc({
      id: 'status-send-image',
      group: 'Status',
      method: 'POST',
      title: 'Enviar status de imagem',
      path: `/v1/instances/${exampleInstanceId}/status/send-image`,
      description: 'Publica imagem no status da conta conectada.',
      requestBody: `{
  "image": "https://site.com/status.jpg",
  "caption": "Legenda"
}`,
    }),
    autoDoc({
      id: 'status-send-video',
      group: 'Status',
      method: 'POST',
      title: 'Enviar status de vídeo',
      path: `/v1/instances/${exampleInstanceId}/status/send-video`,
      description: 'Publica vídeo no status da conta conectada.',
      requestBody: `{
  "video": "https://site.com/status.mp4",
  "caption": "Legenda"
}`,
    }),
    ...[
      ['status-reply-text', 'Responder status com texto', 'reply-text', '{\n  "statusJid": "status@broadcast",\n  "messageId": "MESSAGE_ID",\n  "text": "Resposta"\n}'],
      ['status-reply-sticker', 'Responder status com sticker', 'reply-sticker', '{\n  "statusJid": "status@broadcast",\n  "messageId": "MESSAGE_ID",\n  "sticker": "https://site.com/sticker.webp"\n}'],
      ['status-reply-gif', 'Responder status com GIF', 'reply-gif', '{\n  "statusJid": "status@broadcast",\n  "messageId": "MESSAGE_ID",\n  "gif": "https://site.com/animacao.gif"\n}'],
    ].map(([id, title, slug, body]) => autoDoc({
      id: id ?? '',
      group: 'Status',
      method: 'POST',
      title: title ?? '',
      path: `/v1/instances/${exampleInstanceId}/status/${slug}`,
      description: `${title} quando o payload recebido tiver chave de status suficiente.`,
      requestBody: body,
    })),
    autoDoc({
      id: 'group-invite-metadata-get',
      group: 'Grupos',
      method: 'GET',
      title: 'Metadata do convite por código',
      path: `/v1/instances/${exampleInstanceId}/groups/invite/ABC123/metadata`,
      description: 'Consulta metadata de convite informando o código direto na URL.',
    }),
    autoDoc({
      id: 'group-requests-reject',
      group: 'Grupos',
      method: 'POST',
      title: 'Rejeitar solicitações',
      path: `/v1/instances/${exampleInstanceId}/groups/${exampleGroupId}/requests/reject`,
      description: 'Rejeita participantes que solicitaram entrada no grupo.',
      requestBody: `{
  "participants": ["+${examplePhone}"]
}`,
    }),
    autoDoc({
      id: 'communities-sync',
      group: 'Comunidades',
      method: 'POST',
      title: 'Sincronizar comunidades',
      path: `/v1/instances/${exampleInstanceId}/communities/sync`,
      description: 'Busca comunidades em que a instância participa.',
    }),
    autoDoc({
      id: 'communities-create',
      group: 'Comunidades',
      method: 'POST',
      title: 'Criar comunidade',
      path: `/v1/instances/${exampleInstanceId}/communities`,
      description: 'Cria uma comunidade no WhatsApp quando a conta conectada permite.',
      requestBody: `{
  "name": "Comunidade Ravox",
  "description": "Assuntos importantes"
}`,
    }),
    autoDoc({
      id: 'communities-invite-accept',
      group: 'Comunidades',
      method: 'POST',
      title: 'Aceitar convite de comunidade',
      path: `/v1/instances/${exampleInstanceId}/communities/invite/accept`,
      description: 'Aceita convite de comunidade por código ou URL.',
      requestBody: `{
  "url": "https://chat.whatsapp.com/ABC123"
}`,
    }),
    ...[
      ['communities-metadata', 'GET', 'Metadata da comunidade', '', undefined],
      ['communities-name', 'POST', 'Atualizar nome da comunidade', '/name', '{\n  "name": "Novo nome"\n}'],
      ['communities-description', 'POST', 'Atualizar descrição da comunidade', '/description', '{\n  "description": "Nova descrição"\n}'],
      ['communities-settings', 'POST', 'Configurações da comunidade', '/settings', '{\n  "messages": "admins",\n  "info": "admins",\n  "addMembers": "admins",\n  "joinApproval": true,\n  "ephemeralSeconds": 86400\n}'],
      ['communities-participants-add', 'POST', 'Adicionar participantes', '/participants/add', `{\n  "participants": ["+${examplePhone}"]\n}`],
      ['communities-participants-remove', 'POST', 'Remover participantes', '/participants/remove', `{\n  "participants": ["+${examplePhone}"]\n}`],
      ['communities-admins-promote', 'POST', 'Promover admin', '/admins/promote', `{\n  "participants": ["+${examplePhone}"]\n}`],
      ['communities-admins-demote', 'POST', 'Remover permissão de admin', '/admins/demote', `{\n  "participants": ["+${examplePhone}"]\n}`],
      ['communities-groups-link', 'POST', 'Vincular grupos', '/groups/link', `{\n  "groups": ["${exampleGroupId}"]\n}`],
      ['communities-groups-unlink', 'POST', 'Desvincular grupos', '/groups/unlink', `{\n  "groups": ["${exampleGroupId}"]\n}`],
      ['communities-invite-link', 'GET', 'Gerar link da comunidade', '/invite-link', undefined],
      ['communities-invite-revoke', 'POST', 'Revogar link da comunidade', '/invite-link/revoke', undefined],
    ].map(([id, method, title, suffix, body]) => autoDoc({
      id: id ?? '',
      group: 'Comunidades',
      method: method as DocsEndpoint['method'],
      title: title ?? '',
      path: `/v1/instances/${exampleInstanceId}/communities/${exampleCommunityId}${suffix ?? ''}`,
      description: `${title} usando o remoteJid da comunidade.`,
      requestBody: body,
    })),
    autoDoc({
      id: 'newsletters-create',
      group: 'Newsletters',
      method: 'POST',
      title: 'Criar canal',
      path: `/v1/instances/${exampleInstanceId}/newsletters`,
      description: 'Cria um canal/newsletter no WhatsApp quando a conta permitir.',
      requestBody: `{
  "name": "Canal Ravox",
  "description": "Atualizações"
}`,
    }),
    autoDoc({
      id: 'newsletters-list',
      group: 'Newsletters',
      method: 'GET',
      title: 'Listar canais',
      path: `/v1/instances/${exampleInstanceId}/newsletters`,
      description: 'Lista canais disponíveis para a instância conforme os recursos da conta conectada.',
    }),
    ...[
      ['newsletters-metadata', 'GET', 'Metadata do canal', '', undefined],
      ['newsletters-follow', 'POST', 'Seguir canal', '/follow', undefined],
      ['newsletters-unfollow', 'POST', 'Deixar de seguir canal', '/unfollow', undefined],
      ['newsletters-mute', 'POST', 'Mutar canal', '/mute', undefined],
      ['newsletters-unmute', 'POST', 'Desmutar canal', '/unmute', undefined],
      ['newsletters-delete', 'DELETE', 'Deletar canal', '', undefined],
      ['newsletters-name', 'POST', 'Atualizar nome do canal', '/name', '{\n  "name": "Novo nome"\n}'],
      ['newsletters-description', 'POST', 'Atualizar descrição do canal', '/description', '{\n  "description": "Nova descrição"\n}'],
      ['newsletters-picture', 'POST', 'Atualizar foto do canal', '/picture', '{\n  "image": "https://site.com/canal.jpg"\n}'],
      ['newsletters-admin-invite-revoke', 'POST', 'Revogar convite admin', '/admin-invite/revoke', `{\n  "invitedJid": "+${examplePhone}"\n}`],
      ['newsletters-admin-remove', 'POST', 'Remover admin do canal', '/admins/remove', `{\n  "userJid": "+${examplePhone}"\n}`],
      ['newsletters-transfer', 'POST', 'Transferir propriedade', '/transfer-ownership', `{\n  "userJid": "+${examplePhone}"\n}`],
      ['newsletters-react', 'POST', 'Reagir em mensagem do canal', '/messages/react', '{\n  "serverId": "MESSAGE_ID",\n  "reaction": "👍"\n}'],
      ['newsletters-messages', 'GET', 'Buscar mensagens do canal', '/messages?count=20', undefined],
    ].map(([id, method, title, suffix, body]) => autoDoc({
      id: id ?? '',
      group: 'Newsletters',
      method: method as DocsEndpoint['method'],
      title: title ?? '',
      path: `/v1/instances/${exampleInstanceId}/newsletters/${exampleNewsletterId}${suffix ?? ''}`,
      description: `${title}.`,
      requestBody: body,
    })),
    autoDoc({
      id: 'business-profile',
      group: 'Business',
      method: 'GET',
      title: 'Perfil Business',
      path: `/v1/instances/${exampleInstanceId}/business/profile`,
      description: 'Busca o perfil Business da conta conectada ou de um JID informado por query.',
    }),
    autoDoc({
      id: 'business-profile-update',
      group: 'Business',
      method: 'PATCH',
      title: 'Atualizar perfil Business',
      path: `/v1/instances/${exampleInstanceId}/business/profile`,
      description: 'Atualiza campos do perfil Business disponíveis para a conta conectada.',
      requestBody: `{
  "updates": {
    "description": "Atendimento Ravox",
    "email": "contato@example.com"
  }
}`,
    }),
    ...[
      ['business-products', 'GET', 'Listar produtos', '/products', undefined],
      ['business-product-create', 'POST', 'Criar produto', '/products', '{\n  "product": {\n    "name": "Produto teste",\n    "price": 1000,\n    "currency": "BRL"\n  }\n}'],
      ['business-product-get', 'GET', 'Buscar produto', `/products/${exampleProductId}`, undefined],
      ['business-product-update', 'PATCH', 'Editar produto', `/products/${exampleProductId}`, '{\n  "product": {\n    "name": "Produto editado"\n  }\n}'],
      ['business-product-delete', 'DELETE', 'Deletar produto', `/products/${exampleProductId}`, undefined],
      ['business-collections', 'GET', 'Listar coleções', '/collections', undefined],
      ['business-tag-create', 'POST', 'Criar etiqueta', '/tags', '{\n  "name": "Cliente VIP",\n  "color": 1\n}'],
      ['business-tag-update', 'PATCH', 'Editar etiqueta', `/tags/${exampleTagId}`, '{\n  "name": "Cliente ativo",\n  "color": 2\n}'],
      ['business-tag-delete', 'DELETE', 'Deletar etiqueta', `/tags/${exampleTagId}`, undefined],
      ['business-tag-chat-add', 'POST', 'Atribuir etiqueta ao chat', `/tags/${exampleTagId}/chats/add`, `{\n  "remoteJid": "${examplePhone}@s.whatsapp.net"\n}`],
      ['business-tag-chat-remove', 'POST', 'Remover etiqueta do chat', `/tags/${exampleTagId}/chats/remove`, `{\n  "remoteJid": "${examplePhone}@s.whatsapp.net"\n}`],
    ].map(([id, method, title, suffix, body]) => autoDoc({
      id: id ?? '',
      group: 'Business',
      method: method as DocsEndpoint['method'],
      title: title ?? '',
      path: `/v1/instances/${exampleInstanceId}/business${suffix ?? ''}`,
      description: `${title} usando os recursos Business disponíveis na conta conectada.`,
      requestBody: body,
      notes: ['Requer conta WhatsApp Business com o recurso disponível.', 'Alguns campos aceitos pelo WhatsApp podem variar por região e tipo de conta.'],
    })),
    autoDoc({
      id: 'queue-list',
      group: 'Fila',
      method: 'GET',
      title: 'Listar fila',
      path: `/v1/instances/${exampleInstanceId}/queue`,
      description: 'Lista itens de fila relacionados à instância com paginação simples.',
      responseBody: `{
  "items": [],
  "total": 0
}`,
      notes: ['Use query params como page e limit quando necessário.', 'A fila reflete jobs conhecidos pelo BullMQ.'],
    }),
    autoDoc({
      id: 'queue-clear',
      group: 'Fila',
      method: 'DELETE',
      title: 'Limpar fila',
      path: `/v1/instances/${exampleInstanceId}/queue`,
      description: 'Remove itens da fila relacionados à instância quando possível.',
    }),
    autoDoc({
      id: 'queue-settings',
      group: 'Fila',
      method: 'GET',
      title: 'Configurações da fila',
      path: `/v1/instances/${exampleInstanceId}/queue/settings`,
      description: 'Consulta comportamento atual de fila da instância.',
      responseBody: `{
  "instanceId": "${exampleInstanceId}",
  "enqueueWhenDisconnected": true,
  "persisted": false
}`,
      notes: ['Contrato atual é útil para UI e integrações.', 'Persistência real de settings pode depender de implementação posterior.'],
    }),
    autoDoc({
      id: 'queue-settings-update',
      group: 'Fila',
      method: 'PATCH',
      title: 'Atualizar configurações da fila',
      path: `/v1/instances/${exampleInstanceId}/queue/settings`,
      description: 'Atualiza preferências de enfileiramento da instância.',
      requestBody: `{
  "enqueueWhenDisconnected": true
}`,
      notes: ['Contrato atual pode retornar persisted=false quando a configuração ainda não estiver persistida no banco.'],
    }),
    autoDoc({
      id: 'queue-delete-item',
      group: 'Fila',
      method: 'DELETE',
      title: 'Remover item da fila',
      path: `/v1/instances/${exampleInstanceId}/queue/${exampleQueueItemId}`,
      description: 'Remove um item específico da fila pelo ID do job.',
    }),
  ];
  const docs: DocsEndpoint[] = [...baseDocs, ...additionalDocs];
  const groups = ['Mensagens', 'Mensagens avançadas', 'Instância', 'Perfil e instância', 'Conversas', 'Contatos', 'Privacidade', 'Status', 'Grupos', 'Comunidades', 'Newsletters', 'Business', 'Fila', 'Operações'];
  const activeDoc = docs.find(doc => doc.id === activeDocId);
  const webhookPayload = `{
  "event": "message.received",
  "organizationId": "org_123",
  "instanceId": "${exampleInstanceId}",
  "timestamp": "2026-05-27T20:00:00.000Z",
  "data": {
    "from": "5585999999999@s.whatsapp.net",
    "type": "TEXT",
    "body": "Olá"
  }
}`;
  const roadmapItems = [
    'Botões e listas interativas quando houver suporte confiável na integração',
    'Chamadas/SIP e tokens de call se houver suporte fora da plataforma Z-API',
    'Meta AI quando existir suporte seguro na integração',
    'Mobile registration completo fora do QR Code/pairing code',
    'Notas de chat Business quando houver suporte claro na integração',
    'Persistência completa de configurações avançadas de fila',
    'Compatibilidade literal com rotas Z-API somente se virar requisito explícito',
  ];
  const activeDocLabel =
    activeDocId === 'intro'
      ? 'Introdução'
      : activeDocId === 'roadmap'
        ? 'Próximas funcionalidades'
        : activeDoc?.title ?? 'Referência da API';

  function selectDoc(docId: string) {
    setActiveDocId(docId);
    setReferenceMenuOpen(false);
  }

  function renderReferenceNav() {
    return (
      <>
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#2edb5c]">Referência da API</p>
          <h2 className="mt-2 text-lg font-semibold">API Pública RavoxZap</h2>
          <p className="mt-1 text-sm text-gray-400">Rotas públicas reais para automações, CRMs e backends.</p>
        </div>

        <div className="space-y-6">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Começando</p>
            <button
              type="button"
              className={`w-full cursor-pointer rounded-lg border p-3 text-left text-sm transition ${
                activeDocId === 'intro'
                  ? 'border-[#2edb5c]/40 bg-[#12351f] text-[#2edb5c]'
                  : 'border-[#2d3036] bg-[#0d0f14] text-gray-300 hover:bg-[#1e2129] hover:text-white'
              }`}
              onClick={() => selectDoc('intro')}
            >
              <p className="font-medium">Introdução</p>
              <p className="mt-1 text-xs text-gray-500">Fluxo, autenticação e limites atuais.</p>
            </button>
          </div>

          {groups.map(group => (
            <div key={group}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{group}</p>
              <div className="space-y-1">
                {docs.filter(doc => doc.group === group).map(doc => (
                  <button
                    key={doc.id}
                    type="button"
                    className={`grid w-full cursor-pointer grid-cols-[48px_minmax(0,1fr)] items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition ${
                      activeDocId === doc.id
                        ? 'border-[#2edb5c]/40 bg-[#12351f] text-[#2edb5c]'
                        : 'border-transparent text-gray-400 hover:border-[#2d3036] hover:bg-[#1e2129] hover:text-white'
                    }`}
                    onClick={() => selectDoc(doc.id)}
                  >
                    <MethodBadge method={doc.method} />
                    <span className="min-w-0 text-wrap leading-snug">{doc.title}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Roadmap</p>
            <button
              type="button"
              className={`w-full cursor-pointer rounded-md border px-3 py-2 text-left text-sm transition ${
                activeDocId === 'roadmap'
                  ? 'border-[#2edb5c]/40 bg-[#12351f] text-[#2edb5c]'
                  : 'border-transparent text-gray-400 hover:border-[#2d3036] hover:bg-[#1e2129] hover:text-white'
              }`}
              onClick={() => selectDoc('roadmap')}
            >
              Próximas funcionalidades
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-[#2d3036] bg-[#111318] px-4 py-3 text-left transition hover:bg-[#181a21] lg:hidden"
        onClick={() => setReferenceMenuOpen(true)}
      >
        <span className="flex min-w-0 items-center gap-3">
          <Menu size={18} className="shrink-0 text-[#2edb5c]" />
          <span className="min-w-0">
            <span className="block text-xs font-semibold uppercase tracking-wide text-[#2edb5c]">Referência da API</span>
            <span className="block truncate text-sm text-gray-300">{activeDocLabel}</span>
          </span>
        </span>
        <ChevronDown size={18} className="shrink-0 text-gray-500" />
      </button>

      {referenceMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 p-3 backdrop-blur-sm lg:hidden"
          onClick={() => setReferenceMenuOpen(false)}
        >
          <div
            className="mx-auto mt-16 max-h-[calc(100dvh-5rem)] max-w-md overflow-hidden rounded-xl border border-[#2d3036] bg-[#111318] shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-[#2d3036] px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">Referência da API</p>
                <p className="truncate text-xs text-gray-500">{activeDocLabel}</p>
              </div>
              <button
                type="button"
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-gray-400 transition hover:bg-[#181a21] hover:text-white"
                onClick={() => setReferenceMenuOpen(false)}
                aria-label="Fechar referência"
              >
                <X size={18} />
              </button>
            </div>
            <div className="themed-scrollbar max-h-[calc(100dvh-9rem)] overflow-y-auto p-4">
              {renderReferenceNav()}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[270px_minmax(0,1fr)_420px]">
        <aside className="themed-scrollbar hidden rounded-xl border border-[#2d3036] bg-[#111318] p-4 lg:sticky lg:top-[5.25rem] lg:block lg:max-h-[calc(100vh-6.5rem)] lg:overflow-y-auto">
          {renderReferenceNav()}
        </aside>

        <article className="min-w-0 rounded-xl border border-[#2d3036] bg-[#181a21] p-5 lg:p-8">
        {activeDocId === 'intro' && (
          <section className="space-y-8">
            <div className="border-b border-[#2d3036] pb-8">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#2edb5c]">Introdução</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">RavoxZap Public API</h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-gray-400">
                O RavoxZap é um gateway/API multiusuário para WhatsApp via QR Code. Ele conecta uma instância WhatsApp,
                recebe chamadas HTTP, coloca os comandos em fila e usa workers para executar as ações no WhatsApp.
                Hoje a API pública cobre mensagens básicas e avançadas, contatos, privacidade, perfil, status, chats,
                grupos, comunidades, canais/newsletters, recursos Business, fila e operações assíncronas.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                ['1. Crie uma API Key', 'Gere uma chave no painel. O token aparece uma única vez e deve ser enviado como Bearer token.'],
                ['2. Conecte uma instância', 'Leia o QR Code com o WhatsApp e use o ID da instância nas rotas públicas.'],
                ['3. Envie comandos', 'A API valida escopo, salva o registro, enfileira o job e o worker executa no WhatsApp.'],
              ].map(([title, description]) => (
                <div key={title} className="rounded-xl border border-[#2d3036] bg-[#111318] p-5">
                  <h2 className="font-semibold text-white">{title}</h2>
                  <p className="mt-2 text-sm leading-6 text-gray-400">{description}</p>
                </div>
              ))}
            </div>
            <div>
              <h2 className="text-2xl font-semibold">Quando usar</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {[
                  ['Automações internas', 'Enviar confirmações, avisos e atualizações a partir de CRMs, ERPs, n8n ou backends próprios.'],
                  ['Atendimento operacional', 'Centralizar conversas recebidas, manter histórico e acionar webhooks por instância.'],
                  ['Integrações com grupos', 'Criar grupos, sincronizar participantes e executar ações administrativas quando a instância tiver permissão.'],
                  ['Prototipação rápida', 'Testar fluxos de mensagem sem depender de uma conta oficial da Meta no primeiro MVP.'],
                ].map(([title, description]) => (
                  <div key={title} className="rounded-xl border border-[#2d3036] bg-[#111318] p-5">
                    <h3 className="font-semibold text-white">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-gray-400">{description}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-semibold">Autenticação</h2>
              <p className="mt-2 text-gray-400">Envie a API Key no header de autorização em todas as chamadas públicas.</p>
              <div className="mt-4">
                <CodeSnippet>{`Authorization: Bearer ravox_live_xxxxx`}</CodeSnippet>
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-semibold">Formato do telefone</h2>
              <p className="mt-2 max-w-3xl text-gray-400">
                Em todos os endpoints de envio, o campo <code className="rounded bg-[#0d0f14] px-1.5 py-0.5 text-gray-200">to</code> deve ser enviado em formato internacional.
                Para números do Brasil, use <strong className="font-semibold text-gray-200">+55 + DDD + número</strong>.
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-[#2d3036] bg-[#111318] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Recomendado</p>
                  <code className="mt-2 block break-all text-sm text-[#2edb5c]">{`"to": "+5585999999999"`}</code>
                </div>
                <div className="rounded-xl border border-[#2d3036] bg-[#111318] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Também aceito</p>
                  <code className="mt-2 block break-all text-sm text-gray-300">{`"to": "5585999999999"`}</code>
                </div>
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-semibold">Fluxo</h2>
              <div className="mt-4 rounded-xl border border-[#2d3036] bg-[#111318] p-5 font-mono text-sm text-gray-300">
                API pública → valida token e escopo → salva mídia quando existir → cria mensagem → fila → worker → WhatsApp
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-semibold">Boas práticas</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
                Recomendações rápidas para integrar com previsibilidade e evitar falhas comuns.
              </p>
              <div className="mt-4 divide-y divide-[#2d3036] rounded-xl border border-[#2d3036] bg-[#111318]">
                {[
                  ['Consulte o status', 'Use GET /status antes de enviar para confirmar se a instância está conectada.'],
                  ['Use telefone internacional', 'Para Brasil, envie +55 + DDD + número. Também aceitamos somente dígitos.'],
                  ['Acompanhe retornos assíncronos', 'Envios e operações retornam QUEUED; consulte mensagens, status ou operação para confirmar o resultado.'],
                  ['Configure webhooks', 'Use webhooks por instância para receber eventos de mensagens, conexão e falhas no seu sistema.'],
                  ['Proteja a API Key', 'Crie uma chave por integração e revogue quando ela não for mais usada.'],
                ].map(([title, description]) => (
                  <div key={title} className="grid gap-2 p-4 md:grid-cols-[220px_minmax(0,1fr)]">
                    <div className="flex items-center gap-2 font-semibold text-white">
                      <Check className="text-[#2edb5c]" size={16} />
                      {title}
                    </div>
                    <p className="text-sm leading-6 text-gray-400">{description}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-semibold">Limites atuais de mídia</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  ['Imagem', '15MB'],
                  ['Áudio', '20MB'],
                  ['Vídeo', '100MB'],
                  ['Documento', '50MB'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between rounded-lg border border-[#2d3036] bg-[#111318] p-4">
                    <span className="text-gray-300">{label}</span>
                    <span className="font-mono text-[#2edb5c]">{value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-semibold">Checklist rápido</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  'Postgres e Redis rodando',
                  'Worker ativo',
                  'Instância CONNECTED',
                  'API Key ativa',
                  'Telefone com DDI',
                  'Payload JSON válido',
                  'Webhook testado',
                  'Logs monitorados',
                ].map(item => (
                  <div key={item} className="flex items-center gap-2 rounded-lg border border-[#2d3036] bg-[#111318] p-3 text-sm text-gray-300">
                    <CheckCircle2 size={16} className="shrink-0 text-[#2edb5c]" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeDocId === 'roadmap' && (
          <section className="space-y-8">
            <div className="border-b border-[#2d3036] pb-8">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#2edb5c]">Roadmap</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Próximas funcionalidades</h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-gray-400">
                Esta seção é mapa de evolução. Os itens abaixo ainda não são endpoints públicos ativos neste pacote.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {roadmapItems.map(item => (
                <div key={item} className="flex items-center gap-3 rounded-xl border border-[#2d3036] bg-[#111318] p-4 text-gray-300">
                  <Clock3 size={16} className="text-gray-500" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeDoc && (
          <>
            <div className="mb-8 border-b border-[#2d3036] pb-8">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <MethodBadge method={activeDoc.method} />
                <code className="break-all rounded-md bg-[#0d0f14] px-2 py-1 text-sm text-gray-300">{activeDoc.path}</code>
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-white">{activeDoc.title}</h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-gray-400">{activeDoc.description}</p>
            </div>

            <section className="space-y-8">
              <div>
                <h2 className="text-2xl font-semibold">Autenticação</h2>
                <p className="mt-2 text-gray-400">Envie a API Key no header de autorização em todas as chamadas públicas.</p>
                <div className="mt-4">
                  <CodeSnippet>{`Authorization: Bearer ravox_live_xxxxx`}</CodeSnippet>
                </div>
              </div>

              <div>
                <h2 className="text-2xl font-semibold">Parâmetros de rota</h2>
                <div className="mt-4 rounded-xl border border-[#2d3036]">
                  <div className="grid gap-3 border-b border-[#2d3036] p-4 text-sm sm:grid-cols-[180px_120px_minmax(0,1fr)]">
                    <code className="text-gray-200">instanceId</code>
                    <span className="text-gray-500">string</span>
                    <span className="text-gray-400">ID da instância WhatsApp que pertence à API Key.</span>
                  </div>
                  {activeDoc.path.includes(exampleChatId) && (
                    <div className="grid gap-3 border-t border-[#2d3036] p-4 text-sm sm:grid-cols-[180px_120px_minmax(0,1fr)]">
                      <code className="text-gray-200">chatId</code>
                      <span className="text-gray-500">string</span>
                      <span className="text-gray-400">ID do chat retornado em listar chats.</span>
                    </div>
                  )}
                  {activeDoc.id.startsWith('group-') && !activeDoc.id.startsWith('group-invite-') && (
                    <div className="grid gap-3 border-t border-[#2d3036] p-4 text-sm sm:grid-cols-[180px_120px_minmax(0,1fr)]">
                      <code className="text-gray-200">groupId</code>
                      <span className="text-gray-500">string</span>
                      <span className="text-gray-400">ID interno do grupo ou remoteJid terminado em @g.us.</span>
                    </div>
                  )}
                  {activeDoc.id === 'operations' && (
                    <div className="grid gap-3 border-t border-[#2d3036] p-4 text-sm sm:grid-cols-[180px_120px_minmax(0,1fr)]">
                      <code className="text-gray-200">operationId</code>
                      <span className="text-gray-500">string</span>
                      <span className="text-gray-400">ID retornado por uma ação assíncrona.</span>
                    </div>
                  )}
                  {activeDoc.path.includes(examplePhone) && (
                    <div className="grid gap-3 border-t border-[#2d3036] p-4 text-sm sm:grid-cols-[180px_120px_minmax(0,1fr)]">
                      <code className="text-gray-200">phone</code>
                      <span className="text-gray-500">string</span>
                      <span className="text-gray-400">Telefone em formato internacional, com ou sem sinal de +.</span>
                    </div>
                  )}
                  {activeDoc.path.includes(exampleCommunityId) && (
                    <div className="grid gap-3 border-t border-[#2d3036] p-4 text-sm sm:grid-cols-[180px_120px_minmax(0,1fr)]">
                      <code className="text-gray-200">communityId</code>
                      <span className="text-gray-500">string</span>
                      <span className="text-gray-400">RemoteJid da comunidade retornado pelo WhatsApp.</span>
                    </div>
                  )}
                  {activeDoc.path.includes(exampleNewsletterId) && (
                    <div className="grid gap-3 border-t border-[#2d3036] p-4 text-sm sm:grid-cols-[180px_120px_minmax(0,1fr)]">
                      <code className="text-gray-200">newsletterId</code>
                      <span className="text-gray-500">string</span>
                      <span className="text-gray-400">JID do canal/newsletter, normalmente terminado em @newsletter.</span>
                    </div>
                  )}
                  {activeDoc.path.includes(exampleProductId) && (
                    <div className="grid gap-3 border-t border-[#2d3036] p-4 text-sm sm:grid-cols-[180px_120px_minmax(0,1fr)]">
                      <code className="text-gray-200">productId</code>
                      <span className="text-gray-500">string</span>
                      <span className="text-gray-400">ID do produto retornado pelo catálogo Business.</span>
                    </div>
                  )}
                  {activeDoc.path.includes(exampleTagId) && (
                    <div className="grid gap-3 border-t border-[#2d3036] p-4 text-sm sm:grid-cols-[180px_120px_minmax(0,1fr)]">
                      <code className="text-gray-200">tagId</code>
                      <span className="text-gray-500">string</span>
                      <span className="text-gray-400">ID da etiqueta Business.</span>
                    </div>
                  )}
                  {activeDoc.path.includes(exampleQueueItemId) && (
                    <div className="grid gap-3 border-t border-[#2d3036] p-4 text-sm sm:grid-cols-[180px_120px_minmax(0,1fr)]">
                      <code className="text-gray-200">queueItemId</code>
                      <span className="text-gray-500">string</span>
                      <span className="text-gray-400">ID do job retornado pela fila.</span>
                    </div>
                  )}
                  {(activeDoc.id === 'group-invite-metadata' || activeDoc.id === 'group-invite-metadata-get') && (
                    <div className="grid gap-3 border-t border-[#2d3036] p-4 text-sm sm:grid-cols-[180px_120px_minmax(0,1fr)]">
                      <code className="text-gray-200">code</code>
                      <span className="text-gray-500">string</span>
                      <span className="text-gray-400">Código do convite do grupo.</span>
                    </div>
                  )}
                </div>
              </div>

              {activeDoc.requestBody && (
                <div>
                  <h2 className="text-2xl font-semibold">Corpo da requisição</h2>
                  {activeDoc.group === 'Mensagens' && (
                    <p className="mt-2 text-sm text-gray-400">
                      O campo <code className="rounded bg-[#0d0f14] px-1.5 py-0.5 text-gray-200">to</code> usa telefone internacional.
                      Exemplo Brasil: <code className="rounded bg-[#0d0f14] px-1.5 py-0.5 text-gray-200">+5585999999999</code>.
                    </p>
                  )}
                  <div className="mt-4">
                    <DocsCodeBlock title="application/json" code={activeDoc.requestBody} />
                  </div>
                </div>
              )}

              <div>
                <h2 className="text-2xl font-semibold">Resposta</h2>
                <div className="mt-4">
                  <DocsCodeBlock title="200 Success" code={activeDoc.responseBody} />
                </div>
              </div>

              <div>
                <h2 className="text-2xl font-semibold">Erros comuns</h2>
                <div className="mt-4 divide-y divide-[#2d3036] rounded-xl border border-[#2d3036] text-sm">
                  <div className="grid gap-2 p-4 sm:grid-cols-[90px_minmax(0,1fr)]">
                    <span className="font-mono font-semibold text-red-300">401</span>
                    <span className="text-gray-400">API Key ausente, inválida ou revogada.</span>
                  </div>
                  <div className="grid gap-2 p-4 sm:grid-cols-[90px_minmax(0,1fr)]">
                    <span className="font-mono font-semibold text-red-300">404</span>
                    <span className="text-gray-400">Instância, chat ou recurso não encontrado para a organização da API Key.</span>
                  </div>
                  <div className="grid gap-2 p-4 sm:grid-cols-[90px_minmax(0,1fr)]">
                    <span className="font-mono font-semibold text-red-300">413</span>
                    <span className="text-gray-400">Mídia acima do limite permitido para o tipo enviado.</span>
                  </div>
                  <div className="grid gap-2 p-4 sm:grid-cols-[90px_minmax(0,1fr)]">
                    <span className="font-mono font-semibold text-red-300">422</span>
                    <span className="text-gray-400">Payload fora do formato esperado ou MIME incompatível.</span>
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-2xl font-semibold">Observações</h2>
                <ul className="mt-4 space-y-2 text-sm text-gray-400">
                  {activeDoc.notes.map(note => (
                    <li key={note} className="flex gap-2">
                      <Check size={16} className="mt-0.5 shrink-0 text-[#2edb5c]" />
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </>
        )}
      </article>

      <aside className="themed-scrollbar min-w-0 rounded-xl border border-[#2d3036] bg-[#111318] p-4 lg:sticky lg:top-[5.25rem] lg:max-h-[calc(100vh-6.5rem)] lg:overflow-y-auto">
        <div className="space-y-4">
                  {activeDoc ? (
            <>
              <DocsCodeBlock title="cURL" code={activeDoc.curl} />
              <DocsCodeBlock title="Resposta" code={activeDoc.responseBody} />
              <DocsCodeBlock title="Webhook payload" code={webhookPayload} />
            </>
          ) : (
            <>
              <div className="rounded-xl border border-[#2d3036] bg-[#0d0f14] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Funcional hoje</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {['mensagens', 'mídia', 'contatos', 'privacidade', 'perfil', 'status', 'chats', 'grupos', 'comunidades', 'newsletters', 'business', 'fila', 'operações'].map(item => (
                    <span key={item} className="rounded-full border border-[#2d3036] px-3 py-1 text-xs text-gray-300">{item}</span>
                  ))}
                </div>
              </div>
              <DocsCodeBlock title="Webhook payload" code={webhookPayload} />
            </>
          )}
          <div className="rounded-xl border border-[#2d3036] bg-[#0d0f14] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Base URL</p>
            <p className="mt-2 break-all font-mono text-sm text-gray-200">{publicBaseUrl}</p>
          </div>
        </div>
      </aside>
    </div>
    </div>
  );
}

function DashboardBreadcrumbs({
  route,
  selectedInstance,
  organizationName,
  navigate,
}: {
  route: DashboardRoute;
  selectedInstance?: WhatsAppInstance;
  organizationName: string;
  navigate: (path: string) => void;
}) {
  const viewLabels: Record<DashboardView, string> = {
    dashboard: 'Dashboard',
    instances: 'Instâncias',
    'api-keys': 'API Keys',
    docs: 'Docs',
  };
  const crumbs: Array<{ label: string; path?: string }> = [{ label: viewLabels[route.view], path: viewPaths[route.view] }];

  if (route.view === 'instances' && route.instanceId && selectedInstance) {
    crumbs.push({ label: selectedInstance.name, path: instanceRoutePath(selectedInstance.id, 'details') });
    if (route.instanceTab === 'webhooks') crumbs.push({ label: 'Webhooks' });
  }

  return (
    <div className="min-w-0">
      <nav className="flex min-w-0 items-center gap-2 text-sm" aria-label="Breadcrumb">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <div key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-2">
              {index > 0 && <span className="text-gray-600">/</span>}
              {crumb.path && !isLast ? (
                <button
                  type="button"
                  className="max-w-40 cursor-pointer truncate text-gray-400 transition hover:text-white"
                  onClick={() => navigate(crumb.path!)}
                >
                  {crumb.label}
                </button>
              ) : (
                <span className={`${isLast ? 'text-lg font-semibold text-white' : 'text-gray-400'} truncate`}>
                  {crumb.label}
                </span>
              )}
            </div>
          );
        })}
      </nav>
      <p className="truncate text-sm text-gray-400">{organizationName}</p>
    </div>
  );
}

function PublicDocsPage() {
  return (
    <main className="min-h-screen bg-[#111318] text-gray-100">
      <header className="sticky top-0 z-40 border-b border-[#2d3036] bg-[#0b0c11]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1760px] items-center px-4 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#2edb5c] text-[#0b0c11]">
              <MessageSquareText size={20} />
            </div>
            <div className="min-w-0">
              <strong className="block truncate">RavoxZap Docs</strong>
              <span className="block truncate text-xs text-gray-500">API pública para integrações</span>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1760px] px-4 py-5 md:px-8">
        <DocsView />
      </div>
    </main>
  );
}

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [route, setRoute] = useState<DashboardRoute>(() => parseDashboardRoute());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const account = useQuery({ queryKey: ['account'], queryFn: apiClient.account });
  const instances = useQuery({ queryKey: ['instances'], queryFn: apiClient.instances });
  const dashboardSummary = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: apiClient.dashboardSummary,
    refetchInterval: 5000,
  });
  const [selectedInstanceId, setSelectedInstanceIdState] = useState<string | null>(() =>
    localStorage.getItem(SELECTED_INSTANCE_STORAGE_KEY),
  );
  const view = route.view;

  function setSelectedInstanceId(id: string | null) {
    setSelectedInstanceIdState(id);

    if (id) {
      localStorage.setItem(SELECTED_INSTANCE_STORAGE_KEY, id);
    } else {
      localStorage.removeItem(SELECTED_INSTANCE_STORAGE_KEY);
    }
  }

  function navigate(path: string, replace = false) {
    const nextRoute = parseDashboardRoute(path);
    if (window.location.pathname !== path) {
      window.history[replace ? 'replaceState' : 'pushState']({}, '', path);
      window.dispatchEvent(new Event('ravox-route-change'));
    }
    setRoute(nextRoute);
  }

  function setView(nextView: DashboardView) {
    navigate(viewPaths[nextView]);
  }

  useEffect(() => {
    const onPopState = () => setRoute(parseDashboardRoute());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const selectedInstance = useMemo(() => {
    const list = instances.data ?? [];
    return list.find(instance => instance.id === route.instanceId) ?? list.find(instance => instance.id === selectedInstanceId) ?? list[0];
  }, [instances.data, route.instanceId, selectedInstanceId]);

  useEffect(() => {
    const list = instances.data ?? [];
    if (!selectedInstance?.id) return;

    const storedInstanceExists = selectedInstanceId
      ? list.some(instance => instance.id === selectedInstanceId)
      : false;

    if (!selectedInstanceId || !storedInstanceExists) {
      setSelectedInstanceId(selectedInstance.id);
    }
  }, [instances.data, selectedInstance?.id, selectedInstanceId]);

  const organizations = account.data?.organizations ?? [];
  const organizationName = organizations[0]?.name ?? 'Carregando organização';

  return (
    <div className="min-h-screen bg-[#111318] md:flex">
      <Sidebar view={view} setView={setView} onLogout={onLogout} className="hidden md:flex" />
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <button
            type="button"
            className="absolute inset-0 cursor-pointer bg-black/70"
            onClick={() => setSidebarOpen(false)}
            aria-label="Fechar menu"
          />
          <Sidebar
            view={view}
            setView={setView}
            onLogout={onLogout}
            onNavigate={() => setSidebarOpen(false)}
            showClose
            className="relative z-10 flex shadow-[20px_0_80px_rgba(0,0,0,0.45)]"
          />
        </div>
      )}
      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-16 items-center border-b border-[#2d3036] bg-[#181a21] px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-md border border-[#2d3036] bg-[#111318] text-gray-200 transition hover:bg-[#23262e] md:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu size={18} />
            </button>
            <DashboardBreadcrumbs
              route={route}
              selectedInstance={selectedInstance}
              organizationName={organizationName}
              navigate={navigate}
            />
          </div>
        </header>
        <div className="overflow-x-hidden p-4 md:p-6">
          {view === 'dashboard' && <DashboardHome summary={dashboardSummary.data} />}
          {view === 'instances' && (
            <InstancesView
              organizations={organizations}
              selectedInstance={selectedInstance}
              setSelectedInstance={instance => setSelectedInstanceId(instance.id)}
              routeInstanceId={route.instanceId}
              routeInstanceTab={route.instanceTab}
              navigate={navigate}
            />
          )}
          {view === 'api-keys' && <ApiKeysView organizations={organizations} />}
          {view === 'docs' && <DocsView selectedInstance={selectedInstance} />}
        </div>
      </main>
    </div>
  );
}

function App() {
  const [authenticated, setAuthenticated] = useState(Boolean(getToken()));
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    const syncPath = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', syncPath);
    window.addEventListener('ravox-route-change', syncPath);
    return () => {
      window.removeEventListener('popstate', syncPath);
      window.removeEventListener('ravox-route-change', syncPath);
    };
  }, []);

  function logout() {
    clearToken();
    setAuthenticated(false);
    queryClient.clear();
  }

  if (pathname === '/docs' || pathname.startsWith('/docs/')) return <PublicDocsPage />;

  return authenticated ? <Dashboard onLogout={logout} /> : <AuthScreen onAuth={() => setAuthenticated(true)} />;
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
);
