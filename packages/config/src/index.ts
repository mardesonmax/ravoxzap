import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3333),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  API_BASE_URL: z.string().url(),
  WEB_BASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(16),
  API_KEY_SECRET: z.string().min(16),
  ENCRYPTION_KEY: z.string().min(16),
  WORKER_SECRET: z.string().min(16),
  SESSION_STORAGE_PATH: z.string().default('./storage/sessions'),
  BAILEYS_AUTH_STORE: z.enum(['file', 'database']).default('file'),
  CORS_ORIGINS: z.string().optional(),
  DISK: z.enum(['local', 'r2']).default('local'),
  MEDIA_STORAGE_MODE: z.enum(['archive', 'metadata_only']).default('archive'),
  MEDIA_RETENTION_DAYS: z.coerce.number().int().min(1).default(7),
  STORAGE_BASE_URL: z.string().url().optional(),
  R2_ENDPOINT: z.string().url().optional(),
  R2_REGION: z.string().default('us-east-1'),
  R2_BUCKET: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  WORKER_REPLICAS: z.coerce.number().int().min(1).default(1),
  WORKER_LOCK_TTL_MS: z.coerce.number().int().min(5000).default(30000),
  MERCADO_PAGO_ACCESS_TOKEN: z.string().optional(),
  MERCADO_PAGO_BASE_URL: z.string().url().default('https://api.mercadopago.com'),
  MERCADO_PAGO_WEBHOOK_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    console.error('Invalid environment variables:', parsed.error.format());
    process.exit(1);
  }

  return parsed.data;
}

export const env = loadEnv();
