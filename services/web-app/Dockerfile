FROM oven/bun:1.3.1 AS base
RUN apt-get update -y && apt-get install -y openssl
ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}

FROM base AS deps
WORKDIR /app
COPY package.json bun.lockb ./
COPY services/web-app ./services/web-app
COPY packages/prisma ./packages/prisma
# The marketing studio routes import this package by relative path, so the
# server build cannot resolve without it in the image.
COPY packages/marketing-media ./packages/marketing-media
RUN bun install --ignore-scripts
RUN bun prisma generate

FROM deps AS build
ENV NODE_OPTIONS=--max-old-space-size=1280
RUN bun web-app:build

FROM base AS production
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/bun.lockb ./bun.lockb
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/prisma ./packages/prisma
COPY --from=build /app/services/web-app/build ./services/web-app/build
COPY --from=build /app/services/web-app/build/client ./build/client
COPY --from=build /app/services/web-app/node_modules ./services/web-app/node_modules
COPY --from=build /app/services/web-app/package.json ./services/web-app/package.json
COPY --from=build /app/services/web-app/start.sh ./services/web-app/start.sh

RUN chmod +x services/web-app/start.sh

EXPOSE 8080
CMD ["bash", "services/web-app/start.sh"]
