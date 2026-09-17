FROM node:20-alpine

WORKDIR /app

# Install latest pnpm
RUN npm install -g pnpm@latest

# Copy project files
COPY . .

# Allow esbuild to run its build scripts
RUN echo "only-built-dependencies[]=esbuild" > .npmrc

# Install dependencies
RUN pnpm install --no-frozen-lockfile

# Build the bot
RUN pnpm --filter @workspace/api-server run build

# Start the bot
CMD ["pnpm", "--filter", "@workspace/api-server", "start"]
