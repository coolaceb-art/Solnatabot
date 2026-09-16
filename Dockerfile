FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy everything
COPY . .

# Force allow esbuild build scripts
RUN pnpm config set only-built-dependencies esbuild

# Install
RUN pnpm install --no-frozen-lockfile

# Build the api-server
RUN pnpm --filter @workspace/api-server run build

# Start
CMD ["pnpm", "--filter", "@workspace/api-server", "start"]
