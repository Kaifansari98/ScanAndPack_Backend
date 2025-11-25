# -------------------------
# 2️⃣ Production Runtime Image
# -------------------------
FROM node:20-alpine AS prod
WORKDIR /app

RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install ONLY production deps — but without prune
RUN pnpm install --prod --no-optional

# Copy build output (dist)
COPY --from=builder /app/dist ./dist

# Copy Prisma schema
COPY --from=builder /app/prisma ./prisma

# ⭐ Copy node_modules COMPLETELY from builder
# This includes:
# - @prisma/client
# - Prisma runtime
# - Prisma binaries
# - pnpm virtual store structure
COPY --from=builder /app/node_modules ./node_modules

# Internal port
EXPOSE 7777

CMD ["node", "dist/server.js"]
