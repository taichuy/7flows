FROM node:22-alpine

WORKDIR /app

COPY package.json ./

RUN corepack enable && pnpm install

COPY . .

RUN pnpm build

EXPOSE 3000

CMD ["pnpm", "start"]
