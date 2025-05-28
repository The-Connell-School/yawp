FROM oven/bun:1 AS base

FROM base AS build
WORKDIR /app
COPY package.json bun.lockb ./
COPY services/web-app ./services/web-app
COPY packages/prisma ./packages/prisma

RUN bun install --filter "./services/web-app" --filter "./packages/prisma"
RUN bun web-app:build

FROM base AS production
WORKDIR /app
COPY package.json bun.lockb ./
COPY packages/prisma ./packages/prisma
COPY --from=build /app/services/web-app/build ./services/web-app/build
COPY --from=build /app/services/web-app/package.json ./services/web-app/package.json
ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}
RUN bun install --filter "./services/web-app" --filter "./packages/prisma" --production
RUN bun prisma:generate
CMD ["bun", "web-app:start"]
