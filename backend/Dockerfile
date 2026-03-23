# Stage 1: Build admin React UI
FROM node:20-slim AS admin-build

WORKDIR /app/admin
COPY admin/package*.json ./
RUN npm ci
COPY admin/ ./
RUN npm run build

# Stage 2: Production runtime
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/

# Copy built admin UI from stage 1
COPY --from=admin-build /app/admin/dist ./admin/dist

EXPOSE 8080

CMD ["node", "src/index.js"]
