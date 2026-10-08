# Marketing renderer worker.
#
# Playwright's image already carries Chromium and its system libraries; ffmpeg
# is added for the phase-two H.264 transcode (the ffmpeg Playwright ships is a
# WebM-only build and cannot encode H.264).
FROM mcr.microsoft.com/playwright:v1.49.0-jammy

ENV NODE_ENV=production \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg curl unzip \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app

# Workspace manifests first, so dependency install caches across code changes.
COPY package.json bun.lock bunfig.toml ./
COPY packages/prisma/package.json packages/prisma/
COPY packages/marketing-media/package.json packages/marketing-media/
COPY services/marketing-renderer/package.json services/marketing-renderer/
RUN bun install --frozen-lockfile

COPY packages/prisma packages/prisma
COPY packages/marketing-media packages/marketing-media
COPY services/marketing-renderer services/marketing-renderer

RUN bun run --cwd packages/prisma generate

# Renders write to a temp directory and are deleted after upload.
ENV MARKETING_RENDERER_POLL_MS=5000

CMD ["bun", "run", "--cwd", "services/marketing-renderer", "start"]
