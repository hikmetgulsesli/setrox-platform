# Build stage
FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl openssl-dev

COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma

RUN npm ci

COPY src ./src

RUN npx prisma generate && npm run build && npm prune --production

# Production stage
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
RUN apk add --no-cache openssl curl

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD curl -f http://localhost:4000/health || exit 1

EXPOSE 4000
USER node

CMD ["node", "dist/index.js"]
