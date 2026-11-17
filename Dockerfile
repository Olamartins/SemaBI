# SemaBI — production image (Next.js standalone)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV SEMABI_MODE=prod
RUN addgroup -S semabi && adduser -S semabi -G semabi
COPY --from=builder /app/public ./public
COPY --from=builder --chown=semabi:semabi /app/.next/standalone ./
COPY --from=builder --chown=semabi:semabi /app/.next/static ./.next/static
COPY --from=builder --chown=semabi:semabi /app/prompts ./prompts
COPY --from=builder --chown=semabi:semabi /app/config ./config
USER semabi
EXPOSE 3000
CMD ["node", "server.js"]
