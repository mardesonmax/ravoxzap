# RavoxZap

Gateway/API multiusuário de WhatsApp via QR Code, com Dashboard administrativo, API pública, filas, worker Baileys, webhooks, envio de mídia e histórico de mensagens.

## Stack

- Monorepo com Yarn Workspaces + Turbo
- API Fastify + Zod + Prisma + PostgreSQL
- Worker Node.js + BullMQ + Redis + Baileys
- Dashboard React/Vite + TanStack Query + Tailwind 4
- RavoxChat React/Vite para testar a API pública
- Storage local em `storage/media` e `storage/sessions`

## Portas

| Serviço | URL |
| --- | --- |
| Dashboard | `http://localhost:3004` |
| RavoxChat | `http://localhost:3005` |
| Docs públicas | `http://localhost:3004/docs` |
| API | `http://localhost:3334` |
| Docs técnica da API | `http://localhost:3334/docs` |
| Postgres local | `localhost:25432` |
| Redis local | `localhost:26379` |

## Opção recomendada para desenvolvimento

Use Node/Yarn no host e Docker apenas para Postgres e Redis. Essa é a forma padrão do projeto: os serviços ficam em containers, enquanto Dashboard, API e worker rodam localmente com recarregamento rápido.

### Requisitos

- Node.js 24 ou superior
- Yarn 1.22.22
- Docker Desktop ou Docker Engine
- ffmpeg no host para envio de áudio gravado pelo painel

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
- `apps/dashboard` em `http://localhost:3004`
- `apps/ravoxchat` em `http://localhost:3005`
- `apps/worker` processando WhatsApp, filas e webhooks

Se quiser subir apenas o RavoxChat em outro terminal, use `yarn dev:chat`.

## Docker local

O `docker-compose.yml` sobe somente as dependências locais:

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

Para parar os serviços:

```bash
docker compose down
```

Para apagar também os dados do banco local:

```bash
docker compose down -v
```

## Variáveis de ambiente

Use `.env.example` como base para o `.env` local.

Principais variáveis:

| Variável | Uso |
| --- | --- |
| `DATABASE_URL` | Conexão PostgreSQL |
| `REDIS_URL` | Conexão Redis/BullMQ |
| `PORT` | Porta da API |
| `API_BASE_URL` | URL pública da API |
| `WEB_BASE_URL` | URL pública do Dashboard |
| `VITE_API_BASE_URL` | URL da API usada pelo browser |
| `JWT_SECRET` | Assinatura da sessão do painel |
| `API_KEY_SECRET` | Hash/validação de API Keys |
| `WORKER_SECRET` | Segredo interno reservado entre serviços |
| `SESSION_STORAGE_PATH` | Pasta de sessões Baileys |

Em produção, troque todos os secrets `change-me-*`.

## Conta seed

Criada com `yarn db:seed`:

```txt
E-mail: admin@ravoxzap.local
Senha: ravoxzap123
Organização: Ravox Labs
```

Você pode mudar esses valores no `.env`:

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
5. Crie uma instância em `Instâncias`.
6. Abra a instância e escaneie o QR Code pelo WhatsApp do celular em **Aparelhos conectados**.
7. Quando ficar `Conectada`, crie uma API Key no Dashboard.
8. Abra o RavoxChat em `http://localhost:3005` e informe `API Base URL`, `API Key` e `Instance ID`.
9. Use o RavoxChat para testar envio de texto, imagem, áudio, vídeo ou documento pela API pública.

As sessões ficam em:

```txt
storage/sessions/{instanceId}
```

Mídias ficam em:

```txt
storage/media/{instanceId}
```

Para forçar um QR novo, use a opção de limpar sessão no painel. Em último caso, pare o worker, remova a pasta da instância em `storage/sessions/{instanceId}` e suba novamente.

## API pública

Crie uma API Key no painel e use:

```http
Authorization: Bearer ravox_live_xxxxx
```

Para enviar mensagens, use o campo `to` em formato internacional. No Brasil, o formato é `+55 + DDD + número`.

```json
{
  "to": "+5585999999999",
  "body": "Olá"
}
```

