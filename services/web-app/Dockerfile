FROM oven/bun:1 AS base
RUN apt-get update -y && apt-get install -y openssl
ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}

FROM base AS build
WORKDIR /app
COPY package.json bun.lockb ./
COPY services/web-app ./services/web-app
COPY packages/prisma ./packages/prisma
RUN bun install --ignore-scripts
RUN bun prisma:generate
RUN echo "=== Checking Prisma generation locations ===" && \
    find . -name ".prisma" -type d && \
    find . -path "*/node_modules/@prisma/client" -type d
RUN bun web-app:build

FROM base AS production
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl

# Copy dependency files and install (cached if unchanged)
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/bun.lockb ./bun.lockb
RUN bun install --production --ignore-scripts

# Copy prisma schema/package (without node_modules first)
COPY --from=build /app/packages/prisma/schema.prisma ./packages/prisma/schema.prisma
COPY --from=build /app/packages/prisma/package.json ./packages/prisma/package.json
COPY --from=build /app/packages/prisma/index.ts ./packages/prisma/index.ts

# Copy generated Prisma client from packages/prisma workspace
COPY --from=build /app/packages/prisma/node_modules/.prisma ./packages/prisma/node_modules/.prisma
COPY --from=build /app/packages/prisma/node_modules/@prisma ./packages/prisma/node_modules/@prisma

# Copy build artifacts and scripts (changes most frequently)
COPY --from=build /app/services/web-app/build ./services/web-app/build
COPY --from=build /app/services/web-app/package.json ./services/web-app/package.json
COPY --from=build /app/services/web-app/start.sh ./services/web-app/start.sh
RUN chmod +x services/web-app/start.sh

EXPOSE 8080
CMD ["bash", "services/web-app/start.sh"]
