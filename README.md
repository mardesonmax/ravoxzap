# RavoxZap

Gateway/API multiusuario de WhatsApp via QR Code, com painel web, API publica, filas, worker Baileys, webhooks, envio de midia e historico de mensagens.

## Stack

- Monorepo com Yarn Workspaces + Turbo
- API Fastify + Zod + Prisma + PostgreSQL
- Worker Node.js + BullMQ + Redis + Baileys
- Web React/Vite + TanStack Query + Tailwind 4
- Storage local em `storage/media` e `storage/sessions`

## Portas

| Servico | URL |
| --- | --- |
| Web | `http://localhost:3004` |
| Docs publicas | `http://localhost:3004/docs` |
| API | `http://localhost:3334` |
| Docs tecnica da API | `http://localhost:3334/docs` |
| Postgres local | `localhost:25432` |
| Redis local | `localhost:26379` |

## Opcao recomendada para desenvolvimento

Use Node/Yarn no host e Docker apenas para Postgres e Redis. Essa e a forma padrao do projeto: os servicos ficam em containers, enquanto web, API e worker rodam localmente com recarregamento rapido.

### Requisitos

- Node.js 24 ou superior
- Yarn 1.22.22
- Docker Desktop ou Docker Engine
- ffmpeg no host para envio de audio gravado pelo painel

Instale o Yarn, se precisar:

```bash
corepack enable
corepack prepare yarn@1.22.22 --activate
```

No macOS, instale o ffmpeg com:

```bash
brew install ffmpeg
```

No Ubuntu/Debian:

```bash
sudo apt update
sudo apt install -y ffmpeg
```

### Setup local

```bash
cp .env.example .env
mkdir -p storage/media storage/sessions
yarn install
docker compose up -d
yarn db:generate
yarn db:migrate
yarn db:seed
yarn dev
```

O comando `yarn dev` sobe:

- `apps/api` em `http://localhost:3334`
- `apps/web` em `http://localhost:3004`
- `apps/worker` processando WhatsApp, filas e webhooks

## Docker local

O `docker-compose.yml` sobe somente as dependencias locais:

- Postgres em `localhost:25432`
- Redis em `localhost:26379`

Para iniciar:

```bash
docker compose up -d
```

Para ver logs:

```bash
docker compose logs -f postgres redis
```

Para parar os servicos:

```bash
docker compose down
```

Para apagar tambem os dados do banco local:

```bash
docker compose down -v
```

## Variaveis de ambiente

Use `.env.example` como base para o `.env` local.

Principais variaveis:

| Variavel | Uso |
| --- | --- |
| `DATABASE_URL` | Conexao PostgreSQL |
| `REDIS_URL` | Conexao Redis/BullMQ |
| `PORT` | Porta da API |
| `API_BASE_URL` | URL publica da API |
| `WEB_BASE_URL` | URL publica do painel |
| `VITE_API_BASE_URL` | URL da API usada pelo browser |
| `JWT_SECRET` | Assinatura da sessao do painel |
| `API_KEY_SECRET` | Hash/validacao de API Keys |
| `WORKER_SECRET` | Segredo interno reservado entre servicos |
| `SESSION_STORAGE_PATH` | Pasta de sessoes Baileys |

Em producao, troque todos os secrets `change-me-*`.

## Conta seed

Criada com `yarn db:seed`:

```txt
E-mail: admin@ravoxzap.local
Senha: ravoxzap123
Organizacao: Ravox Labs
```

Voce pode mudar esses valores no `.env`:

```env
SEED_ADMIN_NAME="Max"
SEED_ADMIN_EMAIL="admin@ravoxzap.local"
SEED_ADMIN_PASSWORD="ravoxzap123"
SEED_ORGANIZATION_NAME="Ravox Labs"
```

## Teste real com WhatsApp

