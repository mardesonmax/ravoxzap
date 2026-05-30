# RavoxZap Production Infra

Infraestrutura de producao do RavoxZap no padrao usado pelo TorneioX.

## O que este stack cria

- Artifact Registry com imagens `api` e `worker`.
- Cloud SQL PostgreSQL 16 single-zone, private IP, backups e Query Insights.
- Memorystore Redis para BullMQ e lock de instancias WhatsApp.
- Cloud Run publico para a API.
- Cloud Run Job para `prisma migrate deploy`.
- GKE Autopilot para o worker WhatsApp/Baileys.
- Secret Manager para banco, Redis, JWT, API keys, criptografia e R2.
- Budget alerts e alertas basicos de Cloud SQL, Cloud Run e GKE.
- Trigger opcional do Cloud Build apontando para `cloudbuild.yaml`.

Os frontends `apps/dashboard` e `apps/ravoxchat` continuam fora do Pulumi e devem ser publicados na Vercel. Configure neles:

```bash
VITE_API_BASE_URL=https://api.seudominio.com
```

## R2 e midia

O Pulumi GCP nao cria o bucket R2. Crie o bucket no Cloudflare R2 e configure lifecycle de 7 dias no proprio Cloudflare.

Variaveis usadas pelos containers:

```bash
DISK=r2
MEDIA_STORAGE_MODE=archive
MEDIA_RETENTION_DAYS=7
STORAGE_BASE_URL=https://pub-seu-bucket.example.com
R2_ENDPOINT=https://account-id.r2.cloudflarestorage.com
R2_REGION=us-east-1
R2_BUCKET=ravoxzap-media
```

Midias por URL nao sao arquivadas novamente. Base64/upload e midias recebidas podem ser arquivadas no R2 e recebem `mediaExpiresAt`.

## Preparar config

```bash
cd infra/pulumi
cp .env.infra.example .env.infra.prod
$EDITOR .env.infra.prod
npm install
bash setup-infra-config.sh prod
```

Depois rode:

```bash
pulumi preview --stack prod
pulumi up --stack prod
```

## Primeiro deploy

O stack usa imagens iniciais `:latest` por padrao. Antes do primeiro `pulumi up`, publique imagens iniciais ou informe digest valido em `.env.infra.prod`.

Fluxo recomendado:

```bash
gcloud auth configure-docker southamerica-east1-docker.pkg.dev
docker build -f apps/api/Dockerfile -t southamerica-east1-docker.pkg.dev/PROJECT_ID/ravoxzap/api:latest ../..
docker build -f apps/worker/Dockerfile -t southamerica-east1-docker.pkg.dev/PROJECT_ID/ravoxzap/worker:latest ../..
docker push southamerica-east1-docker.pkg.dev/PROJECT_ID/ravoxzap/api:latest
docker push southamerica-east1-docker.pkg.dev/PROJECT_ID/ravoxzap/worker:latest
pulumi up --stack prod
```

Depois disso, o `cloudbuild.yaml` atualiza imagens, roda migrations e faz rollout da API/worker.

## Sessoes WhatsApp

Em producao, use:

```bash
BAILEYS_AUTH_STORE=database
ENCRYPTION_KEY=...
```

As credenciais e signal keys do Baileys ficam no Cloud SQL criptografadas com AES-256-GCM. `SESSION_STORAGE_PATH` fica apenas para dev/local.

## Alta disponibilidade do worker

Os pods no GKE usam lock Redis por instancia:

```text
wa:instance-lock:{instanceId}
```

Somente o pod dono do lock mantem o socket ativo. Se ele morrer, o TTL expira e outro worker pode assumir a instancia.

## Comandos uteis

```bash
npm run build
pulumi stack output --stack prod
gcloud run jobs execute ravoxzap-migrate --region southamerica-east1 --wait
kubectl rollout status deployment/ravoxzap-worker -n ravoxzap
```
