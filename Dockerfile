# Dockerfile
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
	adduser -S nodejs -u 1001

# Copy package files
COPY package*.json ./

# Install dependencies based on NODE_ENV
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

RUN if [ "$NODE_ENV" = "development" ]; then \
        npm ci && npm cache clean --force; \
    else \
        npm ci --only=production && npm cache clean --force; \
    fi

# Copy application code
COPY . .

USER root

# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app

# Create tokens directory with proper permissions
RUN mkdir -p /app/data && \
	chown -R nodejs:nodejs /app/data && \
	chmod 755 /app/data

RUN touch /app/data/tokens.json && \
	chown nodejs:nodejs /app/data/tokens.json && \
	chmod 644 /app/data/tokens.json

# Getting permission denied with this user, even though the same user created and owns the directory. Weird.
#USER nodejs
USER root
# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

# Start the application
CMD ["npm", "start"]
