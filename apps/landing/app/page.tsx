import {
  Activity,
  ArrowRight,
  BadgeCheck,
  BellRing,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Code2,
  CreditCard,
  Gauge,
  KeyRound,
  Layers3,
  LockKeyhole,
  MessageSquareText,
  QrCode,
  RefreshCw,
  Route,
  ShieldCheck,
  TerminalSquare,
  Webhook,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { LandingAnimations } from './LandingAnimations';

const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? 'http://localhost:3004';
const registerUrl = `${dashboardUrl}/register`;
const loginUrl = `${dashboardUrl}/login`;
const docsUrl = `${dashboardUrl}/docs`;

const proofItems = [
  ['30 dias', 'trial com cartao'],
  ['R$59', '1 instancia inclusa'],
  ['R$39', 'por slot adicional'],
  ['402', 'bloqueio por billing'],
];

const flowSteps = [
  {
    icon: QrCode,
    title: 'Conecte pelo QR',
    text: 'Cada cliente ganha uma instancia isolada para sessao, QR e status.',
  },
  {
    icon: KeyRound,
    title: 'Emita chaves',
    text: 'Tokens por organizacao para integrar SaaS, CRM, bots e automacoes.',
  },
  {
    icon: TerminalSquare,
    title: 'Envie pela API',
    text: 'Comandos entram em fila e voltam com status previsivel.',
  },
  {
    icon: Webhook,
    title: 'Receba eventos',
    text: 'Mensagens, QR, conexao e entregas chegam por webhook assinado.',
  },
];

const features = [
  {
    icon: Layers3,
    title: 'Multi-instancia',
    text: 'Slots contratados por organizacao, limite claro e upgrade sem gambiarra.',
  },
  {
    icon: Gauge,
    title: 'Fila operacional',
    text: 'Workers e historico para comandos assíncronos em ambiente real.',
  },
  {
    icon: ShieldCheck,
    title: 'Controle de uso',
    text: 'Bloqueio por assinatura, billing visivel e trial com regra simples.',
  },
  {
    icon: BellRing,
    title: 'Eventos para produto',
    text: 'Webhooks para manter o app do cliente sincronizado com a sessao.',
  },
];

const endpoints = [
  'POST /v1/instances/{id}/send-text',
  'POST /v1/instances/{id}/send-media',
  'GET /v1/instances/{id}/status',
  'POST /billing/instance-slots/checkout',
];

const events = ['message.received', 'instance.connected', 'qr.updated', 'message.status'];

const priceDetails: Array<[string, string, LucideIcon]> = [
  ['Slot adicional', 'R$39/mes', RefreshCw],
  ['10+ instancias', 'R$29 por adicional', BadgeCheck],
  ['Trial', '30 dias gratis', Clock3],
  ['Checkout', 'pagamento seguro', LockKeyhole],
];

const faqs = [
  {
    question: 'O RavoxZap e a API oficial da Meta?',
    answer: 'Nao. O produto e vendido como API via QR Code e sessao WhatsApp, com foco em operacao tecnica para devs e agencias.',
  },
  {
    question: 'Como funciona o trial?',
    answer: 'O cliente inicia com 30 dias gratis e cartao obrigatorio. Depois do periodo, a assinatura controla o acesso operacional.',
  },
  {
    question: 'Posso vender para varios clientes?',
    answer: 'Sim. O modelo usa slots de instancia por organizacao para separar clientes, limites e conexoes.',
  },
];

export default function LandingPage() {
  return (
    <main className="landing-page">
      <LandingAnimations />

      <section className="hero-section">
        <div className="hero-pattern" aria-hidden="true" />
        <div className="hero-inner">
          <header className="site-header" data-animate="hero">
            <a href="/" className="brand">
              <span className="brand-mark">
                <MessageSquareText size={22} />
              </span>
              <span>RavoxZap</span>
            </a>
            <nav className="site-nav" aria-label="Principal">
              <a href="#produto">Produto</a>
              <a href="#devs">Devs</a>
              <a href="#precos">Precos</a>
              <a href={docsUrl}>Docs</a>
            </nav>
            <a href={loginUrl} className="header-action">
              Entrar
            </a>
          </header>

          <div className="hero-grid">
            <div className="hero-copy">
              <span className="eyebrow" data-animate="hero">
                API WhatsApp por instancia mensal
              </span>
              <h1 data-animate="hero">Venda WhatsApp como infraestrutura pronta para operar.</h1>
              <p data-animate="hero">
                Conecte numeros por QR Code, entregue API para seus clientes e controle trial, slots, webhooks e filas sem depender de scripts soltos.
              </p>
              <div className="hero-actions" data-animate="hero">
                <a href={registerUrl} className="primary-action">
                  Comecar teste gratis
                  <ArrowRight size={17} />
                </a>
                <a href={docsUrl} className="secondary-action">
                  Ver docs
                </a>
              </div>
              <div className="hero-proof" data-animate="hero">
                {proofItems.map(([value, label]) => (
                  <div key={label}>
                    <strong>{value}</strong>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="hero-visual" aria-label="Preview operacional RavoxZap" data-animate="hero">
              <div className="status-strip" data-float>
                <span className="live-dot" />
                10 instancias online
              </div>
              <div className="product-window">
                <div className="window-bar">
                  <div>
                    <span />
                    <span />
                    <span />
                  </div>
                  <code>api.ravoxzap.com/v1</code>
                </div>
                <div className="product-shell">
                  <aside className="preview-sidebar">
                    {['Instancias', 'API Keys', 'Webhooks', 'Billing'].map((item, index) => (
                      <span key={item} className={index === 0 ? 'active' : undefined}>
                        {item}
                      </span>
                    ))}
                  </aside>
                  <div className="preview-main">
                    <div className="preview-topline">
                      <div>
                        <span>Organizacao</span>
                        <strong>Agencia Norte</strong>
                      </div>
                      <em>TRIALING</em>
                    </div>
                    <div className="metric-row">
                      {[
                        ['Slots', '12'],
                        ['Online', '10'],
                        ['Fila', '32'],
                      ].map(([label, value]) => (
                        <div key={label} className="metric-card">
                          <span>{label}</span>
                          <strong>{value}</strong>
                        </div>
                      ))}
                    </div>
                    <div className="instance-panel">
                      {[
                        ['Suporte Cliente A', 'Conectada', 'green'],
                        ['Vendas B2B', 'Aguardando QR', 'amber'],
                        ['Cobranca', 'Webhook ativo', 'blue'],
                      ].map(([name, status, tone]) => (
                        <div key={name} className="instance-row">
                          <div>
                            <strong>{name}</strong>
                            <span>ravox_live_xxxxx</span>
                          </div>
                          <em className={tone}>{status}</em>
                        </div>
                      ))}
                    </div>
                    <div className="api-tile">
                      <Code2 size={18} />
                      <code>{`await ravox.instances.sendText({
  to: "+5585999999999",
  body: "Pedido confirmado"
})`}</code>
                    </div>
                  </div>
                </div>
              </div>
              <div className="billing-popover" data-float>
                <CreditCard size={18} />
                <div>
                  <strong>R$59/m</strong>
                  <span>1 slot + trial 30d</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="proof-bar" aria-label="Resumo comercial">
        {proofItems.map(([value, label]) => (
          <div key={label} data-animate="reveal">
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </section>

      <section className="section flow-section" data-animate="reveal">
        <div className="section-heading">
          <span className="section-kicker">Como funciona</span>
          <h2>Da leitura do QR ao webhook entregue, tudo com trilho operacional.</h2>
          <p>Uma jornada simples para transformar instancia WhatsApp em produto vendavel.</p>
        </div>

        <div className="flow-grid">
          <span className="flow-line" data-flow-line />
          {flowSteps.map(({ icon: Icon, title, text }, index) => (
            <article key={title} className="flow-card" data-animate="reveal">
              <div className="step-index">0{index + 1}</div>
              <Icon size={22} />
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="produto" className="section product-section">
        <div className="section-heading compact" data-animate="reveal">
          <span className="section-kicker">Produto</span>
          <h2>Painel, API, billing e operacao no mesmo lugar.</h2>
        </div>

        <div className="feature-grid">
          {features.map(({ icon: Icon, title, text }) => (
            <article key={title} className="feature-card" data-animate="reveal">
              <span className="icon-box">
                <Icon size={22} />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>

        <div className="ops-panel" data-animate="reveal">
          <div>
            <span className="section-kicker">Operacao</span>
            <h2>Controles que deixam o suporte mais previsivel.</h2>
            <p>Quando uma assinatura vence, o painel continua acessivel para billing e limpeza, enquanto chamadas operacionais recebem bloqueio claro.</p>
          </div>
          <div className="ops-list">
            {[
              ['Trial ativo', 'criacao liberada ate o limite'],
              ['Limite atingido', 'novo slot exige upgrade'],
              ['Past due', 'API publica bloqueada com 402'],
            ].map(([label, detail]) => (
              <div key={label}>
                <CheckCircle2 size={18} />
                <strong>{label}</strong>
                <span>{detail}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="devs" className="section dev-section">
        <div className="dev-copy" data-animate="reveal">
          <span className="section-kicker">Para devs</span>
          <h2>Endpoints claros para plugar em qualquer produto.</h2>
          <p>Use tokens por organizacao, webhooks assinados e status de instancia para integrar CRMs, bots, ERPs e plataformas internas.</p>
          <div className="endpoint-list">
            {endpoints.map(endpoint => (
              <div key={endpoint}>
                <Route size={17} />
                <code>{endpoint}</code>
              </div>
            ))}
          </div>
        </div>

        <div className="code-lab" data-animate="code">
          <div className="code-tabs">
            <span className="active">send-text</span>
            <span>webhook</span>
            <span>billing</span>
          </div>
          <pre>
            <code>{`curl -X POST "$API/v1/instances/{id}/send-text" \\
  -H "Authorization: Bearer ravox_live_xxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "+5585999999999",
    "body": "Ola pelo RavoxZap"
  }'`}</code>
          </pre>
          <div className="event-grid">
            {events.map(event => (
              <span key={event}>
                <Activity size={15} />
                {event}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="precos" className="section pricing-section">
        <div className="section-heading" data-animate="reveal">
          <span className="section-kicker">Precos</span>
          <h2>Cobranca simples por slot de instancia ativa.</h2>
          <p>Comece barato, cobre por crescimento e mantenha margem para infraestrutura, suporte e instabilidade operacional.</p>
        </div>

        <div className="pricing-layout">
          <article className="price-card featured" data-animate="reveal">
            <span className="plan-badge">Plano v1</span>
            <h3>RavoxZap Start</h3>
            <div className="price">
              <strong>R$59</strong>
              <span>/mes</span>
            </div>
            <p>Inclui 1 instancia ativa, API, webhooks, painel e 30 dias gratis com cartao.</p>
            <a href={registerUrl} className="primary-action">
              Comecar trial
              <ArrowRight size={17} />
            </a>
          </article>

          <div className="price-details">
            {priceDetails.map(([label, value, Icon]) => (
              <article key={label} className="price-mini" data-animate="reveal">
                <Icon size={19} />
                <span>{label}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section faq-section">
        <div className="section-heading compact" data-animate="reveal">
          <span className="section-kicker">FAQ</span>
          <h2>Perguntas que aparecem antes da primeira venda.</h2>
        </div>
        <div className="faq-grid">
          {faqs.map(item => (
            <article key={item.question} data-animate="reveal">
              <h3>{item.question}</h3>
              <p>{item.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="final-cta" data-animate="reveal">
        <div>
          <span className="section-kicker">Pronto para validar?</span>
          <h2>Abra o trial e conecte a primeira instancia hoje.</h2>
          <p>Uma landing objetiva, produto claro e preco pronto para vender para devs e agencias.</p>
        </div>
        <a href={registerUrl} className="primary-action">
          Abrir RavoxZap
          <ChevronRight size={17} />
        </a>
      </section>
    </main>
  );
}
