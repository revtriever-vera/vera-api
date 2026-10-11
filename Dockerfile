FROM node:22-slim AS builder
ENV HUSKY=0
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json tsconfig.scripts.json nest-cli.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build && npx tsc -p tsconfig.scripts.json

FROM node:22-slim AS runtime
ENV NODE_ENV=production HUSKY=0
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm pkg delete scripts.prepare && npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-scripts ./dist-scripts
COPY migrations ./migrations
COPY kysely.config.ts ./kysely.config.ts
COPY scripts ./scripts
USER node
EXPOSE 3333
CMD ["node", "dist/main.js"]
