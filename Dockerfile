FROM node:20-alpine

WORKDIR /app

RUN npm install -g pnpm@latest

COPY . .

# Config + Install in the same command (prevents cache skip)
RUN pnpm config set only-built-dependencies "*" && pnpm install --no-frozen-lockfile

RUN pnpm --filter @workspace/api-server run build

CMD ["pnpm", "--filter", "@workspace/api-server", "start"]
