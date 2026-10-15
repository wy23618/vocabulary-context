FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY web ./web
COPY scripts ./scripts
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 VOCAB_DATA_DIR=/data/vocabulary-context
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY skills ./skills
COPY --from=build /app/web/dist ./web/dist
RUN mkdir -p /data/vocabulary-context && chown -R node:node /data /app
USER node
VOLUME /data
EXPOSE 8787
CMD ["node", "server/index.mjs"]
