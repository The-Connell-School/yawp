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
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/web-app/build ./services/web-app/build
COPY --from=build /app/services/web-app/package.json ./services/web-app/package.json
COPY --from=build /app/packages/prisma ./packages/prisma
EXPOSE 8080
CMD ["bun", "run", "web-app:start"]
