FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy everything
COPY . .

# Install without frozen lockfile
RUN pnpm install --no-frozen-lockfile

# Build the api-server
RUN pnpm --filter @workspace/api-server run build

# Start the server
CMD ["pnpm", "--filter", "@workspace/api-server", "start"]
