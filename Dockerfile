FROM node:20-alpine

WORKDIR /app

RUN npm install -g pnpm@latest

COPY . .

# Force allow all build scripts (this fixes the esbuild error)
RUN pnpm config set only-built-dependencies "*"

RUN pnpm install --no-frozen-lockfile

RUN pnpm --filter @workspace/api-server run build

CMD ["pnpm", "--filter", "@workspace/api-server", "start"]
