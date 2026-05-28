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
