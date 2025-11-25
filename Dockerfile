# -------------------------
# 1️⃣ Base Builder Image
# -------------------------
FROM node:20-alpine AS builder
WORKDIR /app

# Install required tools
RUN apk add --no-cache openssl

# Enable pnpm globally
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install deps (including dev deps)
RUN pnpm install

# Copy rest of the project
COPY . .

# Generate Prisma Client
RUN pnpm prisma generate

# Build the backend (ts → js)
RUN pnpm build

# -------------------------
# 2️⃣ Production Runtime Image
# -------------------------
FROM node:20-alpine AS prod
WORKDIR /app

RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install ONLY production dependencies
RUN pnpm install --prod

# Copy build output
COPY --from=builder /app/dist ./dist

# Copy prisma client + schema (required for migrations)
COPY --from=builder /app/prisma ./prisma

# Copy Prisma Client from builder
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# ⬅ IMPORTANT: YOUR BACKEND PORT
EXPOSE 7777

# Start server
CMD ["node", "dist/server.js"]
