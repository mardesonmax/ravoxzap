import 'dotenv/config';

import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'packages/database/prisma/schema.prisma',
  migrations: {
    seed: 'yarn workspace @ravoxzap/database db:seed',
  },
});
