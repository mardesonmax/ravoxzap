# RavoxZap

Gateway/API multiusuário de WhatsApp via QR Code, com painel, API pública, filas, worker Baileys, webhooks e histórico de mensagens.

## Stack

- Monorepo Yarn Workspaces + Turbo
- API Fastify + Zod + Prisma + PostgreSQL
- Worker Node.js + BullMQ + Redis
- Web React/Vite + TanStack Router/Query + Tailwind 4

## Local

```bash
cp .env.example .env
yarn install
docker compose up -d postgres redis
yarn db:generate
yarn db:migrate
yarn db:seed
yarn dev
```

Serviços:

- Web: `http://localhost:3004`
- API: `http://localhost:3334`
- Docs API: `http://localhost:3334/docs`

## Teste real com WhatsApp

Suba tudo com um comando:

```bash
yarn dev
```

Depois:

1. Acesse `http://localhost:3004`.
2. Crie uma conta ou faça login.
3. Crie uma instância em `Instâncias`.
4. Aguarde o QR Code aparecer no painel.
5. No WhatsApp do celular, use **Aparelhos conectados** e escaneie o QR.
6. Quando a instância ficar conectada, vá em `Conversas` e envie uma mensagem informando telefone com DDI, por exemplo `5585999999999`.

As sessões ficam em `storage/sessions/{instanceId}`. Para forçar um novo QR de uma instância, remova a pasta de sessão correspondente e reinicie o worker.

Baileys usa WhatsApp Web, não a API oficial Cloud da Meta. Use para testes controlados e evite disparos em massa.

## Scripts

```bash
yarn dev:web
yarn dev:api
yarn dev:worker
yarn build
yarn lint
yarn check
yarn test
yarn db:studio
```

## Conta Seed

```txt
E-mail: admin@ravoxzap.local
Senha: ravoxzap123
```

Você pode alterar esses valores no `.env` usando `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME` e `SEED_ORGANIZATION_NAME`.