1. Suba Postgres e Redis com `docker compose up -d`.
2. Suba o projeto com `yarn dev`.
3. Acesse `http://localhost:3004`.
4. Entre com a conta seed ou cadastre uma conta.
5. Crie uma instancia em `Instancias`.
6. Abra a instancia e escaneie o QR Code pelo WhatsApp do celular em **Aparelhos conectados**.
7. Quando ficar `Conectada`, use `Conversas` para enviar texto, imagem, audio, video ou documento.

As sessoes ficam em:

```txt
storage/sessions/{instanceId}
```

Midias ficam em:

```txt
storage/media/{instanceId}
```

Para forcar um QR novo, use a opcao de limpar sessao no painel. Em ultimo caso, pare o worker, remova a pasta da instancia em `storage/sessions/{instanceId}` e suba novamente.

## API publica

Crie uma API Key no painel e use:

```http
Authorization: Bearer ravox_live_xxxxx
```

Endpoints disponiveis hoje:

```txt
POST /v1/instances/:instanceId/send-text
POST /v1/instances/:instanceId/send-image
POST /v1/instances/:instanceId/send-audio
POST /v1/instances/:instanceId/send-video
POST /v1/instances/:instanceId/send-document

GET  /v1/instances/:instanceId/status
GET  /v1/instances/:instanceId/qrcode
POST /v1/instances/:instanceId/restart
POST /v1/instances/:instanceId/logout

GET  /v1/instances/:instanceId/chats
GET  /v1/instances/:instanceId/chats/:chatId/messages
```

A documentacao visual da API publica fica em:

```txt
http://localhost:3004/docs
```

## Scripts

```bash
yarn dev
yarn dev:web
yarn dev:api
yarn dev:worker

yarn build
yarn lint
yarn check
yarn test

yarn db:generate
yarn db:migrate
yarn db:seed
yarn db:studio
```

Observacao: no Yarn 1, use `yarn run check`, `yarn run lint` e `yarn run build` se quiser garantir que o script do projeto sera executado. O comando `yarn check` sozinho e um comando interno do Yarn.

## Migracoes e banco

Criar/aplicar migracoes:

```bash
yarn db:migrate
```

Abrir Prisma Studio:

```bash
yarn db:studio
```

Regerar Prisma Client:

```bash
yarn db:generate
```

## Estrutura

```txt
apps/
  api/       API Fastify privada/publica
  web/       Painel React/Vite
  worker/    Worker Baileys + BullMQ

packages/
  auth/
  config/
  database/
  logger/
  queue/
  shared/
  whatsapp/

storage/
  media/     arquivos enviados/recebidos
  sessions/  credenciais e estado do WhatsApp Web
```

## Troubleshooting

### O QR Code abre, mas o WhatsApp diz que nao pode conectar

Gere um novo QR pelo painel. Se continuar, limpe a sessao da instancia e tente novamente. O QR expira rapido e o WhatsApp tambem pode bloquear novas conexoes temporariamente.

### Audio aparece no painel, mas nao chega no WhatsApp

Verifique se o worker foi reiniciado depois das alteracoes e se `ffmpeg` esta instalado no ambiente do worker.

Local:

```bash
ffmpeg -version
yarn dev:worker
```

### Mensagem fica enfileirada

Confirme se Redis, API e worker estao rodando:

```bash
docker compose ps
yarn dev:worker
```

### API nao conecta no banco

Confirme se os servicos estao ativos e se o `.env` usa as portas locais do Compose:

```env
DATABASE_URL="postgresql://ravoxzap:ravoxzap@localhost:25432/ravoxzap"
REDIS_URL="redis://localhost:26379"
```

### Nao suba sessoes para o Git

Os arquivos em `storage/sessions` sao credenciais do WhatsApp Web. Eles ficam ignorados no `.gitignore` e nao devem ser commitados.

## Aviso importante

O RavoxZap usa Baileys/WhatsApp Web. Nao e a API oficial Cloud da Meta. Use com responsabilidade, evite disparos em massa e prefira testes controlados.