Também é aceito enviar somente dígitos:

```json
{
  "to": "5585999999999",
  "body": "Olá"
}
```

Principais endpoints disponíveis hoje:

```txt
POST /v1/instances/:instanceId/send-text
POST /v1/instances/:instanceId/send-image
POST /v1/instances/:instanceId/send-audio
POST /v1/instances/:instanceId/send-video
POST /v1/instances/:instanceId/send-document
POST /v1/instances/:instanceId/send-location
POST /v1/instances/:instanceId/send-contact
POST /v1/instances/:instanceId/send-contacts
POST /v1/instances/:instanceId/send-sticker
POST /v1/instances/:instanceId/send-gif
POST /v1/instances/:instanceId/send-link
POST /v1/instances/:instanceId/send-reaction
POST /v1/instances/:instanceId/remove-reaction
POST /v1/instances/:instanceId/send-poll
POST /v1/instances/:instanceId/send-ptv
POST /v1/instances/:instanceId/messages/reply
POST /v1/instances/:instanceId/messages/forward
POST /v1/instances/:instanceId/messages/delete
POST /v1/instances/:instanceId/messages/read
POST /v1/instances/:instanceId/messages/pin

GET  /v1/instances/:instanceId/status
GET  /v1/instances/:instanceId/qrcode
GET  /v1/instances/:instanceId/me
GET  /v1/instances/:instanceId/device
POST /v1/instances/:instanceId/pairing-code
POST /v1/instances/:instanceId/profile/name
POST /v1/instances/:instanceId/profile/description
POST /v1/instances/:instanceId/profile/picture
POST /v1/instances/:instanceId/profile/picture/remove
POST /v1/instances/:instanceId/restart
POST /v1/instances/:instanceId/logout

POST /v1/instances/:instanceId/status/send-text
POST /v1/instances/:instanceId/status/send-image
POST /v1/instances/:instanceId/status/send-video
POST /v1/instances/:instanceId/status/reply-text
POST /v1/instances/:instanceId/status/reply-sticker
POST /v1/instances/:instanceId/status/reply-gif

POST /v1/instances/:instanceId/contacts/check
POST /v1/instances/:instanceId/contacts/check-batch
POST /v1/instances/:instanceId/contacts
DELETE /v1/instances/:instanceId/contacts/:phone
GET  /v1/instances/:instanceId/contacts/:phone/metadata
GET  /v1/instances/:instanceId/contacts/:phone/profile-picture
POST /v1/instances/:instanceId/contacts/:phone/block
POST /v1/instances/:instanceId/contacts/:phone/unblock

GET  /v1/instances/:instanceId/privacy
GET  /v1/instances/:instanceId/privacy/blocklist
POST /v1/instances/:instanceId/privacy/last-seen
POST /v1/instances/:instanceId/privacy/online
POST /v1/instances/:instanceId/privacy/profile-picture
POST /v1/instances/:instanceId/privacy/status
POST /v1/instances/:instanceId/privacy/read-receipts
POST /v1/instances/:instanceId/privacy/group-add
POST /v1/instances/:instanceId/privacy/default-disappearing

GET  /v1/instances/:instanceId/groups
POST /v1/instances/:instanceId/groups
POST /v1/instances/:instanceId/groups/sync
POST /v1/instances/:instanceId/groups/invite/accept
POST /v1/instances/:instanceId/groups/invite/metadata
GET  /v1/instances/:instanceId/groups/:groupId/metadata/light
POST /v1/instances/:instanceId/groups/:groupId/metadata/sync
POST /v1/instances/:instanceId/groups/:groupId/photo
POST /v1/instances/:instanceId/groups/:groupId/settings
POST /v1/instances/:instanceId/groups/:groupId/requests/list
POST /v1/instances/:instanceId/groups/:groupId/requests/approve
POST /v1/instances/:instanceId/groups/:groupId/requests/reject

POST /v1/instances/:instanceId/communities
POST /v1/instances/:instanceId/communities/sync
POST /v1/instances/:instanceId/communities/invite/accept
GET  /v1/instances/:instanceId/communities/:communityId
POST /v1/instances/:instanceId/communities/:communityId/settings
POST /v1/instances/:instanceId/communities/:communityId/groups/link
POST /v1/instances/:instanceId/communities/:communityId/groups/unlink

GET  /v1/instances/:instanceId/newsletters
POST /v1/instances/:instanceId/newsletters
POST /v1/instances/:instanceId/newsletters/search
GET  /v1/instances/:instanceId/newsletters/:newsletterId
POST /v1/instances/:instanceId/newsletters/:newsletterId/follow
POST /v1/instances/:instanceId/newsletters/:newsletterId/unfollow
POST /v1/instances/:instanceId/newsletters/:newsletterId/mute
POST /v1/instances/:instanceId/newsletters/:newsletterId/unmute
GET  /v1/instances/:instanceId/newsletters/:newsletterId/messages

GET  /v1/instances/:instanceId/business/profile
PATCH /v1/instances/:instanceId/business/profile
GET  /v1/instances/:instanceId/business/products
POST /v1/instances/:instanceId/business/products
GET  /v1/instances/:instanceId/business/products/:productId
PATCH /v1/instances/:instanceId/business/products/:productId
DELETE /v1/instances/:instanceId/business/products/:productId
GET  /v1/instances/:instanceId/business/collections
POST /v1/instances/:instanceId/business/tags

GET  /v1/instances/:instanceId/queue
DELETE /v1/instances/:instanceId/queue
GET  /v1/instances/:instanceId/queue/settings
PATCH /v1/instances/:instanceId/queue/settings
DELETE /v1/instances/:instanceId/queue/:queueItemId

GET  /v1/instances/:instanceId/chats
GET  /v1/instances/:instanceId/chats/:chatId/messages
GET  /v1/instances/:instanceId/operations/:operationId
```

