FROM node:24-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json yarn.lock* turbo.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages packages
RUN yarn install --frozen-lockfile

FROM deps AS build
COPY apps/worker apps/worker
RUN yarn workspace @ravoxzap/worker build

FROM base AS runner
COPY --from=build /app /app
CMD ["yarn", "workspace", "@ravoxzap/worker", "start"]
