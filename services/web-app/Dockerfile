FROM oven/bun:1.4.4 AS base
RUN apt-get update -y && apt-get install -y openssl

FROM base AS deps
WORKDIR /app
ARG NODE_VERSION=22.23.4
RUN apt-get update -y && apt-get install -y ca-certificates curl xz-utils \
  && ARCH="$(dpkg --print-architecture)" \
  && case "${ARCH}" in \
       amd64) NODE_DIST_ARCH=linux-x64; NODE_SHA256=1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce ;; \
       arm64) NODE_DIST_ARCH=linux-arm64; NODE_SHA256=6287aa46b6c375d816e63ae66d024fbbfd70404825aabdfdf898a970871d2f4b ;; \
       *) echo "unsupported architecture: ${ARCH}" >&2; exit 1 ;; \
     esac \
  && curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${NODE_DIST_ARCH}.tar.xz" \
  && echo "${NODE_SHA256}  node-v${NODE_VERSION}-${NODE_DIST_ARCH}.tar.xz" | sha256sum -c - \
  && tar -xJf "node-v${NODE_VERSION}-${NODE_DIST_ARCH}.tar.xz" -C /usr/local --strip-components=1 \
  && rm "node-v${NODE_VERSION}-${NODE_DIST_ARCH}.tar.xz" \
  && node --version
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
ENV YAWP_ENVIRONMENT=$YAWP_ENVIRONMENT
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
# Bun 1.4+ hoists workspace deps to /app/node_modules; nested copies may be absent.
RUN mkdir -p services/web-app/node_modules
COPY --from=build /app/services/web-app/package.json ./services/web-app/package.json
COPY --from=build /app/services/web-app/start.sh ./services/web-app/start.sh
COPY --from=build /app/scripts/preview ./scripts/preview

RUN chmod +x services/web-app/start.sh

EXPOSE 8080
ARG YAWP_ENVIRONMENT=production
ARG YAWP_GIT_COMMIT=unknown
ARG YAWP_BUILT_AT=unknown
ENV YAWP_ENVIRONMENT=$YAWP_ENVIRONMENT
ENV YAWP_GIT_COMMIT=$YAWP_GIT_COMMIT
ENV YAWP_BUILT_AT=$YAWP_BUILT_AT
CMD ["bash", "services/web-app/start.sh"]
