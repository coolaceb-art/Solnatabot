FROM node:20-alpine

WORKDIR /app

RUN npm install -g pnpm@latest

COPY . .

# Force scripts to run (this should fix the esbuild error)
RUN pnpm install --no-frozen-lockfile --ignore-scripts=false

RUN pnpm --filter @workspace/api-server run build

CMD ["pnpm", "--filter", "@workspace/api-server", "start"]
