import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowLeft,
  Bell,
  BarChart3,
  Check,
  CheckCheck,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Copy,
  FileText,
  KeyRound,
  LogOut,
  Menu,
  MessageCircle,
  MessageSquareText,
  Mic,
  MoreVertical,
  Paperclip,
  Power,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Send,
  Smartphone,
  Square,
  Trash2,
  UserPlus,
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
  type Organization,
  type WebhookEndpoint,
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

type DashboardView = 'dashboard' | 'instances' | 'chats' | 'api-keys' | 'docs';
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
  chats: '/dashboard/chats',
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

    if (segments[1] === 'chats') return { view: 'chats', instanceTab: 'details' };
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
    { id: 'chats', label: 'Conversas', icon: MessageSquareText },
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

function ChatsView({
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
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactDdi, setContactDdi] = useState('55');
  const [contactPhone, setContactPhone] = useState('');
  const [contactSearch, setContactSearch] = useState('');
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
    chatInstance && (selectedContact?.remoteJid ?? selectedChat?.remoteJid)
      ? `${chatInstance.id}:${selectedContact?.remoteJid ?? selectedChat?.remoteJid}`
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
  }, [chatInstance?.id]);

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
      void queryClient.invalidateQueries({ queryKey: ['contacts', organizationId] });
    },
  });
  const send = useMutation({
    mutationFn: () => {
      const recipient = selectedContact?.phoneE164 ?? selectedChat?.remoteJid;
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

  if (!chatInstance) {
    return <EmptyState icon={MessageSquareText} title="Conecte uma instância para conversar" />;
  }

  const contactList = contacts.data ?? [];
  const chatList = chats.data ?? [];
  const normalizedSearch = contactSearch.trim().toLowerCase();
  const contactByRemoteJid = new Map(contactList.map(contact => [contact.remoteJid, contact]));
  const contactByPhone = new Map(contactList.map(contact => [contact.phoneE164, contact]));
  const chatRows = [
    ...chatList.map(chat => {
      const chatPhone = chat.remoteJid.replace(/\D/g, '');
      const contact = contactByRemoteJid.get(chat.remoteJid) ?? contactByPhone.get(chatPhone) ?? null;
      const title = contact?.name ?? chat.name ?? (chatPhone || chat.remoteJid);
      const lastMessage = chat.messages?.[0];

      return {
        id: `chat:${chat.id}`,
        contact,
        chat,
        title,
        subtitle: contact?.phoneE164 ?? (chatPhone || chat.remoteJid),
        preview: chatPreviewFromMessage(lastMessage),
        time: formatRelativeChatTime(chat.updatedAt),
        searchable: [title, contact?.phoneE164, chat.remoteJid, chatPhone].filter(Boolean).join(' ').toLowerCase(),
      };
    }),
    ...contactList
      .filter(contact => !chatList.some(chat => chat.remoteJid === contact.remoteJid || chat.remoteJid.replace(/\D/g, '') === contact.phoneE164))
      .map(contact => ({
        id: `contact:${contact.id}`,
        contact,
        chat: null,
        title: contact.name,
        subtitle: contact.phoneE164,
        preview: 'Sem mensagens ainda',
        time: '',
        searchable: [contact.name, contact.phoneE164, contact.remoteJid].join(' ').toLowerCase(),
      })),
  ]
    .filter(row => !normalizedSearch || row.searchable.includes(normalizedSearch))
    .sort((a, b) => {
      if (a.chat?.updatedAt && b.chat?.updatedAt) {
        return new Date(b.chat.updatedAt).getTime() - new Date(a.chat.updatedAt).getTime();
      }
      if (a.chat?.updatedAt) return -1;
      if (b.chat?.updatedAt) return 1;
      return a.title.localeCompare(b.title);
    });
  const selectedChatPhone = selectedChat?.remoteJid.replace(/\D/g, '');
  const selectedTitle = selectedContact?.name ?? selectedChat?.name ?? selectedChatPhone ?? 'Envio manual';
  const selectedSubtitle = selectedContact?.phoneE164 ?? selectedChatPhone ?? 'Selecione uma conversa para enviar';
  const selectedRecipient = selectedContact?.phoneE164 ?? selectedChat?.remoteJid;
  const selectedChatCanBeSaved = Boolean(selectedChat && !selectedContact);
  const openSaveSelectedChatContact = () => {
    if (!selectedChatPhone) return;
    const phoneParts = splitPhoneForContact(selectedChatPhone);
    setContactName(selectedChat?.name ?? '');
    setContactDdi(phoneParts.ddi);
    setContactPhone(phoneParts.phone);
    setContactModalOpen(true);
  };

  return (
    <div className="grid h-[calc(100dvh-6rem)] min-h-0 grid-rows-[minmax(14rem,35%)_minmax(0,1fr)] gap-4 md:h-[calc(100dvh-7rem)] xl:grid-cols-[340px_minmax(0,1fr)] xl:grid-rows-none">
      <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#2d3036] bg-[#181a21] shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
        <div className="space-y-4 border-b border-[#2d3036] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Chats</h2>
              <p className="text-sm text-gray-400">{chatRows.length} conversas · {contactList.length} contatos</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="h-9 w-9 rounded-full px-0"
              onClick={() => setContactModalOpen(true)}
              aria-label="Criar contato"
            >
              <Plus size={18} />
            </Button>
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
              placeholder="Buscar chat..."
              value={contactSearch}
              onChange={event => setContactSearch(event.target.value)}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {chatRows.map(({ id, contact, chat, title, preview, time }) => {
            const isSelected =
              (chat && selectedChat?.id === chat.id) ||
              (!chat && contact && selectedContact?.id === contact.id);

            return (
            <button
              key={id}
              onClick={() => {
                setSelectedContact(contact);
                setSelectedChat(chat);
              }}
              className={`grid w-full cursor-pointer grid-cols-[40px_1fr_auto] gap-3 border-b border-[#2d3036] px-4 py-3 text-left transition ${
                isSelected ? 'bg-[#23262e]' : 'hover:bg-[#1f2128]'
              }`}
            >
              <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[#2b3038] text-sm font-semibold text-gray-100">
                {getInitials(title)}
                {chat && (
                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#181a21] bg-[#2edb5c]" />
                )}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <strong className="min-w-0 flex-1 truncate text-sm">{title}</strong>
                </span>
                <span className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-gray-400">
                  {chat && <CheckCheck className="shrink-0 text-[#2edb5c]" size={14} />}
                  <span className="truncate">{preview}</span>
                </span>
              </span>
              <span className="pt-0.5 text-xs text-gray-500">{time}</span>
            </button>
          );
          })}

          {chatRows.length === 0 && (
            <div className="px-5 py-8 text-sm text-gray-500">
              {contactSearch ? 'Nenhum chat encontrado.' : 'Nenhuma conversa ainda.'}
            </div>
          )}
        </div>
      </section>

      <section className="flex min-h-0 overflow-hidden rounded-xl border border-[#2d3036] bg-[#181a21] shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
        {!selectedRecipient ? (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center">
            <div className="max-w-sm">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#23262e] text-gray-400">
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
          <div className="border-b border-[#2d3036] px-4 py-4 sm:px-5">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#2b3038] text-sm font-semibold text-gray-100">
                  {getInitials(selectedTitle)}
                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#181a21] bg-[#2edb5c]" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold">{selectedTitle}</h2>
                  <p className="truncate text-sm text-gray-400">{selectedSubtitle}</p>
                </div>
              </div>
              {selectedChatCanBeSaved && (
                <Button type="button" variant="ghost" className="shrink-0" onClick={openSaveSelectedChatContact}>
                  <UserPlus size={16} />
                  <span className="hidden sm:inline">Salvar contato</span>
                </Button>
              )}
            </div>
          </div>

          <div ref={messagesScrollRef} className="min-h-0 flex-1 overflow-auto bg-[#15171d] p-3 sm:p-5">
            {(messages.data ?? []).length === 0 ? (
              <div className="flex h-full items-center justify-center text-center text-sm text-gray-500">
                {selectedRecipient ? 'Nenhuma mensagem nesta conversa ainda.' : 'Selecione uma conversa para começar.'}
              </div>
            ) : (
              <div className="space-y-3">
                {(messages.data ?? []).map(message => (
                  <div key={message.id} className={`flex ${message.fromMe ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className="max-w-[86%] rounded-2xl bg-[#23262e] px-3.5 py-2 text-sm text-gray-100 shadow-sm data-[has-image=true]:p-1.5 data-[from-me=true]:bg-[#12351f] sm:max-w-[78%]"
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
                              <audio controls src={absoluteApiUrl(message.mediaUrl)} className="h-10 w-72 max-w-full" />
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
                            {message.body && (!message.mediaUrl || ['VIDEO', 'AUDIO'].includes(message.type ?? '')) ? (
                              <p className="min-w-0 break-words leading-relaxed">{message.body}</p>
                            ) : (
                              !message.mediaUrl && (
                                <p className="min-w-0 text-gray-400">{message.type ? `${mediaKindLabel(message.type)} recebido` : 'Mensagem recebida'}</p>
                              )
                            )}
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
            className="border-t border-[#2d3036] bg-[#181a21] p-3 sm:p-4"
            onSubmit={event => {
              event.preventDefault();
              send.mutate();
            }}
          >
            {selectedFile && (
              <div
                className={`mb-2 flex min-w-0 items-center justify-between gap-2 border text-sm ${
                  selectedFileKind === 'AUDIO'
                    ? 'rounded-full border-[#2d3036] bg-[#111318] px-2 py-1.5'
                    : 'rounded-lg border-[#2d3036] bg-[#111318] p-2'
                }`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3 text-gray-300">
                  {selectedFileKind === 'AUDIO' && selectedFilePreviewUrl ? (
                    <>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#2edb5c] text-[#07110b]">
                        <Mic size={18} />
                      </span>
                      <audio controls src={selectedFilePreviewUrl} className="h-9 min-w-0 flex-1" />
                    </>
                  ) : selectedFileKind === 'IMAGE' && selectedFilePreviewUrl ? (
                    <img src={selectedFilePreviewUrl} alt={selectedFile.name} className="h-12 w-12 rounded-md object-cover" />
                  ) : selectedFileKind === 'VIDEO' && selectedFilePreviewUrl ? (
                    <video src={selectedFilePreviewUrl} className="h-12 w-16 rounded-md bg-black object-cover" muted />
                  ) : (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[#23262e] text-[#2edb5c]">
                      <FileText size={20} />
                    </span>
                  )}
                  {selectedFileKind !== 'AUDIO' && (
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium text-gray-100">{selectedFile.name}</span>
                        <span className="shrink-0 text-xs text-gray-500">{mediaKindLabel(selectedFileKind ?? undefined)}</span>
                      </div>
                      <span className="block truncate text-xs text-gray-500">{selectedFile.name}</span>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className={`shrink-0 cursor-pointer text-gray-500 transition hover:text-white ${
                    selectedFileKind === 'AUDIO' ? 'mr-2 flex h-8 w-8 items-center justify-center rounded-full hover:bg-[#23262e]' : ''
                  }`}
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
            {isRecordingAudio && (
              <div className="mb-2 rounded-full border border-[#25563a] bg-[#0d2417] px-2 py-2 text-sm text-gray-100 sm:px-3">
                <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                  <button
                    type="button"
                    className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-red-300 transition hover:bg-red-500/15 hover:text-red-100"
                    onClick={cancelRecordingAudio}
                    aria-label="Cancelar áudio"
                  >
                    <Trash2 size={18} />
                  </button>
                  <span className="min-w-11 text-sm font-semibold tabular-nums text-red-100">
                    {formatDuration(recordingSeconds)}
                  </span>
                  <div className="flex h-10 min-w-0 flex-1 items-center gap-0.5 overflow-hidden rounded-full bg-[#111318] px-3">
                    {Array.from({ length: 72 }).map((_, index) => {
                      const wave = Math.sin(index * 0.72) * 0.5 + 0.5;
                      const liveLevel = Math.max(0.1, recordingLevel);
                      const barStrength = 0.18 + liveLevel * (0.35 + wave * 0.65);

                      return (
                        <span
                          key={index}
                          className="w-0.5 flex-1 rounded-full bg-[#2edb5c] transition-[height,opacity] duration-75"
                          style={{
                            maxWidth: 4,
                            height: `${4 + barStrength * 26}px`,
                            opacity: 0.45 + Math.min(1, barStrength) * 0.55,
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            {recordingError && (
              <div className="mb-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                {recordingError}
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto_auto]">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
                onChange={event => {
                  setRecordingError('');
                  setSelectedFile(event.target.files?.[0] ?? null);
                }}
              />
              <Button
                type="button"
                variant="ghost"
                className="w-full px-3 sm:w-auto"
                disabled={!selectedRecipient || send.isPending || isRecordingAudio}
                onClick={() => fileInputRef.current?.click()}
                aria-label="Anexar arquivo"
              >
                <Paperclip size={18} />
              </Button>
              <Input
                placeholder={
                  selectedFile
                    ? 'Legenda opcional'
                    : isRecordingAudio
                      ? 'Gravando áudio...'
                    : selectedContact
                      ? `Mensagem para ${selectedContact.name}`
                      : selectedChat
                        ? `Mensagem para ${selectedTitle}`
                        : 'Selecione uma conversa para enviar'
                }
                value={body}
                onChange={event => setBody(event.target.value)}
                disabled={!selectedRecipient || isRecordingAudio}
              />
              <Button
                type="button"
                variant="ghost"
                className={`w-full px-3 sm:w-auto ${isRecordingAudio ? 'border-red-500/40 bg-red-500/10 text-red-100 hover:bg-red-500/15' : ''}`}
                disabled={!selectedRecipient || send.isPending}
                onClick={() => {
                  if (isRecordingAudio) stopRecordingAudio();
                  else void startRecordingAudio();
                }}
                aria-label={isRecordingAudio ? 'Parar gravação' : 'Gravar áudio'}
              >
                {isRecordingAudio ? <Square size={16} /> : <Mic size={18} />}
              </Button>
              <Button
                className="w-full shrink-0 sm:w-auto"
                disabled={!selectedRecipient || isRecordingAudio || (!body.trim() && !selectedFile) || send.isPending}
              >
                <Send size={18} />
                Enviar
              </Button>
            </div>
          </form>
        </div>
        )}
      </section>

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
    UNKNOWN: 'Outros',
  };
  const timeline = summary?.timeline.map(item => ({
    ...item,
    label: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(`${item.date}T00:00:00`)),
  })) ?? [];
  const maxTypeCount = Math.max(1, ...Object.values(summary?.byType ?? { TEXT: 0, IMAGE: 0, AUDIO: 0, DOCUMENT: 0, VIDEO: 0, UNKNOWN: 0 }));

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
  method: 'GET' | 'POST';
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
  const publicBaseUrl = absoluteApiUrl('/v1');
  const [activeDocId, setActiveDocId] = useState('intro');
  const queuedResponse = `{
  "messageId": "msg_123",
  "status": "QUEUED"
}`;
  const docs: DocsEndpoint[] = [
    {
      id: 'send-text',
      group: 'Mensagens',
      method: 'POST',
      title: 'Enviar texto',
      path: `/v1/instances/${exampleInstanceId}/send-text`,
      description: 'Enfileira uma mensagem de texto para um contato usando uma instância conectada.',
      requestBody: `{
  "to": "5585999999999",
  "body": "Olá, mensagem enviada pela RavoxZap"
}`,
      responseBody: queuedResponse,
      curl: `curl -X POST "${publicBaseUrl}/instances/${exampleInstanceId}/send-text" \\
  -H "Authorization: Bearer ravox_live_xxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "5585999999999",
    "body": "Olá, mensagem enviada pela RavoxZap"
}'`,
      notes: ['O telefone deve ser enviado com DDI e somente dígitos.', 'O envio é assíncrono: o worker processa a fila e atualiza o status da mensagem.'],
    },
    {
      id: 'send-image',
      group: 'Mensagens',
      method: 'POST',
      title: 'Enviar imagem',
      path: `/v1/instances/${exampleInstanceId}/send-image`,
      description: 'Envia uma imagem por URL pública ou data URL base64. O limite inicial é 15MB.',
      requestBody: `{
  "to": "5585999999999",
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
    "to": "5585999999999",
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
  "to": "5585999999999",
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
    "to": "5585999999999",
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
  "to": "5585999999999",
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
    "to": "5585999999999",
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
  "to": "5585999999999",
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
    "to": "5585999999999",
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
  ];
  const groups = ['Mensagens', 'Instância', 'Conversas'];
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
    'Contatos compartilhados na API pública',
    'Localização',
    'Stickers',
    'Reações',
    'Grupos',
    'Botões e listas',
    'Enquetes',
    'Catálogo e recursos Business',
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[270px_minmax(0,1fr)_420px]">
      <aside className="rounded-xl border border-[#2d3036] bg-[#111318] p-4 lg:sticky lg:top-[5.25rem] lg:max-h-[calc(100vh-6.5rem)] lg:overflow-y-auto">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#2edb5c]">API Reference</p>
          <h2 className="mt-2 text-lg font-semibold">RavoxZap Public API</h2>
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
              onClick={() => setActiveDocId('intro')}
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
                    onClick={() => setActiveDocId(doc.id)}
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
              onClick={() => setActiveDocId('roadmap')}
            >
              Próximas funcionalidades
            </button>
          </div>
        </div>
      </aside>

      <article className="min-w-0 rounded-xl border border-[#2d3036] bg-[#181a21] p-5 lg:p-8">
        {activeDocId === 'intro' && (
          <section className="space-y-8">
            <div className="border-b border-[#2d3036] pb-8">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#2edb5c]">Introdução</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">RavoxZap Public API</h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-gray-400">
                O RavoxZap expõe uma API pública para enviar mensagens, consultar conexão e ler conversas salvas.
                Hoje o pacote funcional cobre texto, imagem, áudio, vídeo, documento, status, QR Code, restart, logout,
                chats e mensagens.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                ['1. API Key', 'Crie uma chave no painel e copie o token uma única vez.'],
                ['2. Instância', 'Use o ID da instância conectada ao número do WhatsApp.'],
                ['3. Fila e worker', 'A API enfileira; o worker envia pelo WhatsApp e atualiza o status.'],
              ].map(([title, description]) => (
                <div key={title} className="rounded-xl border border-[#2d3036] bg-[#111318] p-5">
                  <h2 className="font-semibold text-white">{title}</h2>
                  <p className="mt-2 text-sm leading-6 text-gray-400">{description}</p>
                </div>
              ))}
            </div>
            <div>
              <h2 className="text-2xl font-semibold">Autenticação</h2>
              <p className="mt-2 text-gray-400">Envie a API Key no header de autorização em todas as chamadas públicas.</p>
              <div className="mt-4">
                <CodeSnippet>{`Authorization: Bearer ravox_live_xxxxx`}</CodeSnippet>
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-semibold">Fluxo</h2>
              <div className="mt-4 rounded-xl border border-[#2d3036] bg-[#111318] p-5 font-mono text-sm text-gray-300">
                API pública → valida token e escopo → salva mídia local quando existir → cria mensagem → BullMQ → Worker → Baileys → WhatsApp
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
                <h2 className="text-2xl font-semibold">Authentication</h2>
                <p className="mt-2 text-gray-400">Envie a API Key no header de autorização em todas as chamadas públicas.</p>
                <div className="mt-4">
                  <CodeSnippet>{`Authorization: Bearer ravox_live_xxxxx`}</CodeSnippet>
                </div>
              </div>

              <div>
                <h2 className="text-2xl font-semibold">Path parameters</h2>
                <div className="mt-4 rounded-xl border border-[#2d3036]">
                  <div className="grid gap-3 border-b border-[#2d3036] p-4 text-sm sm:grid-cols-[180px_120px_minmax(0,1fr)]">
                    <code className="text-gray-200">instanceId</code>
                    <span className="text-gray-500">string</span>
                    <span className="text-gray-400">ID da instância WhatsApp que pertence à API Key.</span>
                  </div>
                  {activeDoc.id === 'messages' && (
                    <div className="grid gap-3 p-4 text-sm sm:grid-cols-[180px_120px_minmax(0,1fr)]">
                      <code className="text-gray-200">chatId</code>
                      <span className="text-gray-500">string</span>
                      <span className="text-gray-400">ID do chat retornado em listar chats.</span>
                    </div>
                  )}
                </div>
              </div>

              {activeDoc.requestBody && (
                <div>
                  <h2 className="text-2xl font-semibold">Request body</h2>
                  <div className="mt-4">
                    <DocsCodeBlock title="application/json" code={activeDoc.requestBody} />
                  </div>
                </div>
              )}

              <div>
                <h2 className="text-2xl font-semibold">Response</h2>
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

      <aside className="min-w-0 rounded-xl border border-[#2d3036] bg-[#111318] p-4 lg:sticky lg:top-[5.25rem] lg:max-h-[calc(100vh-6.5rem)] lg:overflow-y-auto">
        <div className="space-y-4">
          {activeDoc ? (
            <>
              <DocsCodeBlock title="cURL" code={activeDoc.curl} />
              <DocsCodeBlock title="Response" code={activeDoc.responseBody} />
              <DocsCodeBlock title="Webhook payload" code={webhookPayload} />
            </>
          ) : (
            <>
              <div className="rounded-xl border border-[#2d3036] bg-[#0d0f14] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Funcional hoje</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {['texto', 'imagem', 'áudio', 'vídeo', 'documento', 'status', 'qr code', 'chats'].map(item => (
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
    chats: 'Conversas',
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
  const authenticated = Boolean(getToken());

  return (
    <main className="min-h-screen bg-[#111318] text-gray-100">
      <header className="sticky top-0 z-40 border-b border-[#2d3036] bg-[#0b0c11]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1760px] items-center justify-between gap-4 px-4 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#2edb5c] text-[#0b0c11]">
              <MessageSquareText size={20} />
            </div>
            <div className="min-w-0">
              <strong className="block truncate">RavoxZap Docs</strong>
              <span className="block truncate text-xs text-gray-500">API pública para integrações</span>
            </div>
          </div>
          <button
            type="button"
            className="h-9 cursor-pointer rounded-md border border-[#2d3036] px-3 text-sm text-gray-200 transition hover:bg-[#181a21] hover:text-white"
            onClick={() => {
              window.history.pushState({}, '', authenticated ? '/dashboard' : '/login');
              window.dispatchEvent(new Event('ravox-route-change'));
            }}
          >
            {authenticated ? 'Voltar ao painel' : 'Entrar'}
          </button>
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
          {view === 'chats' && (
            <ChatsView
              organizationId={organizations[0]?.id ?? ''}
              instances={instances.data ?? []}
              selectedInstance={selectedInstance}
              setSelectedInstanceId={setSelectedInstanceId}
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
