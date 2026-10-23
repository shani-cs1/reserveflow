# ==============================================================================
# Multi-stage Production Dockerfile for ReserveFlow
# Candidate: Zeeshan Haider (Role: Junior Full-Stack / Backend Engineer)
# ==============================================================================

# Stage 1: Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package manifests
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Copy source code and configuration
COPY tsconfig.json vite.config.ts drizzle.config.ts index.html ./
COPY src ./src
COPY scripts ./scripts
COPY drizzle ./drizzle

# Build frontend and compile client bundle
RUN npm run build

# Stage 2: Production runtime stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

# Install curl for container health check
RUN apk add --no-cache curl

# Copy dependencies and source files
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy built frontend assets and runtime source code
COPY --from=builder /app/dist ./dist
COPY server.ts index.html ./
COPY src ./src
COPY drizzle ./drizzle
COPY scripts ./scripts

# Secure non-root user execution
USER node

# Expose HTTP API & Frontend port
EXPOSE 3000

# Container health check probe targeting /health/ready
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health/ready || exit 1

# Start full-stack Node.js server
CMD ["npx", "tsx", "server.ts"]
