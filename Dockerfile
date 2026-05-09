FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV MCP_PORT=8787

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

EXPOSE 8787

USER node

CMD ["node", "src/index.mjs"]
