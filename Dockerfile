FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for building)
RUN npm ci

# Copy application files
COPY . .

# Build the application
RUN npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built assets and necessary files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/server ./server
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts

# Create logs directory
RUN mkdir -p logs && \
    chown -R node:node /app

# Switch to non-root user
USER node

# Set environment to production
ENV NODE_ENV=production

# Expose port (Render uses PORT env var)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/healthz', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start the application with proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start"]