FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy application files
COPY . .

# Build Vite frontend
RUN npm run build

# Expose port
EXPOSE 3000

# Start Express server
CMD ["node", "server.cjs"]
