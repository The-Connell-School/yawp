FROM oven/bun:1.3.1 AS base
RUN apt-get update -y && apt-get install -y openssl

FROM base AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY services/web-app ./services/web-app
COPY packages/prisma ./packages/prisma
COPY scripts/preview/free-tier-ship-review-seed-guard.mjs ./scripts/preview/free-tier-ship-review-seed-guard.mjs
RUN bun install --ignore-scripts
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build bun prisma generate

FROM deps AS build
ENV NODE_OPTIONS=--max-old-space-size=1280
RUN bun web-app:build

FROM base AS production
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/bun.lock ./bun.lock
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/prisma ./packages/prisma
COPY --from=build /app/services/web-app/build ./services/web-app/build
COPY --from=build /app/services/web-app/build/client ./build/client
COPY --from=build /app/services/web-app/node_modules ./services/web-app/node_modules
COPY --from=build /app/services/web-app/package.json ./services/web-app/package.json
COPY --from=build /app/services/web-app/start.sh ./services/web-app/start.sh
COPY --from=build /app/scripts/preview ./scripts/preview

RUN chmod +x services/web-app/start.sh

EXPOSE 8080
CMD ["bash", "services/web-app/start.sh"]
