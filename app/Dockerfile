FROM node:24-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Harden registry fetch against slow/flaky links (notably under cross-arch emulation).
# A project .npmrc is the authoritative way to set these for pnpm.
RUN printf 'fetch-timeout=600000\nfetch-retries=5\nfetch-retry-maxtimeout=120000\nnetwork-concurrency=4\n' > .npmrc
RUN pnpm install --frozen-lockfile --ignore-scripts && pnpm store prune

FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ARG BUILD_ID=1
ARG BUILD_TIME
ENV NEXT_PUBLIC_BUILD_ID=$BUILD_ID
ENV NEXT_PUBLIC_BUILD_TIME=$BUILD_TIME
RUN pnpm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
