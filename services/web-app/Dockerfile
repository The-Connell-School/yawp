FROM oven/bun:1.4.3 AS base
RUN apt-get update -y && apt-get install -y openssl

FROM base AS deps
WORKDIR /app
RUN apt-get update -y && apt-get install -y ca-certificates curl gnupg \
  && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y nodejs
COPY package.json bun.lock ./
COPY services/web-app ./services/web-app
COPY packages/prisma ./packages/prisma
COPY scripts/preview/free-tier-ship-review-seed-guard.mjs ./scripts/preview/free-tier-ship-review-seed-guard.mjs
COPY scripts/preview/prisma-cli.sh ./scripts/preview/prisma-cli.sh
RUN chmod +x scripts/preview/prisma-cli.sh
RUN bun install --ignore-scripts
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build bun prisma generate

FROM deps AS build
ARG YAWP_ENVIRONMENT=production
ARG YAWP_GIT_COMMIT=unknown
ARG YAWP_BUILT_AT=unknown
ENV YAWP_ENVIRONMENT=$YAWP_ENVIRONMENT
ENV YAWP_GIT_COMMIT=$YAWP_GIT_COMMIT
ENV YAWP_BUILT_AT=$YAWP_BUILT_AT
ENV NODE_OPTIONS=--max-old-space-size=1280
RUN bun web-app:build

FROM base AS production
ARG YAWP_ENVIRONMENT=production
ARG YAWP_GIT_COMMIT=unknown
ARG YAWP_BUILT_AT=unknown
ENV YAWP_ENVIRONMENT=$YAWP_ENVIRONMENT
ENV YAWP_GIT_COMMIT=$YAWP_GIT_COMMIT
ENV YAWP_BUILT_AT=$YAWP_BUILT_AT
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/bun.lock ./bun.lock
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/prisma ./packages/prisma
COPY --from=build /app/services/web-app/build ./services/web-app/build
COPY --from=build /app/services/web-app/build/client ./build/client
# Bun 1.4+ hoists workspace deps to /app/node_modules; nested copies may be absent.
RUN mkdir -p services/web-app/node_modules
COPY --from=build /app/services/web-app/package.json ./services/web-app/package.json
COPY --from=build /app/services/web-app/start.sh ./services/web-app/start.sh
COPY --from=build /app/scripts/preview ./scripts/preview

RUN chmod +x services/web-app/start.sh

EXPOSE 8080
CMD ["bash", "services/web-app/start.sh"]
