FROM node:20-alpine

WORKDIR /app

RUN npm install -g pnpm

COPY . .

# Force allow esbuild + install in one command
RUN pnpm install --no-frozen-lockfile --config.only-built-dependencies=esbuild

RUN pnpm --filter @workspace/api-server run build

CMD ["pnpm", "--filter", "@workspace/api-server", "start"]
