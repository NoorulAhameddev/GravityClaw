# Use official Node.js 20 image as base
FROM node:20-slim

# Install system dependencies for better-sqlite3 and playwright
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    curl \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libpango-1.0-0 \
    libcairo2 \
    libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Install Playwright browsers (only for automation tools)
RUN npx playwright install --with-deps chromium

# Copy project files
COPY . .

# Set environment to production
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=512"

# Create non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup && \
    chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Expose ports (3000 for webhooks/canvas, etc.)
EXPOSE 3000

# Health check - verify API responds
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Start command
CMD ["npm", "start"]