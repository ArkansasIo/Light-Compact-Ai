# ---- build: compile TypeScript and train the model ----
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json compact.config.json ./
COPY src ./src
COPY data ./data
RUN npm run build && node dist/cli/train.js

# ---- runtime: compiled code, config and the trained model only ----
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json compact.config.json ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/data ./data
COPY --from=build /app/models ./models
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
