FROM node:24-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json yarn.lock* turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages packages
RUN yarn install --frozen-lockfile

FROM deps AS build
COPY apps/api apps/api
RUN yarn workspace @ravoxzap/api build

FROM base AS runner
COPY --from=build /app /app
EXPOSE 3333
CMD ["yarn", "workspace", "@ravoxzap/api", "start"]
