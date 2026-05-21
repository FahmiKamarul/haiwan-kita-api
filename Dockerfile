# =============================================================================
#  Haiwan Kita API — Multi-Stage Production Dockerfile
# =============================================================================
#  Stack: Node 20 · TypeScript · Fastify · Prisma · MySQL
# =============================================================================

# ---------------------------------------------------------------------------
#  Stage 1 — Install ALL dependencies (dev + prod) & generate Prisma client
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps

WORKDIR /app

# Install native build tools required by bcrypt
RUN apk add --no-cache python3 make g++

# Copy dependency manifests first (maximise Docker layer cache)
COPY package.json package-lock.json ./

# Install every dependency (devDependencies are needed for the build stage)
RUN npm ci

# Copy Prisma schema & generate the client
COPY prisma ./prisma
RUN npx prisma generate

# ---------------------------------------------------------------------------
#  Stage 2 — Build the TypeScript source into JavaScript
# ---------------------------------------------------------------------------
FROM deps AS builder

WORKDIR /app

# Copy the full source tree
COPY tsconfig.json ./
COPY src ./src

# Compile TS → JS into /app/dist
RUN npm run build

# ---------------------------------------------------------------------------
#  Stage 3 — Lean production image
# ---------------------------------------------------------------------------
FROM node:20-alpine AS production

WORKDIR /app

# Install native build tools for bcrypt compilation + openssl for Prisma engine
RUN apk add --no-cache python3 make g++ openssl

# Copy only production dependency manifests & install
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Install Prisma CLI globally (it's a devDep, but we need it for migrations)
RUN npm install -g prisma@5

# Copy the Prisma schema (needed for generate + migrations)
COPY prisma ./prisma

# Generate the Prisma Client inside this stage so the query engine
# binary matches the production Alpine's native libraries
RUN prisma generate

# Copy compiled JS from the builder stage
COPY --from=builder /app/dist ./dist

# Remove build toolchain to slim down the image (keep openssl — Prisma needs it)
RUN apk del python3 make g++

# ---------------------------------------------------------------------------
#  Security — run as a non-root user
# ---------------------------------------------------------------------------
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# ---------------------------------------------------------------------------
#  Runtime
# ---------------------------------------------------------------------------
ENV NODE_ENV=production
EXPOSE 3000

# Healthcheck — ping the Fastify server
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>{if(!r.ok)throw new Error();process.exit(0)}).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]

