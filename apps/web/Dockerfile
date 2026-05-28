FROM node:24-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json yarn.lock* turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages packages
RUN yarn install --frozen-lockfile

FROM deps AS build
COPY apps/web apps/web
RUN yarn workspace @ravoxzap/web build

FROM base AS runner
COPY --from=build /app /app
EXPOSE 3004
CMD ["yarn", "workspace", "@ravoxzap/web", "preview"]
