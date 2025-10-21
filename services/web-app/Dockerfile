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
RUN bun web-app:build

FROM base AS production
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl

# Copy dependency files and install (cached if unchanged)
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/bun.lockb ./bun.lockb
RUN bun install --production --ignore-scripts

# Copy generated Prisma client (overwrites partial install)
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma

# Copy prisma schema/package
COPY --from=build /app/packages/prisma ./packages/prisma

# Copy build artifacts and scripts (changes most frequently)
COPY --from=build /app/services/web-app/build ./services/web-app/build
COPY --from=build /app/services/web-app/package.json ./services/web-app/package.json
COPY --from=build /app/services/web-app/start.sh ./services/web-app/start.sh
RUN chmod +x services/web-app/start.sh

EXPOSE 8080
CMD ["bash", "services/web-app/start.sh"]