Operações do WhatsApp que dependem de estado real do socket são assíncronas: a resposta traz `operationId` e o resultado final deve ser consultado em `/v1/instances/:instanceId/operations/:operationId`.

Algumas capacidades aparecem como endpoint, mas falham explicitamente enquanto o adapter Baileys não oferecer suporte confiável, por exemplo voto em enquete, denunciar contato, busca pública de canais e aceite genérico de convite admin de canal.

A documentação visual da API pública fica em:

```txt
http://localhost:3004/docs
```

## Scripts

```bash
yarn dev
yarn dev:dashboard
yarn dev:chat
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

Observação: no Yarn 1, use `yarn run check`, `yarn run lint` e `yarn run build` se quiser garantir que o script do projeto será executado. O comando `yarn check` sozinho é um comando interno do Yarn.

## Migrações e banco

Criar/aplicar migrações:

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
  api/       API Fastify privada/pública
  dashboard/ Painel administrativo React/Vite
  ravoxchat/ Cliente de teste da API pública
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

## Solução de problemas

### O QR Code abre, mas o WhatsApp diz que não pode conectar

Gere um novo QR pelo painel. Se continuar, limpe a sessão da instância e tente novamente. O QR expira rápido e o WhatsApp também pode bloquear novas conexões temporariamente.

### Áudio aparece no painel, mas não chega no WhatsApp

Verifique se o worker foi reiniciado depois das alterações e se `ffmpeg` está instalado no ambiente do worker.

Local:

```bash
ffmpeg -version
yarn dev:worker
```

### Mensagem fica enfileirada

Confirme se Redis, API e worker estão rodando:

```bash
docker compose ps
yarn dev:worker
```

### API não conecta no banco

Confirme se os serviços estão ativos e se o `.env` usa as portas locais do Compose:

```env
DATABASE_URL="postgresql://ravoxzap:ravoxzap@localhost:25432/ravoxzap"
REDIS_URL="redis://localhost:26379"
```

### Não suba sessões para o Git

Os arquivos em `storage/sessions` são credenciais do WhatsApp Web. Eles ficam ignorados no `.gitignore` e não devem ser commitados.

## Aviso importante

O RavoxZap usa Baileys/WhatsApp Web. Não é a API oficial Cloud da Meta. Use com responsabilidade, evite disparos em massa e prefira testes controlados.
