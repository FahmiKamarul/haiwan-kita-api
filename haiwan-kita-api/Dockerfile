# =============================================================================
#  Haiwan Kita API — Lean Single-Stage Dockerfile
# =============================================================================
FROM node:20-alpine

WORKDIR /app

# Install native tools (openssl for prisma, python/make/g++ for bcrypt)
RUN apk add --no-cache openssl python3 make g++

# Copy everything
COPY . .

# All-in-one build step to prevent Docker from storing large intermediate layers
# 1. Install all deps (PUPPETEER_SKIP_DOWNLOAD=true prevents 1GB chromium download)
# 2. Generate Prisma client
# 3. Compile TS to JS
# 4. Prune devDependencies (including puppeteer, typescript) to shrink image
# 5. Clean npm cache
# 6. Remove native build tools
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm ci && \
    npx prisma generate && \
    npm run build && \
    npm prune --omit=dev && \
    npm cache clean --force && \
    apk del python3 make g++

# Security — run as a non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

ENV NODE_ENV=production
EXPOSE 3000

# Healthcheck — ping the Fastify server
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>{if(!r.ok)throw new Error();process.exit(0)}).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]

