FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY server.mjs ./
COPY README.md ./
COPY public ./public
COPY data ./data

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3010

EXPOSE 3010

CMD ["node", "server.mjs"]
