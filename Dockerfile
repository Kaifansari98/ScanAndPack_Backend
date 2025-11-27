# -------------------------
# 1️⃣ Builder Stage
# -------------------------
FROM node:24-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including devDependencies for building)
RUN pnpm install --frozen-lockfile

COPY .env ./
# Copy source code and prisma schema
COPY . .

# Generate Prisma Client
RUN pnpm prisma generate

# Build TypeScript to JavaScript
RUN pnpm build

# -------------------------
# 2️⃣ Production Runtime Image
# -------------------------
FROM node:20-alpine AS prod
WORKDIR /app

RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Copy ONLY prod deps by copying node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy build output (dist)
COPY --from=builder /app/dist ./dist

# Copy Prisma schema
COPY --from=builder /app/prisma ./prisma

# Internal port
EXPOSE 7777

CMD ["node", "dist/server.js"]